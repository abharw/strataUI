/**
 * Asset routes: reserve (`POST /v1/assets`), push bytes once to the returned URL
 * (`PUT /v1/assets/:id/bytes`), re-issue that URL, list with usage, and delete.
 */
import * as z from "zod";

import {
  AssetError,
  acceptBytes,
  committedBytes,
  list,
  reissueUpload,
  release,
  reserve,
  resolveAssetId,
  storedBytes,
} from "./index";
import { ALLOWED_MEDIA_SENTENCE } from "@/shared/assets/policy";
import {
  ALLOWED_MEDIA_TYPES,
  ASSETS_PAGE_MAX,
  MAX_ASSET_BYTES,
  MAX_ASSET_CREDIT_CHARS,
  MAX_ASSET_FILENAME_CHARS,
  MAX_ASSET_SOURCE_URL_CHARS,
  MAX_NAMESPACE_BYTES,
  UPLOAD_WINDOW_SECONDS,
} from "@/page-content/document/limits";
import { jsonPointer } from "@/shared/api/json-pointer";
import { fail, isUuid, ok, type HandlerResult } from "@/shared/api/types";

const ReserveSchema = z.strictObject({
  filename: z.string().min(1).max(MAX_ASSET_FILENAME_CHARS),
  media_type: z.string().min(1).max(120),
  size_bytes: z.number().int().positive(),
  /** Short attribution, rendered as a caption. */
  credit: z.string().trim().min(1).max(MAX_ASSET_CREDIT_CHARS).optional(),
  /** Rendered as a link beside the credit and never fetched. */
  source_url: z.url({ protocol: /^https$/ }).max(MAX_ASSET_SOURCE_URL_CHARS).optional(),
});

const STATUS: Record<string, number> = {
  media_type_not_allowed: 422,
  asset_too_large: 413,
  // A full namespace answers 429 like every other quota, with `resource` and `limit` naming it.
  namespace_quota_exceeded: 429,
  not_found: 404,
  upload_expired: 410,
  already_uploaded: 409,
  size_mismatch: 422,
};

function failure(error: AssetError, assetId?: string): HandlerResult {
  return fail(STATUS[error.code] ?? 422, {
    error: error.message,
    code: error.code,
    // Quota and already-uploaded refusals can be resolved by deleting; the rest need a new reservation.
    next: error.code === "media_type_not_allowed"
      ? ["reserve_asset"]
      : error.code === "namespace_quota_exceeded" || error.code === "already_uploaded"
        ? ["list_assets", "delete_asset", "reserve_asset"]
        : error.code === "upload_expired"
          ? ["reissue_upload_url", "reserve_asset"]
          : ["list_assets", "reserve_asset"],
    // The reservation still holds its quota, so the fix is a fresh link, spelled out inline.
    ...(error.code === "upload_expired" && assetId !== undefined
      ? {
        recover: {
          method: "POST",
          path: `/v1/assets/${assetId}/upload-url`,
          then: "PUT the same bytes to the upload_url it returns",
        },
      }
      : {}),
    ...(error.code === "namespace_quota_exceeded"
      ? { resource: "namespace_bytes", limit: MAX_NAMESPACE_BYTES }
      : {}),
    ...(error.code === "asset_too_large" ? { resource: "asset_bytes", limit: MAX_ASSET_BYTES } : {}),
  });
}

