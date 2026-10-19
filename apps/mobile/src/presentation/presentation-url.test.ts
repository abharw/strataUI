import { describe, expect, it } from "vitest";

import { ANDROID_PRESENTATION_PATH_PATTERNS } from "../../app.config";
import {
  decideNavigation,
  parsePresentationUrl,
  type SharePresentationUrl,
} from "./presentation-url";

const ORIGIN = "https://strata.test";
const PAGE_ID = "00000000-0000-4000-8000-000000000001";
const PAGE_KEY = `pgk_${"a".repeat(43)}`;
const SPACE_KEY = `spk_${"b".repeat(43)}`;

function claimedByAndroid(pathname: string): boolean {
  return ANDROID_PRESENTATION_PATH_PATTERNS.some((pattern) => {
    const source = [...pattern].map((character) => {
      if (character === ".") return ".";
      return character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
    return new RegExp(`^${source}$`).test(pathname);
  });
}

/** Only share links reach `decideNavigation`; `stateForUrl` routes the rest. */
function shareRoot(path: string): SharePresentationUrl {
  const parsed = parsePresentationUrl(`${ORIGIN}${path}`, ORIGIN);
  if (parsed.scope.kind !== "share") throw new Error(`${path} is not a share link`);
  return { ...parsed, scope: parsed.scope };
}

describe("parsePresentationUrl", () => {
  it("accepts a canonical share link and removes embed presentation state", () => {
    const parsed = parsePresentationUrl(
      `${ORIGIN}/share/${PAGE_KEY}?embed=1&from=message`,
      ORIGIN,
    );

    expect(parsed.href).toBe(`${ORIGIN}/share/${PAGE_KEY}?from=message`);
    // The page id is not in the link, so the scope cannot name one either.
    expect(parsed.scope).toEqual({ kind: "share", key: PAGE_KEY, pageId: null });
  });

  it("accepts a shared Space, its members, and the session surface", () => {
    expect(parsePresentationUrl(`${ORIGIN}/share/${SPACE_KEY}`, ORIGIN).scope)
      .toEqual({ kind: "share", key: SPACE_KEY, pageId: null });
    expect(parsePresentationUrl(`${ORIGIN}/share/${SPACE_KEY}/pages/${PAGE_ID}`, ORIGIN).scope)
      .toEqual({ kind: "share", key: SPACE_KEY, pageId: PAGE_ID });
    expect(parsePresentationUrl(`${ORIGIN}/pages/${PAGE_ID}`, ORIGIN).scope)
      .toEqual({ kind: "session", path: `/pages/${PAGE_ID}` });
    expect(parsePresentationUrl(`${ORIGIN}/home/sign-in`, ORIGIN).scope)
      .toEqual({ kind: "session", path: "/home/sign-in" });
  });

  it("rejects a different origin, malformed key, and non-presentation route", () => {
    expect(() => parsePresentationUrl(`https://other.test/share/${PAGE_KEY}`, ORIGIN)).toThrow();
    expect(() => parsePresentationUrl(`${ORIGIN}/share/pgk_short`, ORIGIN)).toThrow();
    expect(() => parsePresentationUrl(`${ORIGIN}/share/sk_${"c".repeat(43)}`, ORIGIN)).toThrow();
    expect(() => parsePresentationUrl(`${ORIGIN}/v1/pages`, ORIGIN)).toThrow();
    // Attachment paths stay in the browser.
    expect(() => parsePresentationUrl(`${ORIGIN}/pages/${PAGE_ID}/assets/asset_1`, ORIGIN)).toThrow();
    expect(() => parsePresentationUrl(`${ORIGIN}/share/${PAGE_KEY}/assets/asset_1`, ORIGIN)).toThrow();
    expect(() => parsePresentationUrl(`${ORIGIN}/home/agents`, ORIGIN)).toThrow();
  });
});

describe("decideNavigation", () => {
  it("keeps a share link on the exact capability and opens other URLs outside", () => {
    const root = shareRoot(`/share/${PAGE_KEY}`);
    expect(decideNavigation(root, `${root.href}#details`)).toEqual({ kind: "allow" });
    expect(decideNavigation(root, `${ORIGIN}/share/pgk_${"z".repeat(43)}`)).toMatchObject({ kind: "external" });
    expect(decideNavigation(root, `${root.href}/assets/asset_123`)).toMatchObject({ kind: "external" });
    expect(decideNavigation(root, `${root.href}?embed=1`)).toMatchObject({ kind: "external" });
    expect(decideNavigation(root, `${root.href}?from=unknown`)).toMatchObject({ kind: "external" });
    expect(decideNavigation(root, `${root.href}?from=message&from=dashboard`)).toMatchObject({ kind: "external" });
  });

  it("allows navigation within one share key, and never onto another", () => {
    const space = shareRoot(`/share/${SPACE_KEY}`);
    expect(decideNavigation(space, `${ORIGIN}/share/${SPACE_KEY}/pages/${PAGE_ID}`)).toEqual({ kind: "allow" });
    expect(decideNavigation(space, `${ORIGIN}/share/spk_${"d".repeat(43)}`)).toMatchObject({ kind: "external" });
    // The isolated view holds one capability; the owner's surface is not it.
    expect(decideNavigation(space, `${ORIGIN}/pages/${PAGE_ID}`)).toMatchObject({ kind: "external" });
    expect(decideNavigation(space, `${ORIGIN}/home`)).toMatchObject({ kind: "external" });
  });

  it("blocks active-content schemes and delegates telephone links to the OS", () => {
    const root = shareRoot(`/share/${PAGE_KEY}`);
    expect(decideNavigation(root, "javascript:alert(1)")).toEqual({ kind: "block" });
    expect(decideNavigation(root, "tel:+15555550100")).toEqual({
      kind: "external",
      href: "tel:+15555550100",
      transport: "system",
    });
  });
});
