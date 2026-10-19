/**
 * Resolve `put_page`'s Space (an id, or an inline `{slug,name,emoji}` that creates it) into a
 * row or a refusal. Runs inside the page-create transaction.
 */
import { and, eq, sql } from "drizzle-orm";

import { schema } from "@/server/db";
import { MAX_SPACE_NAME_CHARS, MAX_SPACES_PER_NAMESPACE } from "@/page-content/document/limits";
import { fail, isUuid, type HandlerResult } from "@/shared/api/types";
import type { Tx } from "@/server/credentials/provision";
import { isSingleEmoji } from "./emoji";

import { quotaExceeded } from "@/server/api/quota";

export interface SpaceReference {
  slug: string;
  name: string;
  emoji: string;
}

function spaceNotFound(id: string): HandlerResult {
  return fail(404, {
    error: `No space ${id} in this namespace.`,
    code: "space_not_found",
    path: "/space_id",
    next: ["list_pages"],
  });
}

export async function resolveSpace(
  tx: Tx,
  namespaceId: string,
  request: { space_id?: string; space?: SpaceReference },
): Promise<{ id: string; slug: string; name: string; emoji: string } | HandlerResult> {
  if (request.space_id !== undefined && request.space !== undefined) {
    return fail(422, {
      error: "Choose space_id or space {slug,name,emoji}, not both.",
      code: "ambiguous_space",
      path: "/space",
      next: ["list_pages", "put_page"],
    });
  }
  if (request.space_id !== undefined) {
    if (!isUuid(request.space_id)) return spaceNotFound(request.space_id);
    const [space] = await tx
      .select({ id: schema.spaces.id, slug: schema.spaces.slug, name: schema.spaces.name, emoji: schema.spaces.emoji })
      .from(schema.spaces)
      .where(and(eq(schema.spaces.id, request.space_id), eq(schema.spaces.namespaceId, namespaceId)));
    if (space === undefined) return spaceNotFound(request.space_id);
    return { id: space.id, slug: space.slug, name: space.name, emoji: space.emoji };
  }
  if (request.space === undefined) {
    return fail(422, {
      error: "Creating a page needs space_id or space {slug,name,emoji}. Pages never fall into a generic default space.",
      code: "space_required",
      path: "/space",
      next: ["list_pages", "put_page"],
    });
  }
  const slug = request.space.slug.trim();
  const name = request.space.name.trim();
  const emoji = request.space.emoji;
  if (!isSingleEmoji(emoji)) {
    return fail(422, {
      error: "space.emoji must be exactly one complete Unicode emoji.",
      code: "invalid_space_emoji",
      path: "/space/emoji",
      next: ["put_page"],
    });
  }
  if (slug === "" || name === "") {
    return fail(422, {
      error: "space.slug and space.name must both be non-empty.",
      code: "invalid_space",
      path: "/space",
      next: ["put_page"],
    });
  }
  if (name.length > MAX_SPACE_NAME_CHARS) {
    return fail(422, {
      error: `A Space name holds at most ${MAX_SPACE_NAME_CHARS} characters. Use a 2-4 word navigation label and put the detail on the Page.`,
      code: "space_name_too_long",
      path: "/space/name",
      next: ["get_guide", "put_page"],
    });
  }
  const [existing] = await tx
    .select({ id: schema.spaces.id, slug: schema.spaces.slug, name: schema.spaces.name, emoji: schema.spaces.emoji })
    .from(schema.spaces)
    .where(and(eq(schema.spaces.namespaceId, namespaceId), eq(schema.spaces.slug, slug)));
  if (existing !== undefined) {
    return { id: existing.id, slug: existing.slug, name: existing.name, emoji: existing.emoji };
  }
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.spaces)
    .where(eq(schema.spaces.namespaceId, namespaceId));
  if (count >= MAX_SPACES_PER_NAMESPACE) {
    return quotaExceeded("spaces", MAX_SPACES_PER_NAMESPACE);
  }
  const [created] = await tx
    .insert(schema.spaces)
    .values({ namespaceId, slug, name, emoji })
    .returning({ id: schema.spaces.id, slug: schema.spaces.slug, name: schema.spaces.name, emoji: schema.spaces.emoji });
  return created;
}
