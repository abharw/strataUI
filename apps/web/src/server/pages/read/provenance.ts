/**
 * Writer labels for pages, from the grant behind the last write. Batched into one query per
 * listing; a deleted grant resolves to null (the column is `set null` on delete).
 */

import "server-only";

import { inArray } from "drizzle-orm";

import { getDb, schema } from "@/server/db";

/** The provenance key a written row carries. */
export interface WriterRef {
  lastWriterGrantId?: string | null;
}

/**
 * One writer as a surface draws it. Instants are ISO strings for RSC and JSON payloads.
 * `grantId` keys the avatar tint, since labels are not unique or stable.
 */
export interface PageWriter {
  grantId: string;
  label: string;
  driver: string;
  /** When the agent was connected ("Writer since"). */
  connectedAt: string;
  lastUsedAt: string | null;
  /** Non-null once revoked; the mark dims rather than disappears. */
  revokedAt: string | null;
}

export interface WriterLabels {
  /** The display name for one row's grant, or null when there is none. */
  label(ref: WriterRef): string | null;
  /** The whole writer for one row's grant, or null when there is none. */
  writer(ref: WriterRef): PageWriter | null;
}

const EMPTY: WriterLabels = { label: () => null, writer: () => null };

/** A grant row as a `PageWriter`, or null. Accepts nullable columns from a left join. */
export function joinedWriter(row: {
  id: string | null;
  label: string | null;
  driver: string | null;
  createdAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
} | null): PageWriter | null {
  if (row === null) return null;
  if (row.id === null || row.label === null || row.driver === null || row.createdAt === null) return null;
  return {
    grantId: row.id,
    label: row.label,
    driver: row.driver,
    connectedAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

/** Resolve every grant named by `refs` in one query; look up by row afterwards. */
export async function writerLabels(refs: readonly WriterRef[]): Promise<WriterLabels> {
  const grantIds = unique(refs.map((ref) => ref.lastWriterGrantId));
  if (grantIds.length === 0) return EMPTY;

  const grants = await getDb()
    .select({
      id: schema.grants.id,
      label: schema.grants.label,
      driver: schema.grants.driver,
      createdAt: schema.grants.createdAt,
      lastUsedAt: schema.grants.lastUsedAt,
      revokedAt: schema.grants.revokedAt,
    })
    .from(schema.grants)
    .where(inArray(schema.grants.id, grantIds));

  const byGrant = new Map<string, PageWriter>(grants.flatMap((row) => {
    const writer = joinedWriter(row);
    return writer === null ? [] : [[row.id, writer] as const];
  }));

  function writer(ref: WriterRef): PageWriter | null {
    if (ref.lastWriterGrantId == null) return null;
    return byGrant.get(ref.lastWriterGrantId) ?? null;
  }

  return { writer, label: (ref) => writer(ref)?.label ?? null };
}

function unique(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string"))];
}
