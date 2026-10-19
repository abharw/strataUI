/**
 * Owner pages post Server Actions, and Next rejects an action whose Origin does not match Host.
 * Under `no-referrer` a document sends `Origin: null`, so owner pages must stay `same-origin`.
 */
import type { Metadata } from "next";
import { describe, expect, it, vi } from "vitest";

// Signed out: metadata is read outside a request, where there is no session cookie.
vi.mock("@/server/auth/web-session", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/auth/web-session")>(),
  currentSessionNamespace: async () => null,
}));

import * as homePage from "./(owner)/home/(index)/page";
import * as signInPage from "./(owner)/home/sign-in/page";
import * as spacePage from "./(owner)/spaces/[id]/page";
import * as ownedPage from "./(owner)/pages/[id]/page";
import * as sharedLink from "./(reader)/share/[key]/page";
import * as sharedSpacePage from "./(reader)/share/[key]/pages/[id]/page";

/** Well-formed share keys that resolve to nothing. */
const PAGE_KEY = `pgk_${"a".repeat(43)}`;
const SPACE_KEY = `spk_${"b".repeat(43)}`;
const PAGE_ID = "00000000-0000-4000-8000-000000000000";

describe("referrer policy in page metadata", () => {
  it("keeps every owner surface on same-origin so its actions carry a real Origin", async () => {
    const owner: [string, Metadata][] = [
      ["home", homePage.generateMetadata()],
      // Signed out, but its actions set the session cookie.
      ["sign-in", signInPage.metadata],
      ["space", spacePage.generateMetadata()],
      ["page", await ownedPage.generateMetadata({ params: Promise.resolve({ id: PAGE_ID }) })],
    ];

    for (const [surface, metadata] of owner) {
      expect(metadata.referrer, surface).toBe("same-origin");
    }
  });

  it("keeps share links on no-referrer, because their address is the capability", async () => {
    const shared: [string, Metadata][] = [
      ["page link", await sharedLink.generateMetadata({
        params: Promise.resolve({ key: PAGE_KEY }),
        searchParams: Promise.resolve({}),
      })],
      ["space link", await sharedLink.generateMetadata({
        params: Promise.resolve({ key: SPACE_KEY }),
        searchParams: Promise.resolve({}),
      })],
      ["page in a space link", await sharedSpacePage.generateMetadata({
        params: Promise.resolve({ key: SPACE_KEY, id: PAGE_ID }),
      })],
    ];

    for (const [surface, metadata] of shared) {
      expect(metadata.referrer, surface).toBe("no-referrer");
    }
  });
});
