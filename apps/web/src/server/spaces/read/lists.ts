/** Owner inventory reads (Home, Spaces) and shared Space bundle reads. */

import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { fail, isUuid, type HandlerResult } from "@/shared/api/types";
import { hasKeyPrefix, pageUrl, sha256Hex, spaceUrl, verifyHash } from "@/server/credentials/keys";
import { openKeyOrNull } from "@/server/credentials/keys/at-rest";
import { readOrigin } from "@/server/api/http/read-origin";
import { pinnedForAudience, type DocumentAudience } from "@/shared/navigation/audience";
import { hasUnseenChange } from "@/server/pages/read/assemble";
import { readPageList, type PageKind, type PageListRecord } from "@/server/pages/read/pages";
import { writerLabels, type PageWriter } from "@/server/pages/read/provenance";

const NOT_FOUND: HandlerResult = fail(404, {
  error: "No page at that address. The link may have been rotated.",
  code: "not_found",
  next: ["list_pages"],
});

export type ListPage = {
  id: string;
  title: string;
  /** Current standing answer for the inventory preview; null when the spec has none. */
  answer: string | null;
  updatedAt: Date;
  lastViewedAt: Date | null;
  /**
   * Written since the owner last opened it, via `hasUnseenChange`. Owner only; rows built
   * without view state read as seen.
   */
  unseen?: boolean;
  pinned: boolean;
  kind: PageKind;
  /**
   * Always null on listings: rows are serialized to the client, and bundle readers may not
   * hold a member's own key. Use `document.meta.url` on the page instead.
   */
  url: string | null;
  shared: boolean;
  exposureActor: "agent" | "user" | "system";
  spaceId: string;
  spaceSlug: string;
  spaceName: string;
  /** The agent behind the last write. Owner only; readers always get null. */
  writer: PageWriter | null;
  /** The summary from the last write, shown in the attribution tooltip. Owner only. */
  lastSummary: string | null;
};

export type InventorySpace = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  activePageCount: number;
  sharedPageCount: number;
  privatePageCount: number;
  /** Pages changed since the owner last opened them, so a collapsed Space can show a marker. */
  unseenPageCount?: number;
  /** Latest active-page activity, or the Space's own update for an empty Space. */
  updatedAt: Date;
  /** Owner-only stable sharing capability, built from the opened share key. */
  shareUrl: string | null;
  sharedAt: Date | null;
};

export type InventorySpaceSource = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  updatedAt: Date;
  shareUrl: string | null;
  sharedAt: Date | null;
};

export type HomeView = {
  title: "Home";
  spaces: InventorySpace[];
  recentPages: ListPage[];
  spaceCount: number;
  pageCount: number;
};

export type SpaceView = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  pages: ListPage[];
  activePageCount: number;
  sharedPageCount: number;
  privatePageCount: number;
  updatedAt: Date;
  shareUrl: string | null;
  sharedAt: Date | null;
};

async function loadPages(namespaceId: string, options: {
  spaceId?: string;
  sharedOnly?: boolean;
  /** The origin every page link is built against. Unused when links are withheld. */
  baseUrl?: string;
  /** Off on every listing; see `ListPage.url`. */
  exposeDirectUrls?: boolean;
  audience?: DocumentAudience;
} = {}): Promise<ListPage[]> {
  const conditions = [eq(schema.pages.namespaceId, namespaceId)];
  if (options.spaceId !== undefined) conditions.push(eq(schema.pages.spaceId, options.spaceId));
  if (options.sharedOnly === true) conditions.push(eq(schema.pages.shared, true));
  const withUrls = options.exposeDirectUrls !== false;
  const rows = await readPageList(
    conditions,
    options.sharedOnly === true ? "shared" : "recent",
    // Withheld links need no key decryption.
    { openKeys: withUrls },
  );
  const audience = options.audience ?? "owner";
  // Writer labels are owner only.
  const writers = audience === "owner" ? await writerLabels(rows) : null;
  return rows.map((row) => toListPage(
    row,
    withUrls ? options.baseUrl ?? "" : null,
    audience,
    writers?.writer(row) ?? null,
  ));
}

