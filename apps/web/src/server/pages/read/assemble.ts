/** Human capability-link read path over canonical JSON Render page specs. */

import "server-only";
import { waitUntil } from "@vercel/functions";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";

import { REGISTRY_VERSION } from "@/page-content/catalog-versions";
import { getDb, schema } from "@/server/db";
import { THUMB_PARAM, requestedVariant, serveUrls } from "@/server/assets";
import type { AttachmentResources } from "@/page-content/attachments/resources";
import type { StrataSpec } from "@/page-content/schema";
import { VIEW_LOG_DEBOUNCE_MS } from "@/page-content/document/limits";
import type { Meta, SourceEvent, UserState } from "@/page-content/document/types";
import { fail, isUuid, ok, type HandlerResult } from "@/shared/api/types";
import { approvalsIn, asksFor } from "@/server/pages/decisions";
import { hasKeyPrefix, pageUrl, sha256Hex, verifyHash } from "@/server/credentials/keys";
import { pinnedForAudience, type DocumentAudience } from "@/shared/navigation/audience";
import { readOrigin } from "@/server/api/http/read-origin";
import { ownerRoutes, sharePath } from "@/shared/navigation/owner-routes";
import { pageLinkUrl, type ViewerContext } from "@/shared/navigation/viewer";

import { readPage, readPageList, readPageProbe, sequenceChildrenOf, type PageListRecord, type PageProbe, type PageRecord } from "./pages";
import { writerLabels, type PageWriter } from "./provenance";

const NOT_FOUND: HandlerResult = fail(404, {
  error: "No page at that address. The link may have been rotated.",
  code: "page_not_found",
  next: ["list_pages"],
});

export type ViewOrigin = "message" | "home" | "direct";
export type RecentChange = {
  version: number;
  summary: string;
  at: string;
  /** `resource_id`s attached to this write. Omitted when empty. */
  assetRefs?: readonly string[];
};

const MAX_RECENT_CHANGES = 8;

/** Ceiling for the "View steps" trail, separate from the unseen-changes popover. */
const MAX_LIVE_STEPS = 40;

/**
 * The stored spec with meta and user state assembled on. `version` is the `base_version` a
 * write must echo back; agents get the same shape minus `user` via `GET /v1/pages/:id`.
 */
interface ReadDocument {
  meta: Meta;
  spec: StrataSpec;
  user: UserState;
  version: number;
  agent_updating: boolean;
}

export interface SequenceLink {
  href: string;
  title: string;
}

/** The spec's `sequence` resolved for one audience; links this reader cannot follow are absent. */
export interface AssembledSequence {
  previous?: SequenceLink;
  next?: SequenceLink;
  up?: SequenceLink;
}

export interface AssembledPage {
  document: ReadDocument;
  pageId: string;
  namespaceId: string;
  spaceId: string;
  spaceName: string;
  shared: boolean;
  updatedAt: Date;
  recent: RecentChange[];
  /** Who the page belongs to, for a reader who is not them. Null when unnamed. */
  ownerName: string | null;
  /** The agent behind the last write. Owner only: a share link does not expose the owner's agents. */
  writer: PageWriter | null;
  lastSummary: string | null;
  /** The "View steps" trail, oldest last; null when the page did not ask for one. */
  steps: RecentChange[] | null;
  /** This page's place in a sequence for this audience; null when nothing resolves. */
  sequence: AssembledSequence | null;
}

export function parseViewOrigin(value: string | null): ViewOrigin {
  if (value === "message" || value === "home") return value;
  return "direct";
}

async function loadById(pageId: string): Promise<PageRecord | null> {
  return isUuid(pageId) ? readPage([eq(schema.pages.id, pageId)]) : null;
}

/** Strips owner-only meta before a document can enter an RSC payload. */
function documentMetaForAudience(meta: Meta, audience: DocumentAudience): Meta {
  const { source_event, ...readerMeta } = meta;
  return audience === "owner" && source_event !== undefined
    ? { ...readerMeta, source_event }
    : readerMeta;
}

