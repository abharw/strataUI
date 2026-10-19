import { androidAssetLinks } from "@/shared/navigation/mobile-links";

/**
 * Reads the environment per request. Without `force-dynamic`, Cache Components would prerender
 * the build-time 404 and silently break universal links.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  const association = androidAssetLinks(
    process.env.STRATA_ANDROID_PACKAGE,
    process.env.STRATA_ANDROID_SHA256_CERT_FINGERPRINTS,
  );
  if (association === null) {
    return new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });
  }
  return Response.json(association, {
    headers: { "cache-control": "public, max-age=3600", "content-type": "application/json" },
  });
}
