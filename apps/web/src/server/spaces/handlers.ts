/** Space create, update, share-selection, delete and list handlers. */
import * as z from "zod";

import { getDb, isUniqueViolation } from "@/server/db";
import {
  createSpaceIn,
  ProvisionError,
  shareSpaceIn,
  type Tx,
} from "@/server/credentials/provision";
import { readSpaceRows } from "@/server/spaces/read/lists";
import { SlugSchema } from "@/page-content/document/types";
import { MAX_PAGES_PER_NAMESPACE, MAX_SPACE_NAME_CHARS } from "@/page-content/document/limits";
import { fail, isUuid, namespaceGone, ok, type HandlerResult } from "@/shared/api/types";
import { spaceUrl } from "@/server/credentials/keys";
import { openKey } from "@/server/credentials/keys/at-rest";
import { hasLiteralMarkup } from "@/page-content/authoring/guidance";
import {
  applySpacePageSelection,
  countSpacePages,
  eraseSpace,
  lockSpaceForLifecycle,
  readActiveSpacePageExposure,
  setSpaceFields,
  shareSpacePages,
  type LockedSpace,
} from "./write";
import { SpaceEmojiSchema } from "./emoji";

const NEXT_LIST = ["list_spaces", "list_pages"] as const;

/** Trim before `min(1)` so a blank name gets the same refusal as an empty one. */
const SpaceNameSchema = z
  .string()
  .trim()
  .min(1, "A Space needs a name: 2-4 words that work as a navigation label.")
  .max(MAX_SPACE_NAME_CHARS, `A space name holds at most ${MAX_SPACE_NAME_CHARS} characters - name the collection, save the detail for a page.`);

export const CreateSpaceBodySchema = z.strictObject({
  slug: SlugSchema,
  name: SpaceNameSchema,
  emoji: SpaceEmojiSchema,
  shared: z.boolean().optional(),
});

export const UpdateSpaceBodySchema = z.strictObject({
  name: SpaceNameSchema.optional(),
  emoji: SpaceEmojiSchema.optional(),
  shared: z.literal(true).optional(),
});

export interface CreateSpaceInput {
  namespace_id: string;
  slug: string;
  name: string;
  emoji: string;
  shared?: boolean;
  baseUrl: string;
}

/** The body schema covers slug, name and emoji; this adds the literal-markup check. */
export async function create(input: CreateSpaceInput): Promise<HandlerResult> {
  const slug = input.slug.trim();
  const name = input.name.trim();
  if (hasLiteralMarkup(name)) return fail(422, {
    error: "A Space name is plain text, so Markdown or HTML markers render literally. Remove the markers and retry the create.",
    code: "literal_markup",
    path: "/name",
    next: ["create_space"],
  });
  try {
    return await getDb().transaction(async (tx) => {
      const space = await createSpaceIn(tx, input.namespace_id, { slug, name, emoji: input.emoji });
      if (input.shared !== true) return ok({
        space_id: space.space_id,
        slug: space.slug,
        name: space.name,
        emoji: space.emoji,
        space_url: null,
      }, 201);
      // Create and first share commit together, so a failure cannot leave half of {shared:true}.
      const shared = await shareSpaceIn(tx, space.space_id, { baseUrl: input.baseUrl });
      return ok({ space_id: space.space_id, slug: space.slug, name: space.name, emoji: space.emoji, space_url: shared.space_url }, 201);
    });
  } catch (error) {
    if (error instanceof ProvisionError && error.code === "not_found") return namespaceGone();
    if (error instanceof ProvisionError && error.code === "quota_exceeded") {
      return {
        status: 429,
        body: {
          error: error.message,
          code: error.code,
          resource: error.detail?.resource,
          limit: error.detail?.limit,
          next: ["list_spaces", "delete_space"],
        },
      };
    }
    if (!isUniqueViolation(error)) throw error;
    return fail(409, { error: `A space with slug "${slug}" already exists.`, code: "slug_taken", path: "/slug", next: [...NEXT_LIST] });
  }
}

export interface UpdateSpaceInput {
  namespace_id: string;
  space_id: string;
  name?: string;
  emoji?: string;
  shared?: boolean;
  actor: "agent" | "user";
  /** The grant behind an agent write; null for a user action. */
  grant_id?: string | null;
  baseUrl: string;
}

