/**
 * ETags for results that are pure functions of the deployment (the guide and the manifest).
 * `response.ts` serves these `no-cache` and answers a matching `If-None-Match` with 304.
 */
import { etagFor } from "@/server/api/discovery/response";
import type { HandlerResult } from "@/shared/api/types";

export function withEtag(result: HandlerResult): HandlerResult {
  return { ...result, headers: { ...result.headers, ETag: etagFor(JSON.stringify(result.body)) } };
}