/** @param baseUrl the origin to build page links against, or null to withhold them. */
function toListPage(
  row: PageListRecord,
  baseUrl: string | null,
  audience: DocumentAudience,
  writer: PageWriter | null,
): ListPage {
  return {
    id: row.id,
    title: row.title,
    answer: row.answerVerdict,
    updatedAt: row.updatedAt,
    lastViewedAt: row.lastViewedAt,
    unseen: audience === "owner" && hasUnseenChange(row),
    pinned: pinnedForAudience(row.pinned, audience),
    kind: row.kind,
    url: baseUrl === null || row.readKey === null ? null : pageUrl(baseUrl, row.readKey),
    shared: row.shared,
    exposureActor: row.exposureActor,
    spaceId: row.spaceId,
    spaceSlug: row.spaceSlug,
    spaceName: row.spaceName,
    writer,
    lastSummary: audience === "owner" ? row.lastSummary : null,
  };
}

/**
 * Pinned first, then by activity. Reader audiences have no pinned bit, so bundles sort by
 * recency.
 */
function sortPinnedFirst(pages: ListPage[]): ListPage[] {
  return [...pages].sort((a, b) =>
    Number(b.pinned) - Number(a.pinned) || b.updatedAt.getTime() - a.updatedAt.getTime());
}

function countPages(pages: ListPage[]): Pick<InventorySpace, "activePageCount" | "sharedPageCount" | "privatePageCount" | "unseenPageCount"> {
  const activePageCount = pages.length;
  const sharedPageCount = pages.filter((page) => page.shared).length;
  return {
    activePageCount,
    sharedPageCount,
    privatePageCount: activePageCount - sharedPageCount,
    unseenPageCount: pages.filter((page) => page.unseen === true).length,
  };
}

/**
 * Build the owner's Space inventory, sorted by activity: the latest page update, or the
 * Space's own update when empty.
 */
export function buildSpaceInventory(
  spaces: readonly InventorySpaceSource[],
  pages: readonly ListPage[],
): InventorySpace[] {
  const pagesBySpace = new Map<string, ListPage[]>();
  for (const page of pages) {
    const members = pagesBySpace.get(page.spaceId) ?? [];
    members.push(page);
    pagesBySpace.set(page.spaceId, members);
  }

  return spaces.map<InventorySpace>((space) => {
    const activePages = pagesBySpace.get(space.id) ?? [];
    const latestPageAt = activePages.reduce<Date | null>(
      (latest, page) => latest === null || page.updatedAt > latest ? page.updatedAt : latest,
      null,
    );
    return {
      id: space.id,
      slug: space.slug,
      name: space.name,
      emoji: space.emoji,
      ...countPages(activePages),
      updatedAt: latestPageAt ?? space.updatedAt,
      shareUrl: space.shareUrl,
      sharedAt: space.sharedAt,
    };
  }).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    || a.name.localeCompare(b.name)
    || a.id.localeCompare(b.id));
}

export function buildHomeView(
  spaces: readonly InventorySpaceSource[],
  pages: readonly ListPage[],
): HomeView {
  const visiblePages = sortPinnedFirst([...pages]);
  const activeSpaces = buildSpaceInventory(spaces, pages);
  return {
    title: "Home",
    // Not truncated: namespaces are bounded (50 Spaces, 250 Pages) and client search needs all.
    spaces: activeSpaces,
    recentPages: visiblePages,
    spaceCount: activeSpaces.length,
    pageCount: visiblePages.length,
  };
}

/**
 * The owner's inventory, with no page capabilities in it. Rows are serialized into the client
 * payload, so a `pgk_` link per page would put every page's read key in one document. Space
 * `shareUrl` stays, since "Copy Space link" needs it.
 */
async function loadInventory(namespaceId: string): Promise<{
  pages: ListPage[];
  spaces: InventorySpaceSource[];
}> {
  const baseUrl = await readOrigin();
  const [pages, spaceRows] = await Promise.all([
    loadPages(namespaceId, { exposeDirectUrls: false }),
    getDb().select({
      id: schema.spaces.id,
      slug: schema.spaces.slug,
      name: schema.spaces.name,
      emoji: schema.spaces.emoji,
      updatedAt: schema.spaces.updatedAt,
      sealedShareKey: schema.spaces.sealedShareKey,
      sharedAt: schema.spaces.sharedAt,
    }).from(schema.spaces).where(eq(schema.spaces.namespaceId, namespaceId)),
  ]);
  return {
    pages,
    spaces: spaceRows.map(({ sealedShareKey, ...space }) => ({
      ...space,
      shareUrl: shareUrlFrom(sealedShareKey, baseUrl),
    })),
  };
}

