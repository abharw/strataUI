import mobileLinks from "@/lib/mobile-links.json";

const APPLE_APP_ID = /^[A-Z0-9]{10}\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const SHA256_FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * App-claimed paths rendered for Apple's pattern language, from `mobile-links.json` (shared
 * with the Android config). `???_` matches both `pgk_` and `spk_` since Apple has no alternation.
 */
export const APPLE_PRESENTATION_PATHS = mobileLinks.paths.map(
  (path) => path.replaceAll(mobileLinks.wildcard, "?"),
);

function commaSeparated(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

export function appleAppSiteAssociation(rawAppIds: string | undefined): object | null {
  const appIDs = commaSeparated(rawAppIds);
  if (appIDs.length === 0 || appIDs.some((value) => !APPLE_APP_ID.test(value))) return null;

  return {
    applinks: {
      apps: [],
      details: [{
        appIDs,
        components: [
          { "/": "/pages/*/assets/*", exclude: true, comment: "Attachments stay in the browser viewer." },
          { "/": "/share/*/assets/*", exclude: true, comment: "Share-link attachments stay in the browser viewer." },
          { "/": "/share/*/pages/*/assets/*", exclude: true, comment: "Space page attachments stay in the browser viewer." },
          ...APPLE_PRESENTATION_PATHS.map((path) => ({
            "/": path,
            comment: "Canonical Strata presentation door.",
          })),
        ],
      }],
    },
  };
}

export function androidAssetLinks(
  packageName: string | undefined,
  rawFingerprints: string | undefined,
): object[] | null {
  const normalizedPackage = packageName?.trim() ?? "";
  const fingerprints = commaSeparated(rawFingerprints).map((value) => value.toUpperCase());
  if (
    !ANDROID_PACKAGE.test(normalizedPackage)
    || fingerprints.length === 0
    || fingerprints.some((value) => !SHA256_FINGERPRINT.test(value))
  ) {
    return null;
  }

  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: normalizedPackage,
      sha256_cert_fingerprints: fingerprints,
    },
  }];
}
