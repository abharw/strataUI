/**
 * Page lifecycle writes: rename, move, share, delete. `updatePage` is the whole `set_page`
 * transaction; row-free validation stays in the handler.
 */
import { and, eq, inArray } from "drizzle-orm";

import { getDb, isUniqueViolation, schema } from "@/server/db";
import { markPagesDeleted } from "@/server/pages/decisions";
import { exposureUpdate, reshareNeedsUser } from "@/server/pages/consent";
import { fail, ok, type HandlerResult } from "@/shared/api/types";
import { pageUrl, spaceUrl } from "@/server/credentials/keys";
import { openKey } from "@/server/credentials/keys/at-rest";
import { lockNamespaceForLifecycle, shareSpaceIn } from "@/server/credentials/provision";
import type { Tx } from "@/server/credentials/provision";
import { ownerPageUrl } from "@/shared/navigation/owner-routes";

type PageRow = typeof schema.pages.$inferSelect;

/** The Space columns a page lifecycle decision needs, locked `for update`. */
interface LockedPageSpace {
  id: string;
  slug: string;
  shareKeyHash: string | null;
  sealedShareKey: string | null;
}

export interface PageLifecycleLocks {
  readonly page: PageRow;
  /** The Space the Page was in when the walk began, and any move destination. */
  readonly spaces: ReadonlyMap<string, LockedPageSpace>;
  /** The Page's Space on entry, read before the Space locks. */
  readonly sourceSpaceId: string;
}

/**
 * Take every lock a rename, move, share or delete needs, in one order: namespace, Spaces
 * (sorted by id), Page. Space sharing uses the same prefix, which prevents deadlocks.
 * Returns null when the Page is not in this namespace.
 */
export async function lockPageLifecycle(
  tx: Tx,
  input: { namespaceId: string; pageId: string; destinationSpaceId?: string },
): Promise<PageLifecycleLocks | null> {
  if (!await lockNamespaceForLifecycle(tx, input.namespaceId)) return null;

  const [reference] = await tx.select({ spaceId: schema.pages.spaceId })
    .from(schema.pages)
    .where(and(
      eq(schema.pages.id, input.pageId),
      eq(schema.pages.namespaceId, input.namespaceId),
    ));
  if (reference === undefined) return null;

  const spaceIds = [...new Set([
    reference.spaceId,
    ...(input.destinationSpaceId === undefined ? [] : [input.destinationSpaceId]),
  ])].sort();
  const locked = await tx.select({
    id: schema.spaces.id,
    slug: schema.spaces.slug,
    shareKeyHash: schema.spaces.shareKeyHash,
    sealedShareKey: schema.spaces.sealedShareKey,
  }).from(schema.spaces).where(and(
    eq(schema.spaces.namespaceId, input.namespaceId),
    inArray(schema.spaces.id, spaceIds),
  )).orderBy(schema.spaces.id).for("update");
  const spaces = new Map(locked.map((space) => [space.id, space]));
  if (!spaces.has(reference.spaceId)) return null;

  const [page] = await tx.select().from(schema.pages).where(and(
    eq(schema.pages.id, input.pageId),
    eq(schema.pages.namespaceId, input.namespaceId),
  )).for("update");
  if (page === undefined) return null;

  return { page, spaces, sourceSpaceId: reference.spaceId };
}

/** What an exposure change records about itself, on the row and in the log. */
export interface ExposureEntry {
  readonly spaceId: string;
  readonly shared: boolean;
  readonly actor: "agent" | "user";
  readonly grantId?: string | null;
  /** The person's own action, or an agent write carrying their request. Logged, not a gate. */
  readonly onBehalfOfUser: boolean;
}

/**
 * Update a Page row and, when its exposure changed, log it in the same transaction so every
 * exposure change can be shown to the person.
 */
async function applyPageChange(
  tx: Tx,
  pageId: string,
  fields: Partial<PageRow>,
  exposure: ExposureEntry | null,
): Promise<PageRow> {
  const [updated] = await tx.update(schema.pages)
    .set(fields)
    .where(eq(schema.pages.id, pageId))
    .returning();
  if (exposure !== null) {
    await tx.insert(schema.exposureLog).values({
      pageId,
      spaceId: exposure.spaceId,
      shared: exposure.shared,
      actor: exposure.actor,
      grantId: exposure.grantId,
      onBehalfOfUser: exposure.onBehalfOfUser,
    });
  }
  return updated;
}

/** Erase a Page. Decision log rows stay and are stamped as deleted in the same call. */
export async function erasePage(tx: Tx, pageId: string): Promise<void> {
  await markPagesDeleted(tx, [pageId]);
  await tx.delete(schema.pages).where(eq(schema.pages.id, pageId));
}

