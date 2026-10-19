/**
 * Page API handlers: parse the body, then delegate to the write, lifecycle and read modules.
 * Request schemas live in `./schemas`; the outline walk for `summary` and `find` in `./outline`.
 */
import { eq } from "drizzle-orm";

import { REGISTRY_VERSION } from "@/page-content/catalog-versions";
import { getDb, schema } from "@/server/db";
import { askCountsFor, asksFor } from "@/server/pages/decisions";
import type { StrataSpec } from "@/page-content/schema";
import { labelOf } from "@/page-content/document/labels";
import { pageUrl } from "@/server/credentials/keys";
import type { PageKind, SourceEvent } from "@/page-content/document/types";
import { patchSpec as writeSpecPatch, rewriteSpec as writeSpecRewrite, writePage, type WriteContext } from "@/server/pages/write";
import { erasePage, updatePage, type UpdatePageInput } from "@/server/pages/write/pages";
import { guidanceIssues, hasLiteralMarkup } from "@/page-content/authoring/guidance";
import { parseSpec, textTelemetry } from "@/server/pages/write/parse";
import { collectionTexts } from "@/page-content/document/text";
import { readPage, readPageList, type PageRecord } from "@/server/pages/read/pages";
import { writerLabels } from "@/server/pages/read/provenance";
import { MAX_COLLECTION_TEXT_CHARS } from "@/page-content/document/limits";
import { ownerPageUrl } from "@/shared/navigation/owner-routes";
import { invalidRequest } from "@/shared/api/errors";
import { fail, isUuid, ok, type HandlerResult } from "@/shared/api/types";

import { countItems, outlineOf, textOf } from "./outline";
import {
  DeletePageBodySchema,
  PatchSpecInputSchema,
  PreflightBodySchema,
  PutInputSchema,
  RewriteSpecInputSchema,
  SetPageBodySchema,
} from "./schemas";

export { DeletePageBodySchema, PreflightBodySchema, SetPageBodySchema };

const NEXT_LIST = ["list_pages"] as const;

/**
 * Redirect a spec body sent to `set_page` (a dropped `/spec` suffix) to the endpoint it was
 * written for, instead of a generic refusal pointing back here.
 */
export function specMisroute(body: unknown): HandlerResult | null {
  if (typeof body !== "object" || body === null) return null;
  const keys = Object.keys(body);
  if (!keys.some((key) => key === "ops" || key === "base_version" || key === "spec")) return null;
  return fail(422, {
    error:
      "This body edits page content, which lives at /v1/pages/{id}/spec: PATCH with base_version and RFC 6902 ops, or PUT to rewrite. "
      + "PATCH /v1/pages/{id} is set_page - metadata only (shared, space_id, title, live_steps).",
    code: "invalid_request",
    next: ["get_page", "patch_page_spec"],
  });
}

const MAX_FIND_RESULTS = 40;

/**
 * `POST /v1/pages/preflight`: run the spec checks (schema, text budget, caps, guidance) without
 * storing anything. A real write also checks request metadata and database state.
 */
export function preflight(input: { kind?: PageKind; spec: unknown }): HandlerResult {
  const kind = input.kind ?? "living";
  const candidate = parseSpec(input.spec, kind, { pathPrefix: "/spec", next: "put_page" });
  if ("status" in candidate) return candidate;
  const issues = guidanceIssues(candidate, "");
  return ok({
    valid: issues.every((issue) => issue.level !== "repair_required"),
    kind,
    ...textTelemetry(candidate, kind),
    collections: collectionTexts(candidate).map((collection) => ({
      element_id: collection.element_id,
      type: collection.type,
      prop: collection.prop,
      items: collection.items,
      chars: collection.chars,
      budget_remaining: Math.max(0, MAX_COLLECTION_TEXT_CHARS - collection.chars),
    })),
    issues: issues.map(({ code, level, message, path }) => ({ code, level, message, ...(path === undefined ? {} : { path }) })),
  });
}

/**
 * Refuse an inline `space` missing name or emoji. All three fields are required so the same
 * body is idempotent whether or not the Space exists.
 */
export function spaceShorthand(input: unknown): HandlerResult | null {
  if (typeof input !== "object" || input === null) return null;
  const space = (input as Record<string, unknown>).space;
  if (typeof space !== "object" || space === null) return null;
  const missing = ["name", "emoji"].filter((key) => !(key in space));
  if (missing.length === 0) return null;
  return fail(422, {
    error:
      `An inline space carries slug, name, and emoji together (missing: ${missing.join(", ")}), so the same write is `
      + "idempotent whether or not the Space exists yet: it creates when the slug is new, and an existing slug keeps "
      + "its stored name and emoji authoritative. To reference an existing Space without restating them, send "
      + "space_id instead - list_spaces has the id.",
    code: "invalid_request",
    path: "/space",
    next: ["list_spaces", "put_page"],
  });
}