/**
 * Owner-only share-drawer operation, kept out of the public `set_space` contract where
 * `shared:true` is a one-time snapshot.
 */
export interface ShareSpaceSelectionInput {
  namespace_id: string;
  space_id: string;
  page_ids: readonly string[];
  /** The included set when editing began; guards against lost updates. */
  expected_page_ids: readonly string[];
  /** Owner-only: an agent shares a Space with `update`, which respects owner unshares. */
  actor: "user";
  grant_id?: string | null;
  baseUrl: string;
}

/**
 * Mint or recover the Space link and set its membership atomically. Malformed or stale
 * submissions are refused before any write.
 */
export async function shareSelection(input: ShareSpaceSelectionInput): Promise<HandlerResult> {
  if (
    !Array.isArray(input.page_ids)
    || !Array.isArray(input.expected_page_ids)
    || input.page_ids.some((id) => !isUuid(id))
    || input.expected_page_ids.some((id) => !isUuid(id))
  ) {
    return fail(422, {
      error: "page_ids and expected_page_ids must be arrays of Page UUIDs.",
      code: "invalid_page_ids",
      path: "/page_ids",
      next: ["list_pages"],
    });
  }
  if (
    input.page_ids.length > MAX_PAGES_PER_NAMESPACE
    || input.expected_page_ids.length > MAX_PAGES_PER_NAMESPACE
  ) {
    return fail(422, {
      error: `A Space can include at most ${MAX_PAGES_PER_NAMESPACE} Pages in one selection.`,
      code: "too_many_page_ids",
      path: "/page_ids",
      next: ["list_pages"],
    });
  }
  const selectedPageIds = new Set(input.page_ids);
  const expectedPageIds = new Set(input.expected_page_ids);
  if (
    selectedPageIds.size !== input.page_ids.length
    || expectedPageIds.size !== input.expected_page_ids.length
  ) {
    return fail(422, {
      error: "page_ids must not include the same Page more than once.",
      code: "duplicate_page_ids",
      path: "/page_ids",
      next: ["list_pages"],
    });
  }

  return getDb().transaction(async (tx) => {
    const space = await lockSpace(tx, input.namespace_id, input.space_id);
    if ("status" in space) return space;

    const activePages = await readActiveSpacePageExposure(tx, space.id);
    const activePageIds = new Set(activePages.map((page) => page.id));
    const currentPageIds = new Set(
      activePages.filter((page) => page.shared).map((page) => page.id),
    );
    if (
      currentPageIds.size !== expectedPageIds.size
      || [...currentPageIds].some((pageId) => !expectedPageIds.has(pageId))
    ) {
      return fail(409, {
        error: "The Pages included in this Space changed. Refresh the Space before saving your selection.",
        code: "stale_space_page_selection",
        path: "/expected_page_ids",
        next: ["list_pages"],
      });
    }
    const missing = input.page_ids.filter((pageId) => !activePageIds.has(pageId));
    if (missing.length > 0) {
      return fail(409, {
        error: "The selected Pages are no longer active members of this Space. Refresh the Space and choose its current Pages.",
        code: "stale_space_page_selection",
        path: "/page_ids",
        next: ["list_pages"],
      });
    }

    // Check recoverability before any write or key mint, so a bad key cannot half-apply.
    if (space.shareKeyHash !== null && space.sealedShareKey === null) {
      return fail(409, {
        error: "This Space has a shared link Strata can no longer recover. Create a new Space and move the Pages you meant to share into it.",
        code: "space_link_not_recoverable",
        path: "/page_ids",
        next: ["list_spaces", "create_space"],
      });
    }

    const shared = await shareSpaceIn(tx, space.id, { baseUrl: input.baseUrl });
    const changed = await applySpacePageSelection(tx, {
      spaceId: space.id,
      activePages,
      selectedPageIds,
      actor: input.actor,
      grantId: input.grant_id,
      at: new Date(),
    });
    return ok({
      space_id: space.id,
      space_url: shared.space_url,
      included_page_count: selectedPageIds.size,
      shared_pages_added: changed.added,
      shared_pages_removed: changed.removed,
    });
  });
}