export interface UpdatePageInput {
  namespace_id: string;
  page_id: string;
  shared?: boolean;
  space_id?: string;
  title?: string;
  /** Turn the chrome's "View steps" trail on or off without a content write. */
  live_steps?: boolean;
  actor: "agent" | "user";
  on_behalf_of_user?: boolean;
  /** The grant behind an agent write; null for a user action. */
  grant_id?: string | null;
  baseUrl: string;
}

/**
 * Rename, move, share and live-steps toggle. Input is pre-validated (`space_id` is well-formed).
 * Returns null when the Page is not in this namespace.
 */
export async function updatePage(input: UpdatePageInput): Promise<HandlerResult | null> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const locks = await lockPageLifecycle(tx, {
        namespaceId: input.namespace_id,
        pageId: input.page_id,
        destinationSpaceId: input.space_id,
      });
      if (locks === null) return null;
      const { page, spaces: spacesById, sourceSpaceId } = locks;
      const ownSpace = spacesById.get(sourceSpaceId)!;

      let destination = ownSpace.id;
      if (input.space_id !== undefined) {
        const space = spacesById.get(input.space_id);
        if (space === undefined) return fail(404, {
          error: `No space ${input.space_id} in this namespace.`,
          code: "space_not_found",
          path: "/space_id",
          next: ["list_pages"],
        });
        destination = space.id;
      }

      // The namespace lock already prevents an in-app move here; this guards direct SQL writers.
      if (page.spaceId !== sourceSpaceId) {
        return fail(409, {
          error: "This Page moved while the request was acquiring its lifecycle locks. Read it and retry against its current Space.",
          code: "page_moved",
          path: "/space_id",
          next: ["get_page", "set_page"],
        });
      }

      // Re-share after an owner unshare needs the owner. `on_behalf_of_user` is self-reported by
      // the caller, so it is not consulted.
      if (reshareNeedsUser(page, { shared: input.shared, actor: input.actor })) {
        const when = page.exposureUpdatedAt?.toISOString().slice(0, 10);
        return fail(409, {
          error: `This page was unshared by its owner${when === undefined ? "" : ` on ${when}`}, and only they can share it again. `
            + "Ask them to open it in their Strata home and turn sharing back on; no field on this write re-shares it. "
            + "Send shared:false, or leave shared out and write the page's content instead.",
          code: "unshared_by_user",
          path: "/shared",
          next: ["get_page"],
        });
      }

      const moved = destination !== page.spaceId;
      const nextShared = moved ? false : (input.shared ?? page.shared);
      const now = new Date();
      const exposure = exposureUpdate({ moved, requestedShared: input.shared, page, actor: input.actor, now });
      const exposureChanged = moved || exposure !== null;

      // Moving into a shared Space returns its stable URL: minted by the first caller, opened
      // (not re-minted) by later ones.
      let sharedSpaceUrl: string | null = null;
      if (nextShared && !page.shared) {
        const destinationSpace = spacesById.get(destination);
        if (destinationSpace === undefined) {
          return fail(404, {
            error: `No space ${destination} in this namespace.`,
            code: "space_not_found",
            path: "/space_id",
            next: ["list_pages"],
          });
        }
        if (destinationSpace.shareKeyHash === null) {
          sharedSpaceUrl = (await shareSpaceIn(tx, destination, { baseUrl: input.baseUrl })).space_url;
        } else if (destinationSpace.sealedShareKey === null) {
          return fail(409, {
            error: "This Space has a shared link Strata can no longer recover. Move this page into a Space whose shared link is intact.",
            code: "space_link_not_recoverable",
            path: "/shared",
            next: ["list_spaces", "create_space"],
          });
        } else {
          sharedSpaceUrl = spaceUrl(input.baseUrl, openKey(destinationSpace.sealedShareKey));
        }
      }

      const updated = await applyPageChange(tx, page.id, {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.live_steps !== undefined ? { liveSteps: input.live_steps } : {}),
        ...(moved ? { spaceId: destination } : {}),
        ...(exposure ?? {}),
        updatedAt: now,
      }, exposureChanged ? {
        spaceId: destination,
        shared: nextShared,
        actor: input.actor,
        grantId: input.grant_id,
        onBehalfOfUser: input.actor === "user" || input.on_behalf_of_user === true,
      } : null);

      return ok({
        page_id: updated.id,
        space_id: updated.spaceId,
        moved,
        shared: updated.shared,
        exposure_actor: updated.exposureActor,
        live_steps: updated.liveSteps,
        owner_url: ownerPageUrl(input.baseUrl, updated.id),
        url: pageUrl(input.baseUrl, openKey(updated.sealedReadKey)),
        space_url: sharedSpaceUrl,
      });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return fail(409, {
      error: "The destination already has a page with this slug. Rename one page before moving it.",
      code: "slug_collision",
      path: "/space_id",
      next: ["list_pages", "put_page"],
    });
  }
}