/**
 * A Space's stable link, or null when it is unshared or its key will not open.
 * One unreadable column costs that Space its Copy link, not the whole Home.
 */
function shareUrlFrom(sealedShareKey: string | null, baseUrl: string): string | null {
  if (sealedShareKey === null) return null;
  const key = openKeyOrNull(sealedShareKey);
  return key === null ? null : spaceUrl(baseUrl, key);
}

/** Home for a namespace that is already authorized (an owner session). */
export async function loadHomeForNamespace(namespaceId: string): Promise<HomeView> {
  const inventory = await loadInventory(namespaceId);
  return buildHomeView(inventory.spaces, inventory.pages);
}

/**
 * Whether this namespace owns the Space. A foreign Space looks the same as a missing one, and
 * the uuid shape check keeps malformed ids from becoming a Postgres 500.
 */
export async function ownsSpace(spaceId: string, namespaceId: string): Promise<boolean> {
  if (!isUuid(spaceId) || !isUuid(namespaceId)) return false;
  const [space] = await getDb().select({ id: schema.spaces.id })
    .from(schema.spaces)
    .where(and(
      eq(schema.spaces.id, spaceId),
      eq(schema.spaces.namespaceId, namespaceId),
    ))
    .limit(1);
  return space !== undefined;
}

export async function loadSpace(key: string): Promise<{ ok: true; value: SpaceView } | { ok: false; result: HandlerResult }> {
  if (!hasKeyPrefix(key, "space")) return { ok: false, result: NOT_FOUND };
  const [space] = await getDb().select({
    id: schema.spaces.id,
    slug: schema.spaces.slug,
    name: schema.spaces.name,
    emoji: schema.spaces.emoji,
    namespaceId: schema.spaces.namespaceId,
    shareKeyHash: schema.spaces.shareKeyHash,
    sharedAt: schema.spaces.sharedAt,
    updatedAt: schema.spaces.updatedAt,
  }).from(schema.spaces).where(eq(schema.spaces.shareKeyHash, sha256Hex(key)));
  if (space === undefined || space.shareKeyHash === null || !verifyHash(key, space.shareKeyHash)) {
    return { ok: false, result: NOT_FOUND };
  }
  const visible = await loadPages(space.namespaceId, {
    spaceId: space.id,
    sharedOnly: true,
    exposeDirectUrls: false,
    audience: "reader",
  });
  const counts = countPages(visible);
  const latestPageAt = visible.reduce<Date | null>(
    (latest, page) => latest === null || page.updatedAt > latest ? page.updatedAt : latest,
    null,
  );
  return { ok: true, value: {
    id: space.id,
    slug: space.slug,
    name: space.name,
    emoji: space.emoji,
    pages: sortPinnedFirst(visible),
    ...counts,
    updatedAt: latestPageAt ?? space.updatedAt,
    // The bundle viewer already holds the capability; keep owner-only data out.
    shareUrl: null,
    sharedAt: space.sharedAt,
  } };
}

/**
 * A `/v1/spaces` row: counts and a bundle flag, never a capability. Counts cover the same pages
 * `/v1/pages` lists, so totals agree.
 */
export interface SpaceRow {
  space_id: string;
  slug: string;
  name: string;
  emoji: string;
  shared_bundle: boolean;
  page_count: number;
  shared_page_count: number;
  freshest_change: Date | null;
}

export async function readSpaceRows(namespaceId: string): Promise<SpaceRow[]> {
  return getDb().select({
    space_id: schema.spaces.id,
    slug: schema.spaces.slug,
    name: schema.spaces.name,
    emoji: schema.spaces.emoji,
    shared_bundle: sql<boolean>`${schema.spaces.shareKeyHash} IS NOT NULL`,
    page_count: sql<number>`count(${schema.pages.id})::int`,
    shared_page_count: sql<number>`count(${schema.pages.id}) filter (where ${schema.pages.shared})::int`,
    freshest_change: sql<Date | null>`max(${schema.pages.updatedAt})`,
  }).from(schema.spaces)
    .leftJoin(schema.pages, eq(schema.pages.spaceId, schema.spaces.id))
    .where(eq(schema.spaces.namespaceId, namespaceId))
    .groupBy(schema.spaces.id)
    .orderBy(desc(sql`max(${schema.pages.updatedAt})`), desc(schema.spaces.updatedAt));
}