export async function update(input: UpdateSpaceInput): Promise<HandlerResult> {
  if (input.name === undefined && input.emoji === undefined && input.shared !== true) {
    return fail(422, {
      error: "Send name, emoji, or shared:true.",
      code: "empty_patch",
      next: ["list_spaces", "set_space"],
    });
  }
  if (input.name !== undefined && hasLiteralMarkup(input.name)) {
    return fail(422, {
      error: "A Space name is plain text, so Markdown or HTML markers render literally. Remove the markers and retry the rename.",
      code: "literal_markup",
      path: "/name",
      next: ["set_space"],
    });
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    const space = await lockSpace(tx, input.namespace_id, input.space_id);
    if ("status" in space) return space;
    const name = input.name === undefined ? space.name : input.name.trim();
    const emoji = input.emoji ?? space.emoji;

    // Check before any write: returning a HandlerResult commits, so a late refusal would
    // leave a partial success.
    let existingSpaceUrl: string | null = null;
    if (input.shared === true && space.shareKeyHash !== null) {
      if (space.sealedShareKey === null) {
        return fail(409, {
          error: "This Space has a shared link Strata can no longer recover. Create a new Space and move the pages you meant to share into it.",
          code: "space_link_not_recoverable",
          path: "/shared",
          next: ["list_spaces", "create_space"],
        });
      }
      existingSpaceUrl = spaceUrl(input.baseUrl, openKey(space.sealedShareKey));
    }

    if (input.name !== undefined || input.emoji !== undefined) {
      await setSpaceFields(tx, space.id, { name, emoji });
    }
    // First share snapshots membership; repeating it returns the same URL without adding pages.
    let sharedSpaceUrl: string | null = null;
    let alreadyShared = false;
    let sharedPagesAdded = 0;
    if (input.shared === true) {
      if (space.shareKeyHash === null) {
        sharedSpaceUrl = (await shareSpaceIn(tx, space.id, { baseUrl: input.baseUrl })).space_url;
        sharedPagesAdded = await shareSpacePages(tx, {
          spaceId: space.id,
          actor: input.actor,
          grantId: input.grant_id,
          at: new Date(),
        });
      } else {
        alreadyShared = true;
        sharedSpaceUrl = existingSpaceUrl;
      }
    }
    return ok({
      space_id: space.id,
      slug: space.slug,
      name,
      emoji,
      space_url: sharedSpaceUrl,
      shared_pages_added: sharedPagesAdded,
      ...(alreadyShared ? {
        already_shared: true,
        note: "This Space is already shared. The same stable link is returned; pages created after the first share stay private until explicitly added.",
      } : {}),
    });
  });
}

export interface SpaceRefInput { namespace_id: string; space_id: string }

export async function remove(input: SpaceRefInput & { with_pages?: boolean }): Promise<HandlerResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const space = await lockSpace(tx, input.namespace_id, input.space_id);
    if ("status" in space) return space;
    const count = await countSpacePages(tx, space.id);
    if (count > 0 && input.with_pages !== true) return fail(409, {
      error: `This Space has ${count} page${count === 1 ? "" : "s"}. Move them first, or send with_pages=true for permanent erasure.`,
      code: "space_not_empty",
      path: "/with_pages",
      // Moving a page is set_page with a new space; there is no move_page.
      next: ["list_pages", "set_page", "delete_space"],
    });
    await eraseSpace(tx, space.id);
    return ok({ space_id: space.id, deleted: true, pages: count });
  });
}

export async function list(input: { namespace_id: string }): Promise<HandlerResult> {
  return ok({ spaces: await readSpaceRows(input.namespace_id) });
}

async function lockSpace(tx: Tx, namespaceId: string, spaceId: string): Promise<LockedSpace | HandlerResult> {
  if (!isUuid(spaceId)) return spaceNotFound(spaceId);
  return await lockSpaceForLifecycle(tx, namespaceId, spaceId) ?? spaceNotFound(spaceId);
}

function spaceNotFound(id: string): HandlerResult {
  return fail(404, { error: `No space ${id} in this namespace.`, code: "space_not_found", path: "/space_id", next: [...NEXT_LIST] });
}
