/**
 * The origin minted URLs are built against. Links carry capability keys and are sent to people,
 * and `X-Forwarded-Host` is client-supplied, so production uses `PUBLIC_BASE_URL`. Previews use
 * their own deployment URL; forwarded headers are only a local-development fallback.
 */

/** Whatever can answer `get("host")`: `Request.headers`, or Next's `headers()`. */
export interface HeaderSource { get(name: string): string | null }

/** The origin every minted URL is built against. */
export function baseUrl(request: Request): string {
  return originFrom(request.headers, new URL(request.url).origin);
}

/**
 * `baseUrl` for callers that hold headers rather than a `Request` (server components; see
 * `server/api/http/read-origin`). `fallback` is the request's own origin, or null if there is none.
 */
export function originFrom(headers: HeaderSource, fallback: string | null): string {
  // A preview answers on both `VERCEL_URL` and the stable branch alias. Links minted against
  // `VERCEL_URL` would stop resolving after the next push, so trust a request host that is ours.
  if (process.env.VERCEL_ENV === "preview") {
    const host = requestHost(headers);
    if (host !== null && isOwnPreviewHost(host)) return `https://${host}`;
  }

  const configured = configuredOrigin();
  if (configured !== null) return configured;

  if (process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "preview") {
    const host = headers.get("x-forwarded-host") ?? headers.get("host");
    const proto = headers.get("x-forwarded-proto") ?? "https";
    if (host !== null && host !== "") return `${proto}://${host}`;
  }

  // Development with no configured origin or host header: use what the runtime resolved.
  // Production never reaches here; `configuredOrigin` throws first.
  if (fallback !== null) return fallback;
  const host = requestHost(headers);
  return host === null ? "" : `https://${host}`;
}

/** The host the request arrived on, from the proxy headers. */
function requestHost(headers: HeaderSource): string | null {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  return host === null || host.trim() === "" ? null : host.trim().toLowerCase();
}

/**
 * True for `*.vercel.app` (only Vercel routes those) or the configured `PUBLIC_BASE_URL` host.
 * Anything else may be a spoofed `X-Forwarded-Host`.
 */
function isOwnPreviewHost(host: string): boolean {
  if (host === "vercel.app" || host.endsWith(".vercel.app")) return true;
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured === undefined || configured === "") return false;
  try {
    return new URL(configured).host.toLowerCase() === host;
  } catch {
    // A malformed PUBLIC_BASE_URL is `configuredOrigin`'s error, not a reason to trust a header.
    return false;
  }
}

/**
 * The canonical deployment origin, or null when unset: `VERCEL_URL` on previews, otherwise
 * `PUBLIC_BASE_URL` canonicalized to a bare origin. The single source for links and unfurl tags.
 */
export function configuredOrigin(): string | null {
  if (process.env.VERCEL_ENV === "preview") {
    const previewHost = process.env.VERCEL_URL?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return previewHost === undefined || previewHost === "" ? null : `https://${previewHost}`;
  }

  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured === undefined || configured === "") {
    // Falling back to the request URL in production would let a spoofed host receive capability
    // links (`https://attacker.example/share/pgk_…`), so fail loudly.
    if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview") {
      throw new Error(
        "PUBLIC_BASE_URL is not set. Production will not mint capability URLs against a request header.",
      );
    }
    return null;
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("PUBLIC_BASE_URL must be an HTTP(S) origin with no path");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:")
    || url.username !== ""
    || url.password !== ""
    || url.pathname !== "/"
    || url.search !== ""
    || url.hash !== ""
  ) {
    throw new Error("PUBLIC_BASE_URL must be an HTTP(S) origin with no path");
  }
  // URL.origin canonicalizes host casing and default ports, so origin comparisons are byte-exact.
  return url.origin;
}
