import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { viewBaseFor } from "@/server/pages/read/assemble";
import { ownerRoutes, sharePath } from "./owner-routes";

const APP_DIR = join(__dirname, "..", "..", "app");
const SPACE_ID = "00000000-0000-4000-8000-000000000002";
const PAGE_ID = "00000000-0000-4000-8000-000000000003";

/**
 * Whether a URL resolves to a file Next serves: walks segments like the router (literal, then
 * `[dynamic]`, with `(group)` folders transparent) and requires a `page.tsx` or `route.ts`.
 */
function resolvesOnDisk(url: string): boolean {
  const segments = url.split("?")[0].split("/").filter((segment) => segment !== "");
  return walk(APP_DIR, segments);
}

const GROUP = /^\([^)]+\)$/;
const DYNAMIC = /^\[[^\]]+\]$/;

function walk(dir: string, segments: readonly string[]): boolean {
  const folders = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (folders.some((entry) => GROUP.test(entry.name)
    && walk(join(dir, entry.name), segments))) return true;
  const [segment, ...rest] = segments;
  if (segment === undefined) {
    return existsSync(join(dir, "page.tsx")) || existsSync(join(dir, "route.ts"));
  }
  const next = folders.find((entry) => entry.name === segment)
    ?? folders.find((entry) => DYNAMIC.test(entry.name));
  return next !== undefined && walk(join(dir, next.name), rest);
}

function targets(): Record<string, string> {
  const routes = ownerRoutes();
  return {
    home: routes.home,
    spaceView: routes.spaceView(SPACE_ID),
    page: routes.page(PAGE_ID),
    pageAttachment: routes.pageAttachment(PAGE_ID, "folder/report 1.pdf"),
    pageChanges: routes.pageChanges(PAGE_ID),
    agents: routes.agents,
    search: routes.search,
  };
}

describe("owner routes", () => {
  const routes = ownerRoutes();

  it("names one canonical address per thing", () => {
    expect(routes.home).toBe("/home");
    expect(routes.page(PAGE_ID)).toBe(`/pages/${PAGE_ID}`);
    expect(routes.spaceView(SPACE_ID)).toBe(`/spaces/${SPACE_ID}`);
    expect(routes.pageChanges(PAGE_ID)).toBe(`/pages/${PAGE_ID}/changes`);
    expect(routes.pageAttachment(PAGE_ID, "folder/report 1.pdf"))
      .toBe(`/pages/${PAGE_ID}/assets/folder%2Freport%201.pdf`);
  });

  it("keeps only reads in the route set: the acts are Server Actions", () => {
    // Owner mutations are Server Actions in `src/app/(owner)/home/actions.ts` and have no URL.
    expect(routes.agents).toBe("/home/agents");
    expect(routes.search).toBe("/home/search");
    expect(Object.keys(routes).sort()).toEqual([
      "agents",
      "home",
      "page",
      "pageAttachment",
      "pageChanges",
      "search",
      "spaceView",
    ]);
  });

  it("builds no address out of a secret", () => {
    expect(Object.values(targets()).filter((url) => /(?:pgk|spk|sw|sr|sv)_/u.test(url)))
      .toEqual([]);
  });

  it("gives a share key one shape, whichever kind it is", () => {
    expect(sharePath(`pgk_${"a".repeat(43)}`)).toBe(`/share/pgk_${"a".repeat(43)}`);
    expect(sharePath(`spk_${"a".repeat(43)}`)).toBe(`/share/spk_${"a".repeat(43)}`);
  });

  it("mints live attachment refreshes inside the address that is rendering", () => {
    expect(viewBaseFor({
      kind: "owner-session",
      namespaceId: "00000000-0000-4000-8000-000000000001",
    }, PAGE_ID)).toBe(`/pages/${PAGE_ID}`);
    expect(viewBaseFor({
      kind: "direct",
      namespaceId: "00000000-0000-4000-8000-000000000001",
      pageKey: "pgk_mine",
    }, PAGE_ID)).toBe("/share/pgk_mine");
    expect(viewBaseFor({
      kind: "bundle",
      namespaceId: "00000000-0000-4000-8000-000000000001",
      spaceId: SPACE_ID,
      bundleKey: "spk_b",
    }, PAGE_ID)).toBe(`/share/spk_b/pages/${PAGE_ID}`);
  });

  it("points every target at a route that exists on disk", () => {
    const unresolved = Object.entries(targets())
      .filter(([, url]) => !resolvesOnDisk(url))
      .map(([name, url]) => `${name} -> ${url}`);
    expect(unresolved).toEqual([]);
  });
});