/**
 * Whether the document may carry the page's own `pgk_` key: only on the direct share link and
 * the owner's page. A Space bundle withholds it, since a copied page key would outlive a
 * bundle-key rotation.
 */
type UrlExposure = "expose" | "withhold";

function toDocument(
  row: PageRecord,
  audience: DocumentAudience,
  baseUrl: string,
  urls: UrlExposure,
): ReadDocument {
  return {
    meta: documentMetaForAudience({
      title: row.title,
      slug: row.slug,
      kind: row.kind,
      // The excerpt is the owner's private message to their agent; strip it before the payload.
      ...(row.sourceEvent === null ? {} : { source_event: row.sourceEvent as SourceEvent }),
      url: urls === "withhold" || row.readKey === null ? null : pageUrl(baseUrl, row.readKey),
      written_registry_version: row.registryVersion,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    }, audience),
    spec: row.document,
    // Pinning is owner curation; strip it at the same boundary as `source_event`.
    user: { pinned: pinnedForAudience(row.pinned, audience) },
    version: row.version,
    agent_updating: row.updatingUntil !== null && row.updatingUntil.getTime() > Date.now(),
  };
}

/** Writes this reader has not seen yet, from the write log, oldest last to match the poll. */
async function unseenChanges(pageId: string, since: Date | null): Promise<RecentChange[]> {
  return writeTrail(pageId, since, MAX_RECENT_CHANGES);
}

/** The newest `limit` write-log rows after `since`, oldest last (`page_writes_page_id_at_idx`). */
async function writeTrail(pageId: string, since: Date | null, limit: number): Promise<RecentChange[]> {
  const rows = await getDb()
    .select({
      version: schema.pageWrites.version,
      summary: schema.pageWrites.summary,
      at: schema.pageWrites.at,
      assetRefs: schema.pageWrites.assetRefs,
    })
    .from(schema.pageWrites)
    .where(since === null
      ? eq(schema.pageWrites.pageId, pageId)
      : and(eq(schema.pageWrites.pageId, pageId), gt(schema.pageWrites.at, since)))
    .orderBy(desc(schema.pageWrites.at))
    .limit(limit);
  return rows
    .map((row) => ({
      version: row.version,
      summary: row.summary,
      at: row.at.toISOString(),
      ...(row.assetRefs.length === 0 ? {} : { assetRefs: row.assetRefs }),
    }))
    .reverse();
}

/**
 * Whether the page has a write the owner has not seen. Shared by the Page changes popover and
 * the Home unseen marker; a never-viewed page counts as unseen.
 */
export function hasUnseenChange(row: { updatedAt: Date; lastViewedAt: Date | null }): boolean {
  return row.lastViewedAt === null || row.updatedAt > row.lastViewedAt;
}

const SEQUENCE_KEYS = ["previous", "next", "up"] as const;

/** The bundle key a reader arrived on via a Space share link; null otherwise. */
export type BundleAuthority = { spaceId: string; bundleKey: string };

/**
 * The `ViewerContext` used to resolve sequence links, which point at other pages like any
 * cross-page link. A page-key reader resolves nothing, so its placeholder key is never read.
 */
function sequenceContext(
  audience: DocumentAudience,
  namespaceId: string,
  bundle: BundleAuthority | null,
): ViewerContext {
  if (audience === "owner") return { kind: "owner-session", namespaceId };
  if (bundle !== null) return { kind: "bundle", namespaceId, ...bundle };
  return { kind: "direct", namespaceId, pageKey: "" };
}

/**
 * Siblings under the same `up` parent, nearest first on each side of `position`. Ties fall
 * back to creation order, then id. Lists, so a bundle reader can skip pages it cannot open.
 */