export async function put(ctx: WriteContext, input: unknown): Promise<HandlerResult> {
  if (typeof input === "object" && input !== null && "page_id" in input) {
    return fail(422, {
      error: "put_page creates a page. Edit an existing one with PATCH /v1/pages/{id}/spec, which only touches the elements it names.",
      code: "put_is_create_only",
      path: "/page_id",
      next: ["get_page", "patch_page_spec"],
    });
  }
  const shorthand = spaceShorthand(input);
  if (shorthand !== null) return shorthand;
  const parsed = PutInputSchema.safeParse(input);
  if (!parsed.success) return invalidRequest(parsed.error, ["get_guide", "put_page"]);
  return writePage(ctx, parsed.data);
}

export async function patchSpec(ctx: WriteContext, pageId: string, input: unknown): Promise<HandlerResult> {
  const parsed = PatchSpecInputSchema.safeParse(input);
  if (!parsed.success) return invalidRequest(parsed.error, ["get_page", "patch_page_spec"]);
  return writeSpecPatch(ctx, { page_id: pageId, ...parsed.data });
}

export async function rewriteSpec(ctx: WriteContext, pageId: string, input: unknown): Promise<HandlerResult> {
  const parsed = RewriteSpecInputSchema.safeParse(input);
  if (!parsed.success) return invalidRequest(parsed.error, ["get_page", "rewrite_page_spec"]);
  return writeSpecRewrite(ctx, { page_id: pageId, ...parsed.data });
}

export interface ListInput {
  namespace_id: string;
  space_id?: string;
}

export async function list(input: ListInput): Promise<HandlerResult> {
  if (input.space_id !== undefined && !isUuid(input.space_id)) {
    return fail(404, {
      error: `"${input.space_id}" is not a space id.`,
      code: "space_not_found",
      path: "/space_id",
      next: ["list_pages"],
    });
  }
  const conditions = [eq(schema.pages.namespaceId, input.namespace_id)];
  if (input.space_id !== undefined) conditions.push(eq(schema.pages.spaceId, input.space_id));
  // No document or read keys: listings render no share link.
  const pages = await readPageList(conditions, "recent", { openKeys: false });
  const counts = await askCountsFor(pages.map((page) => page.id));
  const writers = await writerLabels(pages);
  const rows = pages.map((page) => ({
    page_id: page.id,
    space_id: page.spaceId,
    space_slug: page.spaceSlug,
    space_name: page.spaceName,
    space_emoji: page.spaceEmoji,
    slug: page.slug,
    title: page.title,
    kind: page.kind,
    shared: page.shared,
    exposure_actor: page.exposureActor,
    exposure_updated_at: page.exposureUpdatedAt,
    version: page.version,
    updated_at: page.updatedAt,
    last_summary: page.lastSummary,
    last_writer_grant_id: page.lastWriterGrantId,
    /** The grant's label, or null once that grant is gone. */
    last_writer: writers.label(page),
    written_registry_version: page.registryVersion,
    // Always present, zeroes included, so absence never reads as unknown.
    approvals: counts.get(page.id) ?? { open: 0, answered: 0 },
  }));
  return ok({
    pages: rows,
    approvals_open: rows.reduce((total, page) => total + page.approvals.open, 0),
    registry_version: REGISTRY_VERSION,
  });
}

interface PageRefInput { namespace_id: string; page_id: string }

export async function get(input: PageRefInput & { baseUrl: string }): Promise<HandlerResult> {
  const found = await loadRow(input.namespace_id, input.page_id);
  if ("status" in found) return found;
  const asks = await asksFor(found.id, found.spec);
  const writers = await writerLabels([found]);
  return ok({
    source: `page/${found.id}`,
    author: "agent",
    page_id: found.id,
    space: { id: found.spaceId, slug: found.spaceSlug, name: found.spaceName, emoji: found.spaceEmoji },
    shared: found.shared,
    exposure: { actor: found.exposureActor, updated_at: found.exposureUpdatedAt.toISOString() },
    meta: {
      title: found.title,
      slug: found.slug,
      kind: found.kind,
      source_event: found.sourceEvent,
      // Repeated here because callers look in `meta` for what they can hand out.
      shared: found.shared,
      owner_url: ownerPageUrl(input.baseUrl, found.id),
      // Built from the key and this request's origin; the row stores no link.
      url: found.readKey === null ? null : pageUrl(input.baseUrl, found.readKey),
      written_registry_version: found.registryVersion,
      created_at: found.createdAt.toISOString(),
      updated_at: found.updatedAt.toISOString(),
      last_writer_grant_id: found.lastWriterGrantId,
      last_writer: writers.label(found),
    },
    spec: found.spec,
    version: found.version,
    agent_updating: found.updatingUntil !== null && found.updatingUntil.getTime() > Date.now(),
    registry_version: REGISTRY_VERSION,
    // Agents learn about answers by reading the page; there is no callback.
    approvals: {
      // Unanswered only; answered questions are in `answers`.
      open: asks.filter((ask) => ask.answer === null).map((ask) => ({
        approval_id: ask.approval_id,
        // Which asking is on the page; the same words asked again are a new asking.
        ask_seq: ask.ask_seq,
        // Covers the question, context and option labels; changing any voids older answers.
        question_key: ask.question_key,
        question: ask.question,
      })),
      answers: asks.flatMap((ask) => ask.answer === null ? [] : [{
        approval_id: ask.approval_id,
        ask_seq: ask.ask_seq,
        question_key: ask.question_key,
        question: ask.question,
        ...ask.answer,
      }]),
    },
  });
}

