import { describe, expect, it } from "vitest";

import mobileLinks from "../../../web/src/lib/mobile-links.json";
import strataOrigin from "../strata-origin.json";
import {
  ANDROID_PRESENTATION_PATH_PATTERNS,
  androidPresentationIntentFilters,
  configuredOrigin,
} from "../../app.config";
import { normalizeConfiguredOrigin } from "../config";
import { scopeForPath } from "./presentation-route-contract";

const UUID = "00000000-0000-4000-8000-000000000001";
const PAGE_KEY = `pgk_${"a".repeat(43)}`;
const SPACE_KEY = `spk_${"b".repeat(43)}`;

/**
 * The paths the shared link list claims. iOS ignores paths the web AASA omits, so the native
 * side must claim no more than this, and each must be one the runtime contract handles.
 */
const CLAIMED_PATHS = [
  "/home",
  "/home/sign-in",
  `/pages/${UUID}`,
  `/spaces/${UUID}`,
  `/share/${PAGE_KEY}`,
  `/share/${SPACE_KEY}/pages/${UUID}`,
] as const;

function matches(pattern: string, pathname: string): boolean {
  const source = [...pattern]
    .map((character) => (character === "." ? "." : character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${source}$`).test(pathname);
}

describe("Expo App Link configuration", () => {
  it("renders the shared path list into Android path patterns", () => {
    // Mirrored in apps/web/src/shared/navigation/mobile-links.test.ts so the two association files agree.
    expect(ANDROID_PRESENTATION_PATH_PATTERNS).toEqual(
      mobileLinks.paths.map((path) => path.replaceAll(mobileLinks.wildcard, ".")),
    );
    expect(ANDROID_PRESENTATION_PATH_PATTERNS.some((p) => p.includes(mobileLinks.wildcard))).toBe(false);
    const filters = androidPresentationIntentFilters("strata.test");
    expect(filters.map((filter) => filter.data[0].pathPattern))
      .toEqual(ANDROID_PRESENTATION_PATH_PATTERNS);
    expect(filters.every((filter) => !("pathPrefix" in filter.data[0]))).toBe(true);
  });

  it("claims exactly the paths the runtime route contract answers", () => {
    expect(ANDROID_PRESENTATION_PATH_PATTERNS).toHaveLength(CLAIMED_PATHS.length);
    for (const [index, pathname] of CLAIMED_PATHS.entries()) {
      expect(matches(ANDROID_PRESENTATION_PATH_PATTERNS[index], pathname), pathname).toBe(true);
      expect(scopeForPath(pathname), pathname).not.toBeNull();
    }
  });

  it("claims a share link whichever kind of key it carries", () => {
    // Apple's patterns have no alternation; both key prefixes are the same length, so `????_` covers them.
    const share = ANDROID_PRESENTATION_PATH_PATTERNS
      .find((p) => p.startsWith("/share/") && !p.includes("/pages/"))!;
    expect(matches(share, `/share/${PAGE_KEY}`)).toBe(true);
    expect(matches(share, `/share/${SPACE_KEY}`)).toBe(true);
    expect(matches(share, `/share/${PAGE_KEY}/assets/asset_1`)).toBe(false);
  });

  it("rejects an insecure origin before generating native configuration", () => {
    expect(() => configuredOrigin("http://strata.test")).toThrow("must be an HTTPS origin");
    expect(() => configuredOrigin("https://strata.test/home/")).toThrow("must be an HTTPS origin");
  });

  it("allows a loopback development origin but never one in a shipped build", () => {
    expect(configuredOrigin("http://localhost:3000", true).origin)
      .toBe("http://localhost:3000");
    expect(() => configuredOrigin("http://localhost:3000", false))
      .toThrow("must be an HTTPS origin");
    expect(() => configuredOrigin("http://192.168.1.10:3000", true))
      .toThrow("must be an HTTPS origin");
  });

  it("agrees with the runtime about which origin the app is a browser for", () => {
    // Build-time and runtime origin checks must agree, or the app would claim one host and load another.
    expect(configuredOrigin(undefined, false).origin).toBe(strataOrigin.defaultOrigin);
    expect(normalizeConfiguredOrigin(undefined, false)).toBe(strataOrigin.defaultOrigin);
    for (const raw of ["https://strata.test", "http://localhost:3000"]) {
      for (const development of [true, false]) {
        const build = (() => {
          try {
            return configuredOrigin(raw, development).origin;
          } catch {
            return "rejected";
          }
        })();
        const runtime = (() => {
          try {
            return normalizeConfiguredOrigin(raw, development);
          } catch {
            return "rejected";
          }
        })();
        expect(runtime, `${raw} (development: ${development})`).toBe(build);
      }
    }
  });

  it("reads one development flag, so neither side can decide it alone", () => {
    // Both sides read EXPO_PUBLIC_STRATA_DEV, since NODE_ENV differs across Expo commands.
    const previous = process.env.EXPO_PUBLIC_STRATA_DEV;
    try {
      process.env.EXPO_PUBLIC_STRATA_DEV = "1";
      expect(configuredOrigin("http://localhost:3000").origin).toBe("http://localhost:3000");
      expect(normalizeConfiguredOrigin("http://localhost:3000")).toBe("http://localhost:3000");

      delete process.env.EXPO_PUBLIC_STRATA_DEV;
      expect(() => configuredOrigin("http://localhost:3000")).toThrow("must be an HTTPS origin");
      expect(() => normalizeConfiguredOrigin("http://localhost:3000"))
        .toThrow("must be an HTTPS origin");
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_STRATA_DEV;
      else process.env.EXPO_PUBLIC_STRATA_DEV = previous;
    }
  });
});