export function derivedNeighbours(
  siblings: readonly PageListRecord[],
  position: number,
): { previous: PageListRecord[]; next: PageListRecord[] } {
  const ordered = siblings
    .filter((page): page is PageListRecord & { sequencePosition: number } => page.sequencePosition !== null)
    .sort((a, b) =>
      a.sequencePosition - b.sequencePosition
      || a.createdAt.getTime() - b.createdAt.getTime()
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    previous: ordered.filter((page) => page.sequencePosition < position).reverse(),
    next: ordered.filter((page) => page.sequencePosition > position),
  };
}

/**
 * Resolve a spec's `sequence` for one audience. `{ page }` links resolve for the owner and
 * bundle readers only; `{ url }` links resolve for anyone. A `position` under a `{ page }` `up`
 * fills missing `previous`/`next` from the nearest reachable siblings; explicit links win.
 * New siblings do not move this page's version, so open tabs see them on the next full read.
 */
async function assembleSequence(
  pageId: string,
  sequence: StrataSpec["sequence"],
  audience: DocumentAudience,
  namespaceId: string,
  bundle: BundleAuthority | null,
): Promise<AssembledSequence | null> {
  if (sequence === undefined) return null;

  const context = sequenceContext(audience, namespaceId, bundle);
  const ids = new Set<string>();
  for (const key of SEQUENCE_KEYS) {
    const link = sequence[key];
    if (link !== undefined && "page" in link) ids.add(link.page);
  }
  const parent = sequence.up !== undefined && "page" in sequence.up && sequence.position !== undefined
    ? { id: sequence.up.page, position: sequence.position }
    : null;

  const [named, siblings] = context.kind === "direct"
    ? [[], []]
    : await Promise.all([
      ids.size > 0
        ? readPageList([inArray(schema.pages.id, [...ids]), eq(schema.pages.namespaceId, namespaceId)], "recent", { openKeys: false })
        : Promise.resolve([] as PageListRecord[]),
      parent !== null
        ? readPageList([sequenceChildrenOf(parent.id), eq(schema.pages.namespaceId, namespaceId)], "recent", { openKeys: false })
        : Promise.resolve([] as PageListRecord[]),
    ]);
  const pages = new Map<string, PageListRecord>(named.map((page) => [page.id, page]));
  const derived = parent === null
    ? { previous: [], next: [] }
    : derivedNeighbours(siblings.filter((page) => page.id !== pageId), parent.position);

  const resolved: AssembledSequence = {};
  for (const key of SEQUENCE_KEYS) {
    const link = sequence[key];
    if (link === undefined) {
      if (key === "up") continue;
      for (const target of derived[key]) {
        const href = pageLinkUrl(target, context);
        if (href === null) continue;
        resolved[key] = { href, title: target.title };
        break;
      }
      continue;
    }
    if ("url" in link) {
      resolved[key] = { href: link.url, title: link.url };
      continue;
    }
    const target = pages.get(link.page);
    if (target === undefined) continue;
    const href = pageLinkUrl(target, context);
    if (href === null) continue;
    resolved[key] = { href, title: target.title };
  }
  return Object.keys(resolved).length === 0 ? null : resolved;
}

async function assembleRow(
  row: PageRecord,
  audience: DocumentAudience,
  baseUrl: string,
  urls: UrlExposure,
  bundle: BundleAuthority | null,
): Promise<AssembledPage | null> {
  const document = toDocument(row, audience, baseUrl, urls);
  const writers = audience === "owner" ? await writerLabels([row]) : null;
  const unseen = hasUnseenChange(row);
  const [recent, trail, sequence] = await Promise.all([
    unseen ? unseenChanges(row.id, row.lastViewedAt) : [],
    // Only pages with live steps read the trail.
    row.liveSteps ? writeTrail(row.id, null, MAX_LIVE_STEPS) : null,
    assembleSequence(row.id, row.document.sequence, audience, row.namespaceId, bundle),
  ]);
  // Fallback when the log has no rows: the row's own last write.
  const lastWrite: RecentChange = { version: row.version, summary: row.lastSummary, at: row.updatedAt.toISOString() };
  return {
    document,
    pageId: row.id,
    namespaceId: row.namespaceId,
    spaceId: row.spaceId,
    spaceName: row.spaceName,
    shared: row.shared,
    updatedAt: row.updatedAt,
    ownerName: row.ownerName,
    writer: writers?.writer(row) ?? null,
    lastSummary: audience === "owner" ? row.lastSummary : null,
    recent: unseen && recent.length === 0 ? [lastWrite] : recent,
    steps: trail === null ? null : trail.length === 0 ? [lastWrite] : trail,
    sequence,
  };
}

