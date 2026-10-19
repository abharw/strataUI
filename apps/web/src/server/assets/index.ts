/**
 * Page assets: reserve (resource id plus a short-lived upload URL), push the bytes, then serve via
 * short-lived signed URLs minted per render. Pages store only the resource id, never a URL.
 */
import { and, desc, eq, getTableColumns, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { getDb, schema } from "@/server/db";
import {
  ASSETS_PAGE_MAX,
  MAX_ASSET_BYTES,
  MAX_NAMESPACE_BYTES,
  SERVE_WINDOW_SECONDS,
  UPLOAD_WINDOW_SECONDS,
} from "@/page-content/document/limits";
import type { Tx } from "@/server/credentials/provision";
import { isAllowedMediaType } from "@/shared/assets/policy";
import { isUuid } from "@/shared/api/types";
import { probe } from "./probe";
import { sign, verify } from "./signing";
import { newStorageKey, storage } from "./storage";
import { thumbFilename, thumbnail } from "./thumbnail";

// Every asset column except `thumb_bytes`, so listings and quota reads never load thumbnails.
// Derived from the table so new columns are included; the cast restores what `fromEntries` loses.
const ASSET_FIELDS = Object.fromEntries(
  Object.entries(getTableColumns(schema.assets)).filter(([column]) => column !== "thumbBytes"),
) as Omit<ReturnType<typeof getTableColumns<typeof schema.assets>>, "thumbBytes">;

type AssetRow = Omit<typeof schema.assets.$inferSelect, "thumbBytes">;

export class AssetError extends Error {
  constructor(readonly code: AssetErrorCode, message: string) {
    super(message);
  }
}

export type AssetErrorCode =
  | "media_type_not_allowed"
  | "asset_too_large"
  | "namespace_quota_exceeded"
  | "not_found"
  | "upload_expired"
  | "already_uploaded"
  | "size_mismatch";

/** Display-only attribution an agent may attach at reservation time. */
export interface AssetAttribution {
  credit?: string;
  sourceUrl?: string;
}

export interface ReservedAsset {
  /** The id the `/v1/assets/:id` routes take. */
  asset_id: string;
  resource_id: string;
  upload_url: string;
  upload_expires_at: string;
  max_bytes: number;
}

/**
 * Resolves either handle (asset id or `resource_id`) to the asset id, scoped to the caller's
 * namespace. Asset ids are uuids and resource ids never are, so the shape picks the column.
 */
export async function resolveAssetId(namespaceId: string, handle: string): Promise<string> {
  const [row] = await getDb()
    .select({ id: schema.assets.id })
    .from(schema.assets)
    .where(and(
      eq(schema.assets.namespaceId, namespaceId),
      isUuid(handle) ? eq(schema.assets.id, handle) : eq(schema.assets.resourceId, handle),
    ));
  if (row === undefined) throw new AssetError("not_found", "No asset with that id in this Strata.");
  return row.id;
}

export interface AssetFacts {
  asset_id: string;
  resource_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  stored: boolean;
  sha256: string | null;
  width: number | null;
  height: number | null;
  credit: string | null;
  source_url: string | null;
  created_at: string;
}

/** Bytes already stored for this namespace. */
export async function storedBytes(namespaceId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${schema.assets.sizeBytes}), 0)::bigint` })
    .from(schema.assets)
    .where(and(eq(schema.assets.namespaceId, namespaceId), isNotNull(schema.assets.storedAt)));
  return Number(row?.total ?? 0);
}

/**
 * Bytes stored plus bytes reserved by live upload windows, so reserving a batch before pushing
 * any of it still respects the cap. Expired reservations stop counting.
 */
export async function committedBytes(namespaceId: string, tx: Tx | ReturnType<typeof getDb> = getDb()): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${schema.assets.sizeBytes}), 0)::bigint` })
    .from(schema.assets)
    .where(and(
      eq(schema.assets.namespaceId, namespaceId),
      or(isNotNull(schema.assets.storedAt), gt(schema.assets.uploadExpiresAt, new Date())),
    ));
  return Number(row?.total ?? 0);
}

/** The files this namespace holds, newest first, so agents can find asset ids to delete. */
export async function list(namespaceId: string): Promise<AssetFacts[]> {
  const rows = await getDb()
    .select(ASSET_FIELDS)
    .from(schema.assets)
    .where(eq(schema.assets.namespaceId, namespaceId))
    .orderBy(desc(schema.assets.createdAt))
    .limit(ASSETS_PAGE_MAX);
  return rows.map(facts);
}

