/** Space row writes; the handlers decide what a request may do. */
import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { schema } from "@/server/db";
import { markPagesDeleted } from "@/server/pages/decisions";
import { lockNamespaceForLifecycle } from "@/server/credentials/provision";
import type { Tx } from "@/server/credentials/provision";

/** The Space columns a lifecycle decision needs, locked `for update`. */
export interface LockedSpace {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  shareKeyHash: string | null;
  sealedShareKey: string | null;
}

/** A locked Page whose Space-bundle exposure may be changed. */
export interface ActiveSpacePageExposure {
  id: string;
  shared: boolean;
}

/**
 * Lock the namespace, then the Space: the same prefix `lockPageLifecycle` uses, so Space and
 * Page verbs queue instead of deadlocking. Null when the Space is not in this namespace.
 */
export async function lockSpaceForLifecycle(
  tx: Tx,
  namespaceId: string,
  spaceId: string,
): Promise<LockedSpace | null> {
  if (!await lockNamespaceForLifecycle(tx, namespaceId)) return null;
  const [space] = await tx.select({
    id: schema.spaces.id,
    slug: schema.spaces.slug,
    name: schema.spaces.name,
    emoji: schema.spaces.emoji,
    shareKeyHash: schema.spaces.shareKeyHash,
    sealedShareKey: schema.spaces.sealedShareKey,
  })
    .from(schema.spaces)
    .where(and(eq(schema.spaces.id, spaceId), eq(schema.spaces.namespaceId, namespaceId)))
    .for("update");
  return space ?? null;
}

/** Update Space fields and stamp `updated_at`. */
export async function setSpaceFields(
  tx: Tx,
  spaceId: string,
  fields: { name?: string; emoji?: string },
): Promise<void> {
  await tx.update(schema.spaces)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(schema.spaces.id, spaceId));
}

/**
 * First share snapshots membership: every private page joins the bundle and each join is
 * logged. Later pages stay private, so re-sharing never widens the bundle. An agent's share
 * skips pages the owner unshared; only the owner can share those again.
 */
export async function shareSpacePages(
  tx: Tx,
  input: { spaceId: string; actor: "agent" | "user"; grantId?: string | null; at: Date },
): Promise<number> {
  const exposed = await tx.update(schema.pages).set({
    shared: true,
    exposureActor: input.actor,
    exposureUpdatedAt: input.at,
    sharedAt: input.at,
  }).where(and(
    eq(schema.pages.spaceId, input.spaceId),
    eq(schema.pages.shared, false),
    input.actor === "agent" ? ne(schema.pages.exposureActor, "user") : undefined,
  )).returning({ id: schema.pages.id });

  if (exposed.length > 0) {
    await tx.insert(schema.exposureLog).values(exposed.map((page) => ({
      pageId: page.id,
      spaceId: input.spaceId,
      shared: true,
      actor: input.actor,
      grantId: input.grantId,
      onBehalfOfUser: input.actor === "user",
      at: input.at,
    })));
  }
  return exposed.length;
}

/**
 * Lock the Space's Pages so the membership check and the exposure update are one decision; a
 * concurrent move waits.
 */
export async function readActiveSpacePageExposure(
  tx: Tx,
  spaceId: string,
): Promise<ActiveSpacePageExposure[]> {
  return tx.select({ id: schema.pages.id, shared: schema.pages.shared })
    .from(schema.pages)
    .where(eq(schema.pages.spaceId, spaceId))
    .for("update");
}

/**
 * Apply a validated bundle selection. `activePages` must be the rows locked by
 * `readActiveSpacePageExposure`. Direct `pgk_` keys are separate and not touched.
 */
export async function applySpacePageSelection(
  tx: Tx,
  input: {
    spaceId: string;
    activePages: readonly ActiveSpacePageExposure[];
    selectedPageIds: ReadonlySet<string>;
    actor: "agent" | "user";
    grantId?: string | null;
    at: Date;
  },
): Promise<{ added: number; removed: number }> {
  const addedIds = input.activePages
    .filter((page) => input.selectedPageIds.has(page.id) && !page.shared)
    .map((page) => page.id);
  const removedIds = input.activePages
    .filter((page) => !input.selectedPageIds.has(page.id) && page.shared)
    .map((page) => page.id);

  if (addedIds.length > 0) {
    await tx.update(schema.pages).set({
      shared: true,
      exposureActor: input.actor,
      exposureUpdatedAt: input.at,
      sharedAt: input.at,
    }).where(and(
      eq(schema.pages.spaceId, input.spaceId),
      inArray(schema.pages.id, addedIds),
    ));
  }

  if (removedIds.length > 0) {
    await tx.update(schema.pages).set({
      shared: false,
      exposureActor: input.actor,
      exposureUpdatedAt: input.at,
      sharedAt: null,
    }).where(and(
      eq(schema.pages.spaceId, input.spaceId),
      inArray(schema.pages.id, removedIds),
    ));
  }

  if (addedIds.length + removedIds.length > 0) {
    await tx.insert(schema.exposureLog).values([
      ...addedIds.map((pageId) => ({
        pageId,
        spaceId: input.spaceId,
        shared: true,
        actor: input.actor,
        grantId: input.grantId,
        onBehalfOfUser: input.actor === "user",
        at: input.at,
      })),
      ...removedIds.map((pageId) => ({
        pageId,
        spaceId: input.spaceId,
        shared: false,
        actor: input.actor,
        grantId: input.grantId,
        onBehalfOfUser: input.actor === "user",
        at: input.at,
      })),
    ]);
  }

  return { added: addedIds.length, removed: removedIds.length };
}

export async function countSpacePages(tx: Tx, spaceId: string): Promise<number> {
  const [row] = await tx.select({ count: sql<number>`count(*)::int` })
    .from(schema.pages)
    .where(eq(schema.pages.spaceId, spaceId));
  return row?.count ?? 0;
}

/** Erase a Space and its pages; decision log rows stay and are stamped deleted. */
export async function eraseSpace(tx: Tx, spaceId: string): Promise<void> {
  const doomed = await tx.select({ id: schema.pages.id })
    .from(schema.pages)
    .where(eq(schema.pages.spaceId, spaceId));
  await markPagesDeleted(tx, doomed.map((page) => page.id));
  await tx.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));
}
