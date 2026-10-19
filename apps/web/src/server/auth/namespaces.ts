/**
 * Permanently erase a Strata (account deletion, not deactivation). Every namespace-owned table
 * cascades from the namespace row, including credentials, sessions and asset bytes, so one delete
 * erases everything and share keys stop resolving on commit.
 */
import { and, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { lockNamespaceForLifecycle } from "@/server/credentials/provision";
import { BUCKETS } from "@/server/credentials/provision/rate-limit";
import type { Tx } from "@/server/credentials/provision";

/** Counts taken before the erase; the log line is the only trace left. */
export interface ErasedNamespace {
  spaces: number;
  pages: number;
  assets: number;
  /** Grants, revoked ones included: every agent this Strata ever connected. */
  agents: number;
}

async function countOwned(tx: Tx, namespaceId: string): Promise<ErasedNamespace> {
  const rows = sql<number>`count(*)::int`;
  const [spaces] = await tx.select({ count: rows })
    .from(schema.spaces).where(eq(schema.spaces.namespaceId, namespaceId));
  const [pages] = await tx.select({ count: rows })
    .from(schema.pages).where(eq(schema.pages.namespaceId, namespaceId));
  const [assets] = await tx.select({ count: rows })
    .from(schema.assets).where(eq(schema.assets.namespaceId, namespaceId));
  const [agents] = await tx.select({ count: rows })
    .from(schema.grants).where(eq(schema.grants.namespaceId, namespaceId));
  return {
    spaces: spaces?.count ?? 0,
    pages: pages?.count ?? 0,
    assets: assets?.count ?? 0,
    agents: agents?.count ?? 0,
  };
}

/**
 * Erase one Strata and everything it owns in its own transaction. `null` when there is no such
 * namespace. Takes the namespace lifecycle lock first, so it queues behind in-flight writes.
 */
export async function eraseNamespace(namespaceId: string): Promise<ErasedNamespace | null> {
  return getDb().transaction(async (tx) => {
    if (!await lockNamespaceForLifecycle(tx, namespaceId)) return null;
    const erased = await countOwned(tx, namespaceId);

    // `rate_limit_events` has no foreign keys, so namespace-keyed `static-mint` rows are deleted
    // here. Auth buckets are keyed by address or source and stay, or erasing would reset them.
    // Naming the bucket uses the (bucket, key, created_at) index.
    await tx.delete(schema.rateLimitEvents).where(and(
      eq(schema.rateLimitEvents.bucket, BUCKETS.staticMint),
      eq(schema.rateLimitEvents.key, namespaceId),
    ));

    // Everything else cascades from this row.
    await tx.delete(schema.namespaces).where(eq(schema.namespaces.id, namespaceId));
    return erased;
  });
}