/**
 * A page from its share key alone. The key is looked up by hash, then confirmed with a
 * constant-time compare, so the link does not need to name the page id.
 */
export async function assemblePage(key: string, baseUrl?: string): Promise<{ ok: true; value: AssembledPage } | { ok: false; result: HandlerResult }> {
  if (!hasKeyPrefix(key, "page")) return { ok: false, result: NOT_FOUND };
  const row = await readPage([eq(schema.pages.readKeyHash, sha256Hex(key))]);
  if (row === null || !verifyHash(key, row.readKeyHash)) return { ok: false, result: NOT_FOUND };
  const value = await assembleRow(row, "reader", baseUrl ?? await readOrigin(), "expose", null);
  return value === null ? { ok: false, result: NOT_FOUND } : { ok: true, value };
}

/**
 * A bundle key may render only a currently exposed member page. `bundleKey` lets sequence and
 * cross-page links resolve to siblings in the bundle; pass null when nothing is rendered.
 */
export async function assembleSharedPage(
  pageId: string,
  spaceId: string,
  bundleKey: string | null,
  baseUrl?: string,
): Promise<{ ok: true; value: AssembledPage } | { ok: false; result: HandlerResult }> {
  const row = await loadById(pageId);
  if (row === null || row.spaceId !== spaceId || !row.shared) return { ok: false, result: NOT_FOUND };
  const bundle = bundleKey === null ? null : { spaceId, bundleKey };
  const value = await assembleRow(row, "reader", baseUrl ?? await readOrigin(), "withhold", bundle);
  return value === null ? { ok: false, result: NOT_FOUND } : { ok: true, value };
}

/** The namespace home capability may render any page it owns without exposing the page key. */
export async function assembleOwnedPage(pageId: string, namespaceId: string, baseUrl?: string): Promise<{ ok: true; value: AssembledPage } | { ok: false; result: HandlerResult }> {
  const row = await loadById(pageId);
  if (row === null || row.namespaceId !== namespaceId) return { ok: false, result: NOT_FOUND };
  const value = await assembleRow(row, "owner", baseUrl ?? await readOrigin(), "expose", null);
  return value === null ? { ok: false, result: NOT_FOUND } : { ok: true, value };
}

/** Resource ids named by attachment-list items in the spec. */
function attachmentIds(spec: StrataSpec): Set<string> {
  const wanted = new Set<string>();
  for (const element of Object.values(spec.elements)) {
    if (element.type !== "attachment-list") continue;
    const items = element.props.items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (typeof item === "object" && item !== null && typeof (item as { resource_id?: unknown }).resource_id === "string") {
        wanted.add((item as { resource_id: string }).resource_id);
      }
    }
  }
  return wanted;
}

/**
 * The spec and the trail are one set to the asset layer: a step's screenshot is proven to be on
 * the page the same way an attachment is, so the trail is not a weaker path to a file.
 */
export interface PageFiles {
  spec: StrataSpec;
  /** The trail as assembled, or null when the surface draws none. */
  steps: readonly RecentChange[] | null;
}

function pageAssetIds(page: PageFiles): Set<string> {
  const wanted = attachmentIds(page.spec);
  for (const step of page.steps ?? []) {
    for (const ref of step.assetRefs ?? []) wanted.add(ref);
  }
  return wanted;
}

/** Where a reader is standing, as a path their current authority already covers. */
export function viewBaseFor(context: ViewerContext, pageId: string): string {
  switch (context.kind) {
    case "owner-session": return ownerRoutes().page(pageId);
    case "direct": return sharePath(context.pageKey);
    case "bundle": return `${sharePath(context.bundleKey)}/pages/${pageId}`;
  }
}

