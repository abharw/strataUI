/**
 * `GET /assets/:id`: serves bytes for a short-lived signature minted per render; responses are
 * private. `?w=thumb` serves the 640px variant, falling back to the original if none exists.
 */
import { readForServing, requestedVariant } from "@/server/assets";
import { contentDisposition } from "@/shared/assets/policy";
import { SERVE_WINDOW_SECONDS } from "@/page-content/document/limits";

interface Context { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    return await serve(request, context);
  } catch {
    // Any failure, such as a filename a header cannot carry, is a plain 404.
    return new Response("Not found", { status: 404 });
  }
}

async function serve(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  const url = new URL(request.url);
  const asset = await readForServing({
    assetId: id,
    expiresAt: Number(url.searchParams.get("expires") ?? "0"),
    signature: url.searchParams.get("signature") ?? "",
    variant: requestedVariant(url.searchParams),
  });
  if (asset === null) return new Response("Not found", { status: 404 });

  // Assets are immutable, so the stored digest is the ETag and a 304 skips reading the bytes.
  // The variant suffix keeps a cached thumbnail from satisfying a request for the original.
  const etag = asset.sha256 === null
    ? null
    : `"${asset.sha256}${asset.variant === "thumb" ? "-thumb" : ""}"`;
  const headers: Record<string, string> = {
    "content-type": asset.mediaType,
    "content-disposition": contentDisposition(asset.filename),
    "cache-control": `private, max-age=${String(SERVE_WINDOW_SECONDS)}`,
    "x-content-type-options": "nosniff",
    // Agent-written SVG opened in a tab is a same-origin document, so nothing here may execute.
    "content-security-policy": "default-src 'none'; sandbox",
    ...(etag === null ? {} : { etag }),
  };

  if (etag !== null && matches(request.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers });
  }

  const bytes = await asset.bytes();
  if (bytes === null) return new Response("Not found", { status: 404 });
  // A view over the Buffer, not a copy. The cast is safe: a Node Buffer is never backed by a
  // SharedArrayBuffer.
  const body = new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
  return new Response(body, {
    headers: { ...headers, "content-length": String(body.byteLength) },
  });
}

/** RFC 9110 `If-None-Match`: a list of validators, or `*`. Weak tags compare weakly. */
function matches(header: string | null, etag: string): boolean {
  if (header === null) return false;
  const presented = header.trim();
  if (presented === "*") return true;
  return presented
    .split(",")
    .map((entry) => entry.trim().replace(/^W\//, ""))
    .includes(etag);
}
