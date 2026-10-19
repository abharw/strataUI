import { NextResponse, type NextRequest } from "next/server";
import { SERVICE_LINK_HEADER } from "@/server/api/discovery/link-header";
import { WEB_SESSION_COOKIE } from "@/server/auth/session-cookie";

const SIGN_IN = "/home/sign-in";

/** The owner's own surface; session, indexing, caching and framing rules all key off this list. */
const OWNER_PREFIXES = ["/pages", "/spaces", "/home"] as const;

function isOwnerSurface(path: string): boolean {
  return OWNER_PREFIXES.some((prefix) => isUnder(path, prefix));
}

/**
 * Owner pages redirect to sign-in themselves, but inside a `loading.tsx` stream that has already
 * sent `200`. A missing cookie is decidable here, so answer it with a real `307`.
 */
function needsSession(path: string): boolean {
  return OWNER_PREFIXES.some((prefix) => (
    // Only `/home` itself: `/home/sign-in` is the redirect target, and the JSON reads refuse on their own.
    prefix === "/home" ? path === prefix : isUnder(path, prefix)
  ));
}

/* -------------------------------------------------------------- the proxy */

export function proxy(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;

  if (request.method === "GET" && needsSession(path) && !request.cookies.has(WEB_SESSION_COOKIE)) {
    const to = new URL(SIGN_IN, request.nextUrl);
    to.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return privatePage(NextResponse.redirect(to, 307));
  }

  const response = NextResponse.next();

  if (
    path === "/"
    || isUnder(path, "/share")
    || isOwnerSurface(path)
    || isUnder(path, "/dev")
  ) {
    response.headers.set("X-Robots-Tag", "noindex");
  }
  // Lets an agent find llms.txt from the headers of any URL, not just the bare domain.
  if (!isUnder(path, "/dev")) {
    response.headers.set("Link", SERVICE_LINK_HEADER);
  }
  if (isUnder(path, "/share") || isOwnerSurface(path)) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
  }
  // `/share/:key?embed=1` is an embed surface and stays framable; owner surfaces are not.
  if (isOwnerSurface(path)) {
    response.headers.set("Content-Security-Policy", OWNER_CSP);
    formPage(response);
  }
  return response;
}

/**
 * Blocks framing (UI redressing of in-page mutations, including from same-site subdomains) and
 * pins form posts to this origin. No `script-src` yet: it needs a nonce threaded through here.
 */
const OWNER_CSP = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

/** `/share` and `/share/…`, without `/shares` matching either. */
function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Under `no-referrer` browsers send `Origin: null` on Server Action posts and Next's CSRF check
 * refuses them. `owner-referrer.db.test.ts` checks page metadata does not override this.
 */
function formPage(response: NextResponse): NextResponse {
  response.headers.set("Referrer-Policy", "same-origin");
  return response;
}

function privatePage(response: NextResponse): NextResponse {
  response.headers.set("X-Robots-Tag", "noindex");
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

/**
 * Polled JSON sub-routes excluded from the matcher to avoid an edge invocation per tick; their
 * handlers set the same headers themselves.
 */
export const NON_DOCUMENT_SEGMENTS = ["changes"] as const;

/**
 * Polled JSON reads directly under `/home`. Excluding them also keeps their `no-referrer` from
 * being overwritten with the `same-origin` the owner pages need.
 */
export const OWNER_JSON_SEGMENTS = ["agents", "search"] as const;

/**
 * Next accepts only static strings in `matcher`, so the segments above are spelled out;
 * `proxy.test.ts` keeps the two in sync.
 */
export const config = {
  matcher: [
    "/",
    "/home",
    "/home/((?!(?:.*/)?(?:agents|search)(?:/|$)).*)",
    "/pages/((?!.*/(?:changes)(?:/|$)).*)",
    "/spaces/:path*",
    "/share/((?!.*/(?:changes)(?:/|$)).*)",
    "/dev/:path*",
  ],
};
