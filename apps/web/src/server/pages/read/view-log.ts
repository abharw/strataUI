/** Retention sweep for `view_log`. Readers only look at recent days, so old rows are dead weight. */

import "server-only";

import { sql } from "drizzle-orm";

import { getDb, schema } from "@/server/db";

/** Views older than this are deleted. */
export const VIEW_LOG_RETENTION_MS = 90 * 24 * 60 * 60_000;

/**
 * Rows per delete statement. Bounded batches avoid one long lock and WAL burst on a large
 * backlog, and leave progress behind if the function times out.
 */
const BATCH = 10_000;

/** Delete views older than the retention window. Housekeeping, not enforcement. */
export async function sweepViewLog(
  { now = new Date(), retentionMs = VIEW_LOG_RETENTION_MS }: {
    now?: Date;
    retentionMs?: number;
  } = {},
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionMs);
  let removed = 0;
  for (;;) {
    // `rowCount` rather than `returning`, so deleted ids are not streamed back into memory.
    const result = await getDb().execute(sql`
      delete from ${schema.viewLog}
      where ctid in (
        select ctid from ${schema.viewLog}
        where ${schema.viewLog.at} < ${cutoff}
        limit ${BATCH}
      )
    `);
    const deleted = result.rowCount ?? 0;
    removed += deleted;
    if (deleted < BATCH) return removed;
  }
}
