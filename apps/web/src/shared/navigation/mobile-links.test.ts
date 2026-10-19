import { describe, expect, it } from "vitest";

import mobileLinks from "@/lib/mobile-links.json";
import { APPLE_PRESENTATION_PATHS, androidAssetLinks, appleAppSiteAssociation } from "./mobile-links";

const APPLE_UUID = [8, 4, 4, 4, 12].map((length) => "?".repeat(length)).join("-");
const APPLE_SPACE_KEY = `spk_${"?".repeat(43)}`;
const APPLE_SHARE_KEY = `${"?".repeat(3)}_${"?".repeat(43)}`;

describe("appleAppSiteAssociation", () => {
  it("publishes only presentation routes and excludes attachment routes", () => {
    const association = appleAppSiteAssociation("ABCDE12345.com.basicsoftware.strata") as {
      applinks: { details: Array<{ appIDs: string[]; components: Array<Record<string, unknown>> }> };
    };
    expect(association.applinks.details[0].appIDs).toEqual(["ABCDE12345.com.basicsoftware.strata"]);
    for (const attachment of ["/pages/*/assets/*", "/share/*/assets/*", "/share/*/pages/*/assets/*"]) {
      expect(association.applinks.details[0].components).toContainEqual(
        expect.objectContaining({ "/": attachment, exclude: true }),
      );
    }
    const includedPaths = association.applinks.details[0].components
      .filter((component) => component.exclude !== true)
      .map((component) => component["/"]);
    // Exactly these paths: unlisted ones do not open the app, and unserved ones would 404 in it.
    expect(includedPaths).toHaveLength(6);
    for (const path of [
      "/home",
      "/home/sign-in",
      `/pages/${APPLE_UUID}`,
      `/spaces/${APPLE_UUID}`,
      `/share/${APPLE_SHARE_KEY}`,
      `/share/${APPLE_SPACE_KEY}/pages/${APPLE_UUID}`,
    ]) {
      expect(includedPaths).toContain(path);
    }
    expect(includedPaths.every((path) => typeof path === "string" && !path.includes("*"))).toBe(true);
  });

  it("stays unpublished until every Apple app id is valid", () => {
    expect(appleAppSiteAssociation(undefined)).toBeNull();
    expect(appleAppSiteAssociation("not-an-app-id")).toBeNull();
  });
});

describe("androidAssetLinks", () => {
  const fingerprint = Array.from({ length: 32 }, () => "AB").join(":");

  it("emits the package and normalized signing fingerprints", () => {
    expect(androidAssetLinks("com.basicsoftware.strata", fingerprint.toLowerCase())).toEqual([{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.basicsoftware.strata",
        sha256_cert_fingerprints: [fingerprint],
      },
    }]);
  });

  it("stays unpublished without a complete signed identity", () => {
    expect(androidAssetLinks(undefined, undefined)).toBeNull();
    expect(androidAssetLinks("com.basicsoftware.strata", "AB:CD")).toBeNull();
  });
});

describe("APPLE_PRESENTATION_PATHS", () => {
  it("renders exactly the shared path list, one Apple wildcard per placeholder", () => {
    // Mirrored in apps/mobile/src/presentation/app-config.test.ts; both render mobile-links.json.
    expect(APPLE_PRESENTATION_PATHS).toEqual(
      mobileLinks.paths.map((path) => path.replaceAll(mobileLinks.wildcard, "?")),
    );
    expect(APPLE_PRESENTATION_PATHS.some((path) => path.includes(mobileLinks.wildcard))).toBe(false);
    for (const [index, path] of APPLE_PRESENTATION_PATHS.entries()) {
      expect(path).toHaveLength(mobileLinks.paths[index].length);
    }
  });
});
