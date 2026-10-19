/**
 * Renders a handler result as an HTTP response, adding deployment facts handlers do not know:
 * the origin on relative `recover.path` values, and the `X-Strata-Contract` header.
 */
import { etagMatches } from "@/server/api/discovery/response";
import { CONTRACT_HEADER, CONTRACT_VERSION } from "@/shared/api/version";
import type { HandlerResult } from "@/shared/api/types";

/**
 * Results with an `ETag` (pure functions of the deployment, like the guide) are served `no-cache`
 * and answer a matching `If-None-Match` with 304; everything else is `no-store`.
 */
export function json(result: HandlerResult, origin?: string, ifNoneMatch: string | null = null): Response {
  const etag = result.headers?.ETag;
  const headers = {
    ...result.headers,
    // Pages are personal data behind capability URLs: never cacheable or crawlable.
    "Cache-Control": etag === undefined ? "private, no-store" : "private, no-cache",
    "X-Robots-Tag": "noindex",
    [CONTRACT_HEADER]: CONTRACT_VERSION,
  };
  if (etag !== undefined && result.status === 200 && etagMatches(ifNoneMatch, etag)) {
    return new Response(null, { status: 304, headers });
  }
  return Response.json(origin === undefined ? result.body : absolutize(result.body, origin), {
    status: result.status,
    headers,
  });
}

/** Prefix the origin onto every relative `recover.path`, nested errors included. */
function absolutize(body: Record<string, unknown>, origin: string): Record<string, unknown> {
  const recover = body.recover as { path?: unknown } | undefined;
  const errors = body.errors as readonly Record<string, unknown>[] | undefined;
  if (recover === undefined && errors === undefined) return body;
  return {
    ...body,
    ...(recover === undefined || typeof recover.path !== "string" || !recover.path.startsWith("/")
      ? {}
      : { recover: { ...recover, path: `${origin}${recover.path}` } }),
    ...(errors === undefined ? {} : { errors: errors.map((entry) => absolutize(entry, origin)) }),
  };
}
