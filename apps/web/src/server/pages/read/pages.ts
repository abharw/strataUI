/**
 * The single page read model. Surfaces narrow this query and row type rather than redefine
 * them; `readPageList` and `readPageProbe` are the same join with fewer columns.
 */

import "server-only";

import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import type { StrataSpec } from "@/page-content/schema";
import { openKeyOrNull } from "@/server/credentials/keys/at-rest";
import { joinedWriter, type PageWriter } from "./provenance";

export type PageKind = (typeof schema.pages.$inferSelect)["kind"];
type ExposureActor = (typeof schema.pages.$inferSelect)["exposureActor"];

/** One page as every reader sees it: the row, its space, and the reader's own bit. */
export interface PageRecord {
  id: string;
  namespaceId: string;
  slug: string;
  title: string;
  kind: PageKind;
  version: number;
  registryVersion: number | null;
  /** The page's `pgk_` read key, opened from its sealed column; null if it will not open. */
  readKey: string | null;
  readKeyHash: string;
  document: StrataSpec;
  sourceEvent: unknown;
  lastSummary: string;
  /** The grant that wrote last; null once that grant is gone. */
  lastWriterGrantId: string | null;
  shared: boolean;
  sharedAt: Date | null;
  exposureActor: ExposureActor;
  exposureUpdatedAt: Date;
  updatingUntil: Date | null;
  lastViewedAt: Date | null;
  /** Whether the chrome shows this page's write trail. */
  liveSteps: boolean;
  createdAt: Date;
  updatedAt: Date;
  spaceId: string;
  spaceSlug: string;
  spaceName: string;
  spaceEmoji: string;
  pinned: boolean;
  /** What to call the person this Strata belongs to, when the agent said. */
  ownerName: string | null;
}

/** Columns a listing needs; the full read adds the two JSONB columns. */
const LIST_BASE = {
  id: schema.pages.id,
  namespaceId: schema.pages.namespaceId,
  slug: schema.pages.slug,
  title: schema.pages.title,
  kind: schema.pages.kind,
  version: schema.pages.version,
  registryVersion: schema.pages.registryVersion,
  sealedReadKey: schema.pages.sealedReadKey,
  readKeyHash: schema.pages.readKeyHash,
  lastSummary: schema.pages.lastSummary,
  lastWriterGrantId: schema.pages.lastWriterGrantId,
  shared: schema.pages.shared,
  sharedAt: schema.pages.sharedAt,
  exposureActor: schema.pages.exposureActor,
  exposureUpdatedAt: schema.pages.exposureUpdatedAt,
  updatingUntil: schema.pages.updatingUntil,
  lastViewedAt: schema.pages.lastViewedAt,
  liveSteps: schema.pages.liveSteps,
  createdAt: schema.pages.createdAt,
  updatedAt: schema.pages.updatedAt,
  spaceId: schema.spaces.id,
  spaceSlug: schema.spaces.slug,
  spaceName: schema.spaces.name,
  spaceEmoji: schema.spaces.emoji,
  pinned: schema.pageUserState.pinned,
  ownerName: schema.namespaces.displayName,
};

const COLUMNS = {
  ...LIST_BASE,
  document: schema.pages.document,
  sourceEvent: schema.pages.sourceEvent,
};

/**
 * The row minus the heavy JSONB columns, for listings. The few values a listing needs from
 * the document are read in SQL. Derived from `PageRecord` so the shapes cannot drift.
 */
export type PageListRecord = Omit<PageRecord, "document" | "sourceEvent"> & {
  /** `document.answer.verdict`, resolved in SQL. */
  answerVerdict: string | null;
  /** `document.sequence.position`, resolved in SQL, for ordering siblings. */
  sequencePosition: number | null;
};

const LIST_COLUMNS = {
  ...LIST_BASE,
  answerVerdict: sql<string | null>`${schema.pages.document} -> 'answer' ->> 'verdict'`,
  sequencePosition: sql<number | null>`(${schema.pages.document} -> 'sequence' ->> 'position')::int`,
};

/** Condition matching pages whose `sequence.up` names this page. */
export function sequenceChildrenOf(pageId: string): SQL {
  return sql`${schema.pages.document} -> 'sequence' -> 'up' ->> 'page' = ${pageId}`;
}

export type PageOrder = "recent" | "shared";

interface ReadOptions {
  /** Open each row's sealed read key. Pass false where the caller may not hold keys. */
  openKeys?: boolean;
}

