/**
 * Serving for agent-discovery documents: `no-cache` plus an ETag, so clients revalidate on every
 * read (and see contract changes immediately) while an unchanged document costs only a 304.
 */
import { createHash } from "node:crypto";

import { SERVICE_LINK_HEADER } from "./link-header";
import { CONTRACT_HEADER, CONTRACT_VERSION } from "@/shared/api/version";

/** A strong ETag over the exact bytes served. */
export function etagFor(text: string): string {
  return `"${createHash("sha256").update(text).digest("base64url").slice(0, 27)}"`;
}

/** Whether an `If-None-Match` header names this ETag (weak or strong form). */
export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (ifNoneMatch === null) return false;
  if (ifNoneMatch.trim() === "*") return true;
  const bare = etag.replace(/^W\//, "");
  return ifNoneMatch
    .split(",")
    .map((candidate) => candidate.trim().replace(/^W\//, ""))
    .includes(bare);
}

/** Shared caches may store it but must revalidate before serving. */
const DISCOVERY_CACHE_CONTROL = "public, no-cache";

export function discoveryResponse(
  request: Request,
  body: string,
  options: { contentType: string; vary?: string },
): Response {
  const etag = etagFor(body);
  const headers: Record<string, string> = {
    "Cache-Control": DISCOVERY_CACHE_CONTROL,
    ETag: etag,
    Link: SERVICE_LINK_HEADER,
    "X-Robots-Tag": "noindex",
    [CONTRACT_HEADER]: CONTRACT_VERSION,
    ...(options.vary === undefined ? {} : { Vary: options.vary }),
  };
  if (etagMatches(request.headers.get("If-None-Match"), etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { headers: { ...headers, "Content-Type": options.contentType } });
}