/**
 * Attachment hrefs built from the reader's own capability plus the resource id. The signed
 * `/assets/...` URL lasts ten minutes, so the route mints it at tap time; bundle pages do not
 * poll and would otherwise go stale. The link is as strong as the page link and no stronger.
 */
export async function assetHrefs(
  page: PageFiles,
  namespaceId: string,
  viewBase: string,
): Promise<AttachmentResources> {
  const wanted = pageAssetIds(page);
  if (wanted.size === 0) return {};
  // Assets without bytes yet must render as "not available" rather than a 404 link.
  const servable = await serveUrls(namespaceId, [...wanted]);
  return Object.fromEntries([...servable].map(([resourceId, asset]) => [resourceId, {
    href: `${viewBase}/assets/${encodeURIComponent(resourceId)}`,
    filename: asset.filename,
    media_type: asset.media_type,
    size_bytes: asset.size_bytes,
    width: asset.width,
    height: asset.height,
    // Same reader capability, asking for the 640px variant; omitted when there is none.
    ...(asset.thumb_url === null
      ? {}
      : {
        thumb_url: `${viewBase}/assets/${encodeURIComponent(resourceId)}?${THUMB_PARAM}`,
        thumb_width: asset.thumb_width,
        thumb_height: asset.thumb_height,
      }),
    credit: asset.credit,
    source_url: asset.source_url,
  }]));
}

/**
 * Prove the resource is on this page, mint a signature, and redirect to the bytes. Takes the
 * whole request so the `?w=thumb` variant is read in one place for every route.
 */
export async function attachmentRedirect(
  request: Request,
  page: PageFiles,
  namespaceId: string,
  resourceId: string,
): Promise<Response> {
  const variant = requestedVariant(new URL(request.url).searchParams);
  if (!pageAssetIds(page).has(resourceId)) return new Response(null, { status: 404 });
  const servable = await serveUrls(namespaceId, [resourceId]);
  const asset = servable.get(resourceId);
  if (asset === undefined) return new Response(null, { status: 404 });
  // Fall back to the original when no thumbnail exists.
  const location = variant === "thumb" ? asset.thumb_url ?? asset.url : asset.url;
  return new Response(null, {
    status: 302,
    headers: { location, "cache-control": "no-store" },
  });
}

/**
 * The same redirect inside a shared Space, for `/share/:spk/pages/:id/assets/:resource` and the
 * one-page `/share/:spk/assets/:resource`. Bundles show no trail, so `steps` is null.
 */
export async function bundleAttachmentRedirect(
  request: Request,
  spaceId: string,
  pageId: string,
  resourceId: string,
): Promise<Response> {
  // No chrome is rendered, so no bundle authority is needed.
  const assembled = await assembleSharedPage(pageId, spaceId, null);
  if (!assembled.ok) return new Response(null, { status: 404 });
  return attachmentRedirect(
    request,
    { spec: assembled.value.document.spec, steps: null },
    assembled.value.namespaceId,
    resourceId,
  );
}

/** A `LinkSchema` value once it has entered `props` as `unknown`: `{ page }` or `{ url }`. */
function linkPageId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const page = (value as { page?: unknown }).page;
  return typeof page === "string" ? page : undefined;
}

/**
 * Add `href` to a `{ page }` link this viewer may open and leave others untouched, so
 * `BlockLink` can tell resolved from not shared.
 */
function hydrateLink(value: unknown, urls: ReadonlyMap<string, string | null>): unknown {
  const page = linkPageId(value);
  if (page === undefined) return value;
  const href = urls.get(page);
  return href === undefined || href === null ? value : { ...(value as object), href };
}