function facts(row: AssetRow): AssetFacts {
  return {
    asset_id: row.id,
    resource_id: row.resourceId,
    filename: row.filename,
    content_type: row.mediaType,
    size_bytes: row.sizeBytes,
    stored: row.storedAt !== null,
    sha256: row.sha256,
    width: row.width,
    height: row.height,
    credit: row.credit,
    source_url: row.sourceUrl,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * Records an upload and mints the one URL that will accept it. The declared size is exact and
 * checked here (fail before uploading) and again when the bytes land. Exact sizes let the quota be
 * reserved in the same transaction that measures it; files up to `MAX_ASSET_BYTES` are one request.
 */
export async function reserve(input: {
  namespaceId: string;
  baseUrl: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  attribution?: AssetAttribution;
}): Promise<ReservedAsset> {
  if (!isAllowedMediaType(input.mediaType)) {
    throw new AssetError("media_type_not_allowed", `Strata does not hold ${input.mediaType} files.`);
  }
  if (input.sizeBytes > MAX_ASSET_BYTES) {
    throw new AssetError("asset_too_large", `That file is larger than the ${MAX_ASSET_BYTES} byte limit for one asset.`);
  }
  const expiresAt = uploadWindowEnd();
  // Measure and insert under the namespace row lock (like `claimWrite`) so parallel reservations
  // cannot all pass the same quota check.
  const row = await getDb().transaction(async (tx) => {
    await tx.select({ id: schema.namespaces.id })
      .from(schema.namespaces)
      .where(eq(schema.namespaces.id, input.namespaceId))
      .for("update");
    const used = await committedBytes(input.namespaceId, tx);
    if (used + input.sizeBytes > MAX_NAMESPACE_BYTES) {
      throw new AssetError(
        "namespace_quota_exceeded",
        `This Strata is holding or expecting ${used} of ${MAX_NAMESPACE_BYTES} bytes; that file does not fit.`,
      );
    }
    const [inserted] = await tx
      .insert(schema.assets)
      .values({
        namespaceId: input.namespaceId,
        resourceId: `asset_${randomBytes(12).toString("base64url")}`,
        storageKey: newStorageKey(),
        filename: input.filename,
        mediaType: input.mediaType.toLowerCase(),
        sizeBytes: input.sizeBytes,
        uploadExpiresAt: expiresAt,
        credit: input.attribution?.credit ?? null,
        sourceUrl: input.attribution?.sourceUrl ?? null,
      })
      .returning({ id: schema.assets.id, resourceId: schema.assets.resourceId });
    return inserted;
  });

  return {
    asset_id: row.id,
    resource_id: row.resourceId,
    upload_url: uploadUrl(input.baseUrl, row.id, expiresAt),
    upload_expires_at: expiresAt.toISOString(),
    max_bytes: MAX_ASSET_BYTES,
  };
}

/**
 * Mints a new upload URL for a reservation whose bytes never landed. The signature is minted
 * against `upload_expires_at`, so moving the window invalidates the previous URL.
 */
export async function reissueUpload(input: {
  namespaceId: string;
  assetId: string;
  baseUrl: string;
}): Promise<ReservedAsset> {
  // Strictly later than the current window, even within the same second; an identical window
  // would re-mint the same signature and the old link would keep working.
  const [row] = await getDb()
    .update(schema.assets)
    .set({
      uploadExpiresAt: sql`greatest(${uploadWindowEnd().toISOString()}::timestamptz, ${schema.assets.uploadExpiresAt} + interval '1 second')`,
    })
    .where(and(
      eq(schema.assets.id, input.assetId),
      eq(schema.assets.namespaceId, input.namespaceId),
      isNull(schema.assets.storedAt),
    ))
    .returning({
      id: schema.assets.id,
      resourceId: schema.assets.resourceId,
      uploadExpiresAt: schema.assets.uploadExpiresAt,
    });
  if (row === undefined) {
    const [existing] = await getDb()
      .select({ storedAt: schema.assets.storedAt })
      .from(schema.assets)
      .where(and(eq(schema.assets.id, input.assetId), eq(schema.assets.namespaceId, input.namespaceId)));
    if (existing === undefined) throw new AssetError("not_found", "No asset with that id in this Strata.");
    throw new AssetError(
      "already_uploaded",
      "That asset already has its bytes; reserve a new one to replace it.",
    );
  }
  return {
    asset_id: row.id,
    resource_id: row.resourceId,
    upload_url: uploadUrl(input.baseUrl, row.id, row.uploadExpiresAt),
    upload_expires_at: row.uploadExpiresAt.toISOString(),
    max_bytes: MAX_ASSET_BYTES,
  };
}

/** Whole seconds, because the signature carries the same instant the row does. */
function uploadWindowEnd(now = Date.now()): Date {
  return new Date((Math.floor(now / 1000) + UPLOAD_WINDOW_SECONDS) * 1000);
}

function uploadUrl(baseUrl: string, assetId: string, expiresAt: Date): string {
  const expires = Math.floor(expiresAt.getTime() / 1000);
  const signature = sign("upload", assetId, expires);
  return `${baseUrl}/v1/assets/${assetId}/bytes?expires=${String(expires)}&signature=${signature}`;
}

/**
 * Accepts the bytes for a reservation. One-shot, so a replayed URL cannot swap the contents of an
 * asset a page already shows. Digest and image dimensions are read here, while the bytes are in hand.
 */
export async function acceptBytes(input: {
  assetId: string;
  expiresAt: number;
  signature: string;
  bytes: Buffer;
}): Promise<AssetFacts> {
  if (!verify("upload", input.assetId, input.expiresAt, input.signature)) {
    throw new AssetError("upload_expired", "This upload link is not valid any more. Reserve the asset again.");
  }
  const [row] = await getDb().select(ASSET_FIELDS).from(schema.assets).where(eq(schema.assets.id, input.assetId));
  if (row === undefined) throw new AssetError("not_found", "No asset was reserved under that id.");
  if (row.storedAt !== null) {
    throw new AssetError("already_uploaded", "That asset already has its bytes; reserve a new one to replace it.");
  }
  if (row.uploadExpiresAt.getTime() < Date.now()) {
    throw new AssetError("upload_expired", "The upload window for that asset has closed. Reserve it again.");
  }
  // A re-issued link moves the row's window, so earlier links no longer match it.
  if (input.expiresAt !== Math.floor(row.uploadExpiresAt.getTime() / 1000)) {
    throw new AssetError(
      "upload_expired",
      "A newer upload link was issued for that asset, so this one no longer works. Use the latest one.",
    );
  }
  if (input.bytes.byteLength !== row.sizeBytes) {
    throw new AssetError(
      "size_mismatch",
      `The reservation declared ${String(row.sizeBytes)} bytes and ${String(input.bytes.byteLength)} arrived.`,
    );
  }

  const probed = probe(input.bytes, row.mediaType);
  // Thumbnailing never fails the upload; an asset without a variant serves its original.
  const thumb = await thumbnail(input.bytes, row.mediaType);
  // Claim the row before writing: storage put is an upsert, so two concurrent pushes would both win.
  const [claimed] = await getDb()
    .update(schema.assets)
    .set({
      storedAt: new Date(),
      sha256: probed.sha256,
      width: probed.width,
      height: probed.height,
      thumbBytes: thumb?.bytes ?? null,
      thumbMediaType: thumb?.mediaType ?? null,
      thumbWidth: thumb?.width ?? null,
      thumbHeight: thumb?.height ?? null,
    })
    .where(and(
      eq(schema.assets.id, row.id),
      isNull(schema.assets.storedAt),
      gt(schema.assets.uploadExpiresAt, new Date()),
    ))
    .returning(ASSET_FIELDS);
  if (claimed === undefined) {
    throw new AssetError("already_uploaded", "That asset already has its bytes; reserve a new one to replace it.");
  }
  try {
    await storage().put(row.storageKey, input.bytes);
  } catch (error) {
    // Release the claim (and its thumbnail) if the bytes did not land.
    await getDb()
      .update(schema.assets)
      .set({ storedAt: null, thumbBytes: null, thumbMediaType: null, thumbWidth: null, thumbHeight: null })
      .where(eq(schema.assets.id, row.id));
    throw error;
  }
  return facts(claimed);
}

/**
 * Deletes an asset and releases its quota. The blob cascades via `asset_blobs.storage_key`.
 * Scoped to the namespace, so another Strata's id resolves to nothing.
 */
export async function release(namespaceId: string, assetId: string): Promise<{ resource_id: string; released_bytes: number }> {
  const [row] = await getDb()
    .delete(schema.assets)
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.namespaceId, namespaceId)))
    .returning({
      resourceId: schema.assets.resourceId,
      storageKey: schema.assets.storageKey,
      sizeBytes: schema.assets.sizeBytes,
      storedAt: schema.assets.storedAt,
    });
  if (row === undefined) throw new AssetError("not_found", "No asset with that id in this Strata.");
  // The cascade already removed the Postgres blob; this keeps the delete path correct for other
  // storage backends.
  await storage().remove(row.storageKey);
  return { resource_id: row.resourceId, released_bytes: row.storedAt === null ? 0 : row.sizeBytes };
}