export async function summary(input: PageRefInput): Promise<HandlerResult> {
  const found = await loadRow(input.namespace_id, input.page_id);
  if ("status" in found) return found;
  return ok({
    source: `page/${found.id}`,
    author: "agent",
    page_id: found.id,
    slug: found.slug,
    title: found.title,
    version: found.version,
    shared: found.shared,
    element_count: Object.keys(found.spec.elements).length,
    // Lets an agent check before toggling a monitored run.
    live_steps: found.liveSteps,
    // Null on pages written without an answer.
    answer: found.spec.answer ?? null,
    outline: outlineOf(found.spec),
    registry_version: REGISTRY_VERSION,
  });
}

export interface FindInput extends PageRefInput { component?: string; text?: string }

export async function find(input: FindInput): Promise<HandlerResult> {
  const found = await loadRow(input.namespace_id, input.page_id);
  if ("status" in found) return found;
  const needle = input.text?.toLowerCase();
  const matches = Object.keys(found.spec.elements).sort().filter((id) => {
    const element = found.spec.elements[id];
    if (input.component !== undefined && element.type !== input.component) return false;
    return needle === undefined || needle === "" || id.includes(needle) || textOf(element.props).includes(needle);
  }).map((id) => {
    const element = found.spec.elements[id];
    const items = countItems(element.props);
    return { id, type: element.type, ...(items === null ? {} : { items }), label: labelOf(element.props) };
  });
  const truncated = matches.length > MAX_FIND_RESULTS;
  return ok({
    source: `page/${found.id}`,
    author: "agent",
    page_id: found.id,
    elements: matches.slice(0, MAX_FIND_RESULTS),
    match_count: matches.length,
    truncated,
    ...(truncated ? { remedy: `Narrow ${matches.length} matches with component= or a longer text=.` } : {}),
    registry_version: REGISTRY_VERSION,
  });
}

/** `set_page`'s body plus the caller. */
export type UpdateInput = UpdatePageInput;

/** Rename, move and exposure are one explicit page mutation surface. */
export async function update(input: UpdateInput): Promise<HandlerResult> {
  if (
    input.shared === undefined
    && input.space_id === undefined
    && input.title === undefined
    && input.live_steps === undefined
  ) {
    return fail(422, { error: "Send shared, space_id, title, or live_steps.", code: "empty_patch", next: ["get_page"] });
  }
  if (input.space_id !== undefined && !isUuid(input.space_id)) {
    return fail(404, { error: `No space ${input.space_id} in this namespace.`, code: "space_not_found", path: "/space_id", next: ["list_pages"] });
  }
  if (input.title !== undefined && hasLiteralMarkup(input.title)) {
    return fail(422, {
      error: "A page title is plain text, so Markdown or HTML markers render literally. Remove the markers and retry the rename.",
      code: "literal_markup",
      path: "/title",
      next: ["set_page"],
    });
  }
  const result = await updatePage(input);
  return result ?? pageNotFound(input.page_id);
}

export async function remove(input: PageRefInput & { confirm?: boolean }): Promise<HandlerResult> {
  if (input.confirm !== true) return fail(422, {
    error: "Deleting a page erases it for everyone, and its links stop opening. There is no undo. Send confirm:true once the person has asked for it.",
    code: "confirm_required",
    path: "/confirm",
    next: ["get_page"],
  });
  const found = await loadRow(input.namespace_id, input.page_id);
  if ("status" in found) return found;
  // Decision log rows survive and are stamped with the deletion.
  await getDb().transaction(async (tx) => {
    await erasePage(tx, found.id);
  });
  return ok({ page_id: found.id, slug: found.slug, deleted: true });
}

type PageRow = PageRecord & { spec: StrataSpec; sourceEvent?: SourceEvent };

async function loadRow(namespaceId: string, pageId: string): Promise<PageRow | HandlerResult> {
  if (!isUuid(pageId)) return pageNotFound(pageId);
  const row = await readPage([eq(schema.pages.id, pageId), eq(schema.pages.namespaceId, namespaceId)]);
  if (row === null) return pageNotFound(pageId);
  // Stored specs are trusted, so registry tightening does not brick older pages.
  return { ...row, spec: row.document, sourceEvent: row.sourceEvent as SourceEvent | undefined };
}

function pageNotFound(id: string): HandlerResult {
  return fail(404, {
    // Scoped to this namespace, so the agent does not assume the page is gone everywhere.
    error: `No page with this id in your Strata. This credential opens exactly one namespace, and ${id} names nothing in it.`,
    code: "page_not_found",
    next: [...NEXT_LIST],
  });
}