/** Hydrate `link` in each item of a collection prop; returns the same array if nothing changed. */
function hydrateLinksIn(items: unknown, urls: ReadonlyMap<string, string | null>): unknown {
  // Cast back from `any[]` so `any` does not leak through `.map`.
  if (!Array.isArray(items)) return items;
  const array = items as readonly unknown[];
  let changed = false;
  const hydrated = array.map((item): unknown => {
    if (typeof item !== "object" || item === null || !("link" in item)) return item;
    const record = item as Record<string, unknown>;
    const link = hydrateLink(record.link, urls);
    if (link === record.link) return item;
    changed = true;
    return { ...record, link };
  });
  return changed ? hydrated : items;
}

/**
 * Resolve internal page ids in links (`link-button`, `card`, `item-list`, `checklist`,
 * `timeline`) for this viewer with one batch query, without changing the stored document.
 */
export async function hydratePageLinks(spec: StrataSpec, context: ViewerContext): Promise<StrataSpec> {
  const ids = new Set<string>();
  for (const element of Object.values(spec.elements)) {
    if (element.type === "link-button" && typeof element.props.page_id === "string") {
      ids.add(element.props.page_id);
      continue;
    }
    if (element.type === "card") {
      const page = linkPageId(element.props.link);
      if (page !== undefined) ids.add(page);
      continue;
    }
    if (element.type === "item-list" || element.type === "checklist" || element.type === "timeline") {
      const collection = element.type === "timeline" ? element.props.events : element.props.items;
      if (!Array.isArray(collection)) continue;
      for (const item of collection) {
        if (typeof item !== "object" || item === null) continue;
        const page = linkPageId((item as { link?: unknown }).link);
        if (page !== undefined) ids.add(page);
      }
    }
  }
  if (ids.size === 0) return spec;
  const rows = await readPageList([
    inArray(schema.pages.id, [...ids]),
    eq(schema.pages.namespaceId, context.namespaceId),
  ], "recent", { openKeys: false });
  const urls = new Map(rows.map((row) => [row.id, pageLinkUrl(row, context)]));
  const elements = { ...spec.elements };
  for (const [id, element] of Object.entries(elements)) {
    if (element.type === "link-button" && typeof element.props.page_id === "string") {
      const url = urls.get(element.props.page_id);
      if (url !== undefined && url !== null) {
        elements[id] = { ...element, props: { label: element.props.label, url } };
      }
      continue;
    }
    if (element.type === "card" && element.props.link !== undefined) {
      const link = hydrateLink(element.props.link, urls);
      if (link !== element.props.link) elements[id] = { ...element, props: { ...element.props, link } };
      continue;
    }
    if ((element.type === "item-list" || element.type === "checklist") && element.props.items !== undefined) {
      const items = hydrateLinksIn(element.props.items, urls);
      if (items !== element.props.items) elements[id] = { ...element, props: { ...element.props, items } };
      continue;
    }
    if (element.type === "timeline" && element.props.events !== undefined) {
      const events = hydrateLinksIn(element.props.events, urls);
      if (events !== element.props.events) elements[id] = { ...element, props: { ...element.props, events } };
      continue;
    }
  }
  return { ...spec, elements };
}

/**
 * Log a view for everyone, but only owner reads set `lastViewedAt`, which drives the owner's
 * unseen badge. The debounce uses the view log's last entry instead.
 */
export function recordView(pageId: string, origin: ViewOrigin, seen: boolean): Promise<void> {
  const written = writeView(pageId, origin, seen);
  // Runs after the response; `waitUntil` keeps that guarantee on the write itself.
  waitUntil(written);
  return written;
}

async function writeView(pageId: string, origin: ViewOrigin, seen: boolean): Promise<void> {
  const db = getDb();
  // One statement, no transaction: the debounce is advisory and a race adds at most one row.
  // The existence check avoids an FK error on a page deleted mid-render.
  const cutoff = new Date(Date.now() - VIEW_LOG_DEBOUNCE_MS);
  await db.execute(sql`
    insert into ${schema.viewLog} (page_id, origin)
    select ${pageId}::uuid, ${origin}::view_origin
    where exists (select 1 from ${schema.pages} where ${schema.pages.id} = ${pageId}::uuid)
      and not exists (
        select 1 from ${schema.viewLog}
        where ${schema.viewLog.pageId} = ${pageId}::uuid and ${schema.viewLog.at} > ${cutoff}
      )
  `);
  if (!seen) return;
  await db.update(schema.pages)
    .set({ lastViewedAt: new Date() })
    .where(eq(schema.pages.id, pageId));
}