export interface ServableAsset {
  url: string;
  filename: string;
  media_type: string;
  size_bytes: number;
  /** Measured pixel dimensions, so the renderer can reserve the box. */
  width: number | null;
  height: number | null;
  /**
   * The same URL requesting the thumbnail, or null when there is none (PDF, SVG, small images).
   * Tiles use this; "open original" and the full preview use `url`.
   */
  thumb_url: string | null;
  thumb_width: number | null;
  thumb_height: number | null;
  /** Display-only attribution; never fetched. */
  credit: string | null;
  source_url: string | null;
}

/**
 * Resolves a page's resource ids to URLs for this render only. Ids from another namespace resolve
 * to nothing, so a copied page cannot borrow someone else's file.
 */
export async function serveUrls(
  namespaceId: string,
  resourceIds: readonly string[],
): Promise<Map<string, ServableAsset>> {
  const wanted = [...new Set(resourceIds)];
  if (wanted.length === 0) return new Map();
  const rows = await getDb()
    .select(ASSET_FIELDS)
    .from(schema.assets)
    .where(and(
      eq(schema.assets.namespaceId, namespaceId),
      isNotNull(schema.assets.storedAt),
      inArray(schema.assets.resourceId, wanted),
    ));

  const out = new Map<string, ServableAsset>();
  for (const row of rows) {
    const expires = Math.floor(Date.now() / 1000) + SERVE_WINDOW_SECONDS;
    // The thumbnail shares the original's signature: same asset, same capability.
    const url = `/assets/${row.id}?expires=${String(expires)}&signature=${sign("serve", row.id, expires)}`;
    out.set(row.resourceId, {
      url,
      filename: row.filename,
      media_type: row.mediaType,
      size_bytes: row.sizeBytes,
      width: row.width,
      height: row.height,
      thumb_url: row.thumbMediaType === null ? null : `${url}&${THUMB_PARAM}`,
      thumb_width: row.thumbWidth,
      thumb_height: row.thumbHeight,
      credit: row.credit,
      source_url: row.sourceUrl,
    });
  }
  return out;
}