/** Reserve one file. `size_bytes` must be exact so quota can be committed at reservation time. */
export async function create(input: { namespace_id: string; baseUrl: string; body: unknown }): Promise<HandlerResult> {
  const parsed = ReserveSchema.safeParse(input.body);
  if (!parsed.success) {
    // Report the first issue's own message, with `path` as a JSON Pointer like other handlers.
    const issue = parsed.error.issues[0];
    const field = issue?.path.at(-1);
    return fail(422, {
      error: issue === undefined
        ? `An asset reservation needs filename, media_type and size_bytes. Allowed types: ${ALLOWED_MEDIA_SENTENCE}.`
        : field === "media_type"
          ? `${issue.message} Allowed types: ${ALLOWED_MEDIA_SENTENCE}.`
          : field === "source_url"
            ? `${issue.message} source_url is displayed as a link and never fetched, so it must be an https URL.`
            : issue.message,
      code: "invalid_request",
      path: jsonPointer(issue?.path ?? []),
      next: ["reserve_asset"],
    });
  }
  try {
    const reserved = await reserve({
      namespaceId: input.namespace_id,
      baseUrl: input.baseUrl,
      filename: parsed.data.filename,
      mediaType: parsed.data.media_type,
      sizeBytes: parsed.data.size_bytes,
      attribution: { credit: parsed.data.credit, sourceUrl: parsed.data.source_url },
    });
    return ok({ ...reserved, next: ["put_asset_bytes", "put_page"] }, 201);
  } catch (error) {
    if (error instanceof AssetError) return failure(error);
    throw error;
  }
}

/** New upload URL for an unfilled reservation, so the agent need not reserve (and hold quota) twice. */
export async function reissue(input: {
  namespace_id: string;
  asset_id: string;
  baseUrl: string;
}): Promise<HandlerResult> {
  try {
    const reserved = await reissueUpload({
      namespaceId: input.namespace_id,
      assetId: await resolveAssetId(input.namespace_id, input.asset_id),
      baseUrl: input.baseUrl,
    });
    return ok({ ...reserved, next: ["put_asset_bytes", "put_page"] });
  } catch (error) {
    if (error instanceof AssetError) return failure(error);
    throw error;
  }
}

export async function upload(input: {
  asset_id: string;
  expires: string | null;
  signature: string | null;
  bytes: Buffer;
}): Promise<HandlerResult> {
  if (!isUuid(input.asset_id) || input.expires === null || input.signature === null) {
    return fail(404, { error: "No asset upload at that address.", code: "not_found", next: ["reserve_asset"] });
  }
  try {
    const stored = await acceptBytes({
      assetId: input.asset_id,
      expiresAt: Number(input.expires),
      signature: input.signature,
      bytes: input.bytes,
    });
    // Returns the measured digest and image dimensions, not the declared values.
    return ok({ ...stored, next: ["put_page"] });
  } catch (error) {
    if (error instanceof AssetError) return failure(error, input.asset_id);
    throw error;
  }
}

/**
 * Releases one asset's quota. Accepts either the `asset_id` or the `resource_id`; `GET /v1/assets`
 * finds files whose reservation was not kept.
 */
export async function remove(input: { namespace_id: string; asset_id: string }): Promise<HandlerResult> {
  try {
    const released = await release(input.namespace_id, await resolveAssetId(input.namespace_id, input.asset_id));
    return ok({ ...released, deleted: true, next: ["list_assets"] });
  } catch (error) {
    if (error instanceof AssetError) return failure(error);
    throw error;
  }
}

/**
 * Holdings, usage against the quota, and the limits for the next upload, so agents need not
 * discover caps by being refused. Values come from `page-content/document/limits.ts`.
 */
export async function usage(namespaceId: string): Promise<HandlerResult> {
  const [stored, committed, assets] = await Promise.all([
    storedBytes(namespaceId),
    committedBytes(namespaceId),
    list(namespaceId),
  ]);
  return ok({
    stored_bytes: stored,
    // Includes live reservations; the next reservation is checked against this.
    committed_bytes: committed,
    quota_bytes: MAX_NAMESPACE_BYTES,
    max_bytes: MAX_ASSET_BYTES,
    allowed_media_types: [...ALLOWED_MEDIA_TYPES],
    upload_window_seconds: UPLOAD_WINDOW_SECONDS,
    assets,
    count: assets.length,
    page_max: ASSETS_PAGE_MAX,
  });
}