const INVALID_SINCE: HandlerResult = fail(422, {
  error: "since must be an integer version. Use the version you last rendered.",
  code: "invalid_since",
  path: "/since",
  next: ["get_page"],
});

/**
 * Answer a quiet poll tick from the probe, without reading the spec. Returns null when the tick
 * needs a full read. Pages with approvals are never quiet, since answers ride every tick.
 * Title, pin and Space are included because they change without moving the version.
 */
function quietTick(probe: PageProbe, since: number, wantAssets: boolean, audience: DocumentAudience): HandlerResult | null {
  if (probe.hasApprovals) return null;
  if (probe.version > since) return null;
  // A tab only asks for files it already shows, so on a live-steps page a step image is on screen.
  if (wantAssets && (probe.hasAttachments || probe.liveSteps)) return null;
  return ok({
    title: probe.title,
    // Pinning is owner curation; a forwarded key polls this endpoint too.
    user: { pinned: pinnedForAudience(probe.pinned, audience) },
    ...(audience === "owner"
      ? { space: { name: probe.spaceName, url: ownerRoutes().spaceView(probe.spaceId) } }
      : {}),
    version: probe.version,
    registry_version: REGISTRY_VERSION,
    agent_updating: probe.updatingUntil !== null && probe.updatingUntil.getTime() > Date.now(),
    updated_at: probe.updatedAt.toISOString(),
    writer: audience === "owner" ? probe.writer : null,
    snapshot: null,
  });
}

export async function listChanges(key: string, since: number, wantAssets = false): Promise<HandlerResult> {
  if (!Number.isInteger(since) || since < 0) return INVALID_SINCE;
  if (!hasKeyPrefix(key, "page")) return NOT_FOUND;
  const probe = await readPageProbe([eq(schema.pages.readKeyHash, sha256Hex(key))]);
  if (probe === null || !verifyHash(key, probe.readKeyHash)) return NOT_FOUND;
  const quiet = quietTick(probe, since, wantAssets, "reader");
  if (quiet !== null) return quiet;

  const assembled = await assemblePage(key);
  if (!assembled.ok) return assembled.result;
  return changesResult(assembled.value, since, {
    kind: "direct",
    namespaceId: assembled.value.namespaceId,
    pageKey: key,
  }, wantAssets);
}

/** Live owner polling for a paired web session; no namespace key enters the response. */
export async function listSessionOwnedChanges(
  pageId: string,
  namespaceId: string,
  since: number,
  wantAssets = false,
): Promise<HandlerResult> {
  if (!Number.isInteger(since) || since < 0) return INVALID_SINCE;
  if (!isUuid(pageId)) return NOT_FOUND;
  const probe = await readPageProbe([
    eq(schema.pages.id, pageId),
    eq(schema.pages.namespaceId, namespaceId),
  ]);
  if (probe === null) return NOT_FOUND;
  const quiet = quietTick(probe, since, wantAssets, "owner");
  if (quiet !== null) return quiet;

  const assembled = await assembleOwnedPage(pageId, namespaceId);
  if (!assembled.ok) return assembled.result;
  return changesResult(assembled.value, since, { kind: "owner-session", namespaceId }, wantAssets);
}