/** Which rendering a request wants: a query parameter on the same signed URL, not a second route. */
export type AssetVariant = "original" | "thumb";

/** `w` for width, as image CDNs spell it. */
export const THUMB_PARAM = "w=thumb";

/** Anything unrecognised means the original. */
export function requestedVariant(params: URLSearchParams): AssetVariant {
  return params.get("w") === "thumb" ? "thumb" : "original";
}

export interface ServedAsset {
  /** What the response carries, which may differ from what was asked for. */
  variant: AssetVariant;
  mediaType: string;
  filename: string;
  /** The original's digest, whichever rendering this is; the route qualifies it. */
  sha256: string | null;
  bytes: () => Promise<Buffer | null>;
}

/**
 * The read behind a serving URL; null when the signature is invalid. The digest comes from the
 * row, so a conditional request can get a `304` without loading the blob.
 */
export async function readForServing(input: {
  assetId: string;
  expiresAt: number;
  signature: string;
  variant?: AssetVariant;
}): Promise<ServedAsset | null> {
  if (!verify("serve", input.assetId, input.expiresAt, input.signature)) return null;
  const [row] = await getDb().select(ASSET_FIELDS).from(schema.assets).where(eq(schema.assets.id, input.assetId));
  if (row === undefined || row.storedAt === null) return null;
  // A missing thumbnail falls back to the original; the response says which it is.
  if (input.variant === "thumb" && row.thumbMediaType !== null) {
    return {
      variant: "thumb",
      mediaType: row.thumbMediaType,
      filename: thumbFilename(row.filename, row.thumbMediaType),
      sha256: row.sha256,
      // Loaded lazily; no other read of the row selects this column.
      bytes: async () => {
        const [blob] = await getDb()
          .select({ bytes: schema.assets.thumbBytes })
          .from(schema.assets)
          .where(eq(schema.assets.id, row.id));
        return blob?.bytes ?? null;
      },
    };
  }
  return {
    variant: "original",
    mediaType: row.mediaType,
    filename: row.filename,
    sha256: row.sha256,
    bytes: () => storage().get(row.storageKey),
  };
}
