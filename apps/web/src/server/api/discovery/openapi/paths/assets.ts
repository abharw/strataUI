/** Files: reserve, push the bytes, list what is held, give the quota back. */
import { UPLOAD_WINDOW_SECONDS } from "@/page-content/document/limits";
import { jsonBody, responses, schemaRef } from "@/server/api/discovery/openapi/shared";

const UPLOAD_WINDOW_MINUTES = UPLOAD_WINDOW_SECONDS / 60;

export const ASSET_PATHS: Record<string, unknown> = {
  "/v1/assets": {
    post: {
      operationId: "reserve_asset",
      tags: ["pages"],
      summary: "Reserve a file and get the one short-lived URL that takes its bytes",
      description:
        `Two steps on purpose: say what is coming, then push it. The returned upload_url works once, expires in ${String(UPLOAD_WINDOW_MINUTES)} minutes, and carries its own signature - do not send your access token to it. size_bytes is exact because the quota is committed to it in the same transaction that measures it, which is also why there is no chunked or resumable upload. The response names the file twice: put resource_id in an attachment-list item - never a URL - and keep asset_id for the /v1/assets/{id} routes, which also accept the resource_id.`,
      requestBody: jsonBody(schemaRef("AssetReserveRequest")),
      responses: responses({ description: "Both ids for the file and the one-shot upload URL", schema: schemaRef("AssetReserveResult"), created: true }, { body: true, quota: true, tooLarge: "That one file is over the per-asset limit; `limit` says what it is. A namespace with no room left is 429." }),
    },
    get: {
      operationId: "list_assets",
      tags: ["pages"],
      summary: "The files this Strata holds, the storage in use, and the limits",
      description:
        "Read this before reserving anything: the per-file cap, the accepted media types and the remaining quota are all here, so no reservation is spent discovering them. The list is every file this Strata holds, newest first, with the id DELETE takes.",
      responses: responses({ description: "The files, the usage, and the limits", schema: schemaRef("AssetUsageResult") }),
    },
  },
  "/v1/assets/{id}/upload-url": {
    post: {
      operationId: "reissue_upload_url",
      tags: ["pages"],
      summary: "Mint a fresh one-shot upload URL for a reservation whose bytes never landed",
      description:
        "For an upload link that expired or was lost. The reservation is still holding its bytes against the quota, so this is the way forward rather than reserving the file twice; the previous URL stops working the moment this one exists. Takes either id the reservation returned. A file that already has its bytes is a 409 - reserve a new one to replace it.",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "The asset_id from the reservation or the resource_id the page names; either resolves, within your own Strata." }],
      responses: responses({ description: "A fresh one-shot upload URL for the same reservation", schema: schemaRef("AssetReserveResult") }, {
        path: true,
        conflict: "The asset already has its bytes",
      }),
    },
  },
  "/v1/assets/{id}/bytes": {
    put: {
      operationId: "put_asset_bytes",
      tags: ["pages"],
      summary: "Push the bytes to the reserved asset's signed URL",
      description:
          "The request body is the raw file. The signature and expiry are already in the URL you were given, so this call carries no credential of its own and works exactly once. The bytes must match the size the reservation declared.",
      security: [],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      requestBody: {
        required: true,
        content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
      },
      responses: responses({ description: "The bytes are stored, and what they turned out to be", schema: schemaRef("AssetFacts") }, {
        path: true,
        public: true,
        conflict: "The asset already has its bytes",
        gone: "The upload window closed, or a newer link was issued for this reservation; POST /v1/assets/{id}/upload-url for a fresh one",
        // The route refuses an oversized `content-length` before reading, and the handler answers
        // 422 when the bytes do not match the declared size.
        tooLarge: "The declared content-length is over the per-asset limit; the bytes were not read",
        unprocessable: true,
      }),
    },
  },
  "/v1/assets/{id}": {
    delete: {
      operationId: "delete_asset",
      tags: ["pages"],
      summary: "Delete a file and give its bytes back to the namespace quota",
      description:
        "The id is either the asset_id from the reservation or the resource_id the page names; both resolve to the same file inside your own Strata. Pages that still name a deleted resource render it as unavailable rather than breaking, so remove the attachment item too.",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "The asset_id from the reservation or the resource_id the page names; either resolves, within your own Strata." }],
      responses: responses({ description: "The asset is gone and its bytes no longer count against the quota", schema: schemaRef("AssetDeleteResult") }, { path: true }),
    },
  },
};