function orderBy(order: PageOrder): SQL {
  return order === "shared" ? asc(schema.pages.sharedAt) : desc(schema.pages.updatedAt);
}

/** The full read. Callers pass conditions; nobody else joins these tables. */
async function readPages(conditions: SQL[], order: PageOrder = "recent"): Promise<PageRecord[]> {
  const rows = await getDb().select(COLUMNS)
    .from(schema.pages)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.pages.spaceId))
    .innerJoin(schema.namespaces, eq(schema.namespaces.id, schema.pages.namespaceId))
    .leftJoin(schema.pageUserState, eq(schema.pageUserState.pageId, schema.pages.id))
    .where(and(...conditions))
    .orderBy(orderBy(order));
  return rows.map(({ sealedReadKey, ...row }) => ({
    ...row,
    readKey: openKeyOrNull(sealedReadKey),
    pinned: row.pinned === true,
  }));
}

/** The same read for listings, without the document. */
export async function readPageList(
  conditions: SQL[],
  order: PageOrder = "recent",
  options: ReadOptions = {},
): Promise<PageListRecord[]> {
  const rows = await getDb().select(LIST_COLUMNS)
    .from(schema.pages)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.pages.spaceId))
    .innerJoin(schema.namespaces, eq(schema.namespaces.id, schema.pages.namespaceId))
    .leftJoin(schema.pageUserState, eq(schema.pageUserState.pageId, schema.pages.id))
    .where(and(...conditions))
    .orderBy(orderBy(order));
  return rows.map(({ sealedReadKey, ...row }) => ({
    ...row,
    readKey: options.openKeys === false ? null : openKeyOrNull(sealedReadKey),
    pinned: row.pinned === true,
  }));
}

export async function readPage(conditions: SQL[]): Promise<PageRecord | null> {
  const [row] = await readPages(conditions);
  return row ?? null;
}

/**
 * What a poll tick needs to answer "nothing changed" without reading the spec or decrypting
 * a key. The facts that decide whether a quiet answer is complete are resolved in SQL.
 */
export interface PageProbe {
  id: string;
  namespaceId: string;
  version: number;
  readKeyHash: string;
  updatedAt: Date;
  updatingUntil: Date | null;
  /** Title, pin and Space change without moving the version, so the probe carries them. */
  title: string;
  pinned: boolean;
  spaceId: string;
  spaceName: string;
  /** Approval answers must ride every tick. */
  hasApprovals: boolean;
  /** Serving URLs may need re-minting. */
  hasAttachments: boolean;
  /** Trail steps may carry files of their own. */
  liveSteps: boolean;
  writer: PageWriter | null;
}

function elementOfType(type: string): SQL<boolean> {
  return sql<boolean>`jsonb_path_exists(${schema.pages.document}, ${`$.elements.*.type ? (@ == "${type}")`}::jsonpath)`;
}

export async function readPageProbe(conditions: SQL[]): Promise<PageProbe | null> {
  const [row] = await getDb().select({
    id: schema.pages.id,
    namespaceId: schema.pages.namespaceId,
    version: schema.pages.version,
    readKeyHash: schema.pages.readKeyHash,
    updatedAt: schema.pages.updatedAt,
    updatingUntil: schema.pages.updatingUntil,
    title: schema.pages.title,
    pinned: schema.pageUserState.pinned,
    spaceId: schema.pages.spaceId,
    spaceName: schema.spaces.name,
    hasApprovals: elementOfType("approval"),
    hasAttachments: elementOfType("attachment-list"),
    liveSteps: schema.pages.liveSteps,
    grant: {
      id: schema.grants.id,
      label: schema.grants.label,
      driver: schema.grants.driver,
      createdAt: schema.grants.createdAt,
      lastUsedAt: schema.grants.lastUsedAt,
      revokedAt: schema.grants.revokedAt,
    },
  })
    .from(schema.pages)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.pages.spaceId))
    .leftJoin(schema.pageUserState, eq(schema.pageUserState.pageId, schema.pages.id))
    .leftJoin(schema.grants, eq(schema.grants.id, schema.pages.lastWriterGrantId))
    .where(and(...conditions))
    .limit(1);
  if (row === undefined) return null;
  const { grant, ...probe } = row;
  return { ...probe, pinned: probe.pinned === true, writer: joinedWriter(grant) };
}