async function changesResult(value: AssembledPage, since: number, context: ViewerContext, wantAssets: boolean): Promise<HandlerResult> {
  const doc = value.document;
  // Skip link hydration on quiet ticks, which send no snapshot.
  const changed = doc.version > since;
  // Approval taps do not move the version, so answers ride every tick on pages that ask.
  const hasAsks = approvalsIn(doc.spec).length > 0;
  // Serving URLs expire in minutes, so the tab asks for fresh ones; a new spec may name new files.
  const page: PageFiles = { spec: doc.spec, steps: value.steps };
  const files = (changed || wantAssets) && pageAssetIds(page).size > 0;
  return ok({
    ...(hasAsks ? { asks: await asksFor(value.pageId, doc.spec) } : {}),
    ...(files ? { assets: await assetHrefs(page, value.namespaceId, viewBaseFor(context, value.pageId)) } : {}),
    // The whole trail, not a delta, and only on ticks that carry a spec.
    ...(changed && value.steps !== null ? { steps: value.steps } : {}),
    // Derived from the spec, so it changes on the same tick, including to null.
    ...(changed ? { sequence: value.sequence } : {}),
    // Title, pin and Space change without moving the version, so they ride every tick.
    title: doc.meta.title,
    user: doc.user,
    ...(context.kind === "owner-session"
      ? { space: { name: value.spaceName, url: ownerRoutes().spaceView(value.spaceId) } }
      : {}),
    version: doc.version,
    registry_version: REGISTRY_VERSION,
    agent_updating: doc.agent_updating,
    updated_at: value.updatedAt.toISOString(),
    // Attribution can change without the version moving. Null for non-owner audiences.
    writer: value.writer,
    snapshot: changed ? {
      spec: await hydratePageLinks(doc.spec, context),
      summary: value.recent.at(-1)?.summary ?? "Page updated",
      at: value.updatedAt.toISOString(),
    } : null,
  });
}

export interface UserPatch { pinned?: boolean }

export async function updateOwnedUser(pageId: string, namespaceId: string, patch: UserPatch): Promise<HandlerResult> {
  const assembled = await assembleOwnedPage(pageId, namespaceId);
  if (!assembled.ok) return assembled.result;
  return updateUserFor(assembled.value, patch, () => assembleOwnedPage(pageId, namespaceId));
}

async function updateUserFor(
  value: AssembledPage,
  patch: UserPatch,
  reload: () => Promise<{ ok: true; value: AssembledPage } | { ok: false; result: HandlerResult }>,
): Promise<HandlerResult> {
  if (patch.pinned === undefined) {
    return fail(422, { error: "Send pinned.", code: "empty_patch", next: ["get_page"] });
  }
  // Pinning has no lifecycle lock or exposure record to race with.
  await getDb().insert(schema.pageUserState)
    .values({ pageId: value.pageId, pinned: patch.pinned })
    .onConflictDoUpdate({
      target: schema.pageUserState.pageId,
      set: { pinned: patch.pinned, updatedAt: new Date() },
    });
  const next = await reload();
  if (!next.ok) return next.result;
  return ok({ user: next.value.document.user });
}

/** The owner's tab title for one page; the session already proves the namespace. */
export async function ownedPageTitle(pageId: string, namespaceId: string): Promise<string | null> {
  if (!isUuid(pageId)) return null;
  const [row] = await getDb()
    .select({ title: schema.pages.title })
    .from(schema.pages)
    .where(and(eq(schema.pages.id, pageId), eq(schema.pages.namespaceId, namespaceId)));
  return row?.title ?? null;
}

/**
 * Title and freshness for a link preview, resolved by share key so a bare page id discloses
 * nothing.
 */
export async function ogPreview(key: string): Promise<{ ok: true; title: string; updatedAt: Date } | { ok: false; result: HandlerResult }> {
  if (!hasKeyPrefix(key, "page")) return { ok: false, result: NOT_FOUND };
  // Unfurls refetch often, so read only the title and date, never the spec.
  const [row] = await getDb()
    .select({
      title: schema.pages.title,
      updatedAt: schema.pages.updatedAt,
      readKeyHash: schema.pages.readKeyHash,
    })
    .from(schema.pages)
    .where(eq(schema.pages.readKeyHash, sha256Hex(key)));
  if (row === undefined || !verifyHash(key, row.readKeyHash)) return { ok: false, result: NOT_FOUND };
  return { ok: true, title: row.title, updatedAt: row.updatedAt };
}
