import type { ExpoConfig } from "expo/config";

import mobileLinks from "../web/src/lib/mobile-links.json";
import strataOrigin from "./src/strata-origin.json";

const IOS_BUNDLE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+$/;
const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;

const LOOPBACK_HOSTS = new Set<string>(strataOrigin.loopbackHosts);

/**
 * Uses `EXPO_PUBLIC_STRATA_DEV` rather than NODE_ENV, which Expo commands set inconsistently, so
 * this and the runtime check in `src/config.ts` always agree.
 */
export function configuredOrigin(
  rawValue = process.env.EXPO_PUBLIC_STRATA_ORIGIN,
  development = process.env.EXPO_PUBLIC_STRATA_DEV === "1",
): URL {
  const raw = rawValue?.trim() || strataOrigin.defaultOrigin;
  const origin = new URL(raw);
  // Loopback HTTP is allowed in development only; shipped builds need HTTPS because capability
  // links are bearer URLs.
  const loopback = development
    && origin.protocol === "http:"
    && LOOPBACK_HOSTS.has(origin.hostname);
  if (
    (origin.protocol !== "https:" && !loopback)
    || origin.username !== ""
    || origin.password !== ""
    || origin.pathname !== "/"
    || origin.search !== ""
    || origin.hash !== ""
  ) {
    throw new Error(
      "EXPO_PUBLIC_STRATA_ORIGIN must be an HTTPS origin with no path"
      + " (or a loopback HTTP origin in development)",
    );
  }
  return origin;
}

function optionalIdentity(
  name: string,
  raw: string | undefined,
  pattern: RegExp,
): string | undefined {
  const value = raw?.trim();
  if (value === undefined || value === "") return undefined;
  if (!pattern.test(value)) throw new Error(`${name} is not a valid application identifier`);
  return value;
}

/** Store uploads require this to increase every build; it is supplied per build, not auto-incremented. */
function buildOrdinal(raw: string | undefined): number {
  const value = raw?.trim();
  if (value === undefined || value === "") return 1;
  const ordinal = Number(value);
  if (!Number.isInteger(ordinal) || ordinal < 1) {
    throw new Error("STRATA_BUILD_NUMBER must be a positive integer");
  }
  return ordinal;
}

const iosBundleIdentifier = optionalIdentity(
  "STRATA_IOS_BUNDLE_IDENTIFIER",
  process.env.STRATA_IOS_BUNDLE_IDENTIFIER,
  IOS_BUNDLE_IDENTIFIER,
);
const androidPackage = optionalIdentity(
  "STRATA_ANDROID_PACKAGE",
  process.env.STRATA_ANDROID_PACKAGE,
  ANDROID_PACKAGE,
);
const buildNumber = buildOrdinal(process.env.STRATA_BUILD_NUMBER);

// Store builds compile the host into their link claims, so it must be named explicitly.
const hasReleaseIdentity = iosBundleIdentifier !== undefined || androidPackage !== undefined;
if (hasReleaseIdentity && (process.env.EXPO_PUBLIC_STRATA_ORIGIN?.trim() ?? "") === "") {
  throw new Error(
    "EXPO_PUBLIC_STRATA_ORIGIN must name the host explicitly for a build that"
    + " carries a store identity: it is compiled into the link claims.",
  );
}

const origin = configuredOrigin();

// Android App Links have no exclusion rule, so these are exact simple globs and longer attachment
// paths stay in the browser. Shared with the iOS association file via mobile-links.json.
export const ANDROID_PRESENTATION_PATH_PATTERNS = mobileLinks.paths.map(
  (path) => path.replaceAll(mobileLinks.wildcard, "."),
);

export function androidPresentationIntentFilters(hostname: string) {
  return ANDROID_PRESENTATION_PATH_PATTERNS.map((pathPattern) => ({
    action: "VIEW" as const,
    autoVerify: true,
    category: ["BROWSABLE" as const, "DEFAULT" as const],
    data: [{ scheme: "https", host: hostname, pathPattern }],
  }));
}

// Apple and Google cannot verify a loopback origin, so development builds claim no links.
const claimsLinks = origin.protocol === "https:";
if (!claimsLinks) {
  console.warn(
    `Strata: ${origin.origin} is a development origin, so this build claims no`
    + " universal links or App Links at all.",
  );
}

const config: ExpoConfig = {
  name: "Strata",
  slug: "strata",
  version: "0.1.0",
  orientation: "default",
  userInterfaceStyle: "light",
  icon: "./assets/icon.png",
  // Matches the web app's light background so the splash hands off to /home seamlessly.
  backgroundColor: "#ffffff",
  plugins: [
    ["expo-splash-screen", {
      image: "./assets/splash-icon.png",
      imageWidth: 160,
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    }],
  ],
  ios: {
    supportsTablet: true,
    buildNumber: String(buildNumber),
    config: {
      usesNonExemptEncryption: false,
    },
    // Required-reason declarations for the React Native runtime; the shell stores no user data.
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
          NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
        },
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
          NSPrivacyAccessedAPITypeReasons: ["C617.1"],
        },
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime",
          NSPrivacyAccessedAPITypeReasons: ["35F9.1"],
        },
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
          NSPrivacyAccessedAPITypeReasons: ["E174.1"],
        },
      ],
    },
    associatedDomains: claimsLinks ? [`applinks:${origin.hostname}`] : [],
    ...(iosBundleIdentifier ? { bundleIdentifier: iosBundleIdentifier } : {}),
  },
  android: {
    predictiveBackGestureEnabled: false,
    versionCode: buildNumber,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      monochromeImage: "./assets/adaptive-icon-monochrome.png",
      backgroundColor: "#ffffff",
    },
    // One path per filter avoids Android merging separate <data> attributes
    // into URL combinations the app never intended to claim.
    intentFilters: claimsLinks ? androidPresentationIntentFilters(origin.hostname) : [],
    ...(androidPackage ? { package: androidPackage } : {}),
  },
};

export default config;
