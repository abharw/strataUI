/**
 * Page write transactions (`writePage`, `patchSpec`, `rewriteSpec`) and their request and
 * response shapes. `deadEndWarnings` lives here because it reads through the open transaction.
 */
import type { JsonPatch } from "@json-render/core";
import { and, eq, inArray, sql } from "drizzle-orm";

import { REGISTRY_VERSION } from "@/page-content/catalog-versions";
import { getDb, isUniqueViolation, schema } from "@/server/db";
import type { AuthenticatedIdentity } from "@/server/auth";
import type { StrataSpec } from "@/page-content/schema";
import { MAX_PAGES_PER_NAMESPACE, MAX_PATCH_OPS, PRESENCE_MINUTES } from "@/page-content/document/limits";
import type { PageKind, Presence, SourceEvent } from "@/page-content/document/types";
import { reconcileAsks, type ReconciledAsk } from "@/server/pages/decisions";
import { fail, isUuid, ok, type ApiError, type HandlerResult } from "@/shared/api/types";
import { generateSecret, pageUrl, sha256Hex } from "@/server/credentials/keys";
import { openKey, sealKey } from "@/server/credentials/keys/at-rest";
import type { Tx } from "@/server/credentials/provision";
import { ownerPageUrl } from "@/shared/navigation/owner-routes";

import {
  addressDrift,
  guidanceWarnings,
  hasLiteralMarkup,
  repairRequiredIssues,
  type AddressDrift,
  type GuidanceContext,
} from "@/page-content/authoring/guidance";
import { applyOps, touchedApprovals } from "./ops";
import { parseSpec, requireSummary, textTelemetry } from "./parse";
import { claimWrite, quotaExceeded, recordPageWrite } from "@/server/api/quota";
import { resolveSpace, type SpaceReference } from "@/server/spaces/resolve";

export interface WriteContext extends AuthenticatedIdentity {
  baseUrl: string;
}

/** `live_steps` is a page switch that persists; `asset_refs` belong to this write's log row. */
interface TrailFields {
  live_steps?: boolean;
  asset_refs?: string[];
}

export interface PutPageRequest extends TrailFields {
  space_id?: string;
  space?: SpaceReference;
  slug?: string;
  title?: string;
  kind?: PageKind;
  source_event?: SourceEvent;
  spec: unknown;
  summary?: string;
  presence?: Presence;
}

export interface PatchSpecRequest extends TrailFields {
  page_id: string;
  base_version: number;
  ops: JsonPatch[];
  summary?: string;
  title?: string;
  source_event?: SourceEvent;
  presence?: Presence;
}

export interface RewriteSpecRequest extends TrailFields {
  page_id: string;
  base_version: number;
  spec: unknown;
  summary?: string;
  title?: string;
  source_event?: SourceEvent;
  presence?: Presence;
}

/** Deduplicated refs in the order given. */
function assetRefsOf(refs: readonly string[] | undefined): string[] {
  return [...new Set(refs ?? [])];
}

interface WritePageResponse extends Record<string, unknown> {
  warnings: string[];
  /** Text budget spent and remaining for this page's cadence, on every write. Floors at zero. */
  text_chars: number;
  budget_remaining: number;
  /**
   * Open questions after this write, when the page has any. `asked_again` lists questions this
   * write reopened after they were answered.
   */
  approvals?: {
    open: { approval_id: string; ask_seq: number; question: string }[];
    asked_again: { approval_id: string; ask_seq: number; question: string }[];
  };
  version: number;
  elements: { id: string; type: string }[];
  /** The canonical session-backed page for the person who owns this Strata. */
  owner_url: string;
  /** A read-only capability URL to forward to somebody else. */
  url: string;
  registry_version: number;
  page_id: string;
  space_id: string;
  slug: string;
  shared: boolean;
}

type PageRow = typeof schema.pages.$inferSelect;

function elementList(spec: StrataSpec): { id: string; type: string }[] {
  return Object.keys(spec.elements).sort().map((id) => ({ id, type: spec.elements[id].type }));
}

/** Warn when a shared page links to a page the reader cannot open. */
async function deadEndWarnings(tx: Tx, spec: StrataSpec, row: PageRow): Promise<string[]> {
  if (!row.shared) return [];
  const targets = new Set<string>();
  for (const element of Object.values(spec.elements)) {
    if (element.type === "link-button" && typeof element.props.page_id === "string") targets.add(element.props.page_id);
  }
  targets.delete(row.id);
  if (targets.size === 0) return [];
  // Use `tx`, not `getDb()`: taking a second pool connection inside an open transaction can
  // deadlock the pool (pg default max 10, no connect timeout) under concurrent writes.
  const rows = await tx
    .select({ id: schema.pages.id, title: schema.pages.title, shared: schema.pages.shared, spaceId: schema.pages.spaceId })
    .from(schema.pages)
    .where(and(eq(schema.pages.namespaceId, row.namespaceId), inArray(schema.pages.id, [...targets])));
  return rows
    .filter((target) => !target.shared || target.spaceId !== row.spaceId)
    .map((target) => !target.shared
      ? `This page is shared, but it links to "${target.title}", which is not. A reader following that link sees "not shared with you" - share the other page or drop the link.`
      : `This Page links to "${target.title}", which is shared in a different Space. A reader following that link from this shared Space sees "not shared with you".`);
}

/**
 * The presence lease. Only "open" claims more writes are coming, and each such write renews it;
 * any other write clears it.
 */
function presenceDeadline(presence: Presence | undefined): Date | null {
  return presence === "open" ? new Date(Date.now() + PRESENCE_MINUTES * 60_000) : null;
}

function pageNotFound(id: string): HandlerResult {
  return fail(404, {
    error: `No page with this id in your Strata. This credential opens exactly one namespace, and ${id} names nothing in it.`,
    code: "page_not_found",
    path: "/page_id",
    next: ["list_pages"],
  });
}

function responseFor(
  row: PageRow,
  baseUrl: string,
  spec: StrataSpec,
  warnings: string[],
  asks: readonly ReconciledAsk[] = [],
  summary?: string,
  drift?: AddressDrift,
): WritePageResponse {
  const approvals = asks.length === 0 ? undefined : {
    // Same shape as the detail read.
    open: asks.filter((ask) => !ask.answered).map(({ approval_id, ask_seq, question_key, question }) => ({ approval_id, ask_seq, question_key, question })),
    asked_again: asks.filter((ask) => ask.asked_again).map(({ approval_id, ask_seq, question_key, question }) => ({ approval_id, ask_seq, question_key, question })),
  };
  return {
    warnings,
    ...textTelemetry(spec, row.kind),
    ...(summary === undefined ? {} : { summary_chars: summary.length }),
    // Only a rewrite can move addresses, so only a rewrite reports drift.
    ...(drift === undefined ? {} : { elements_dropped: drift.elements_dropped, elements_renamed: drift.elements_renamed }),
    ...(approvals === undefined ? {} : { approvals }),
    version: row.version,
    elements: elementList(spec),
    owner_url: ownerPageUrl(baseUrl, row.id),
    // Built against the origin this request arrived on.
    url: pageUrl(baseUrl, openKey(row.sealedReadKey)),
    registry_version: REGISTRY_VERSION,
    page_id: row.id,
    space_id: row.spaceId,
    slug: row.slug,
    shared: row.shared,
  };
}

/**
 * Lifecycle columns a content write may not set. `kind` drives listing and the text budget;
 * the type makes setting it from a content update a compile error.
 */
type LifecycleColumn = "kind";

type PageColumns = typeof schema.pages.$inferInsert;

type ContentUpdate = Omit<Partial<PageColumns>, LifecycleColumn> & {
  [K in LifecycleColumn]?: never;
};

function contentUpdate<T extends ContentUpdate>(fields: T): Omit<T, LifecycleColumn> {
  return fields;
}

type WriteOperation = "put_page" | "patch_page_spec" | "rewrite_page_spec";

/**
 * Refuse objective authoring failures, pointing at the same operation to retry. Runs after the
 * structural schema and before the transaction.
 */
function authoringQualityFailure(
  spec: StrataSpec,
  context: GuidanceContext,
  operation: WriteOperation,
): HandlerResult | null {
  const issues = repairRequiredIssues(spec, context);
  if (issues.length === 0) return null;
  const errors: ApiError[] = issues.map((issue) => ({
    error: `${issue.message} This write was not stored; repair the candidate and retry ${operation}.`,
    code: issue.code,
    ...(issue.path === undefined ? {} : {
      path: operation !== "patch_page_spec" && /^\/(answer|root|elements)(\/|$)/.test(issue.path)
        ? `/spec${issue.path}`
        : issue.path,
    }),
    next: [operation],
  }));
  return fail(422, errors[0], errors.slice(1));
}

/** Create one page. Later edits go through `patchSpec` or `rewriteSpec`. */
export async function writePage(ctx: WriteContext, request: PutPageRequest): Promise<HandlerResult> {
  const summary = requireSummary(request.summary, "put_page");
  if (typeof summary !== "string") return summary;
  // The text budget depends on the cadence, so settle `kind` before parsing.
  const kind = request.kind ?? "living";
  const parsed = parseSpec(request.spec, kind);
  if ("status" in parsed) return parsed;
  const spec = parsed;
  const createSlug = typeof request.slug === "string" ? request.slug.trim() : "";
  const createTitle = typeof request.title === "string" ? request.title.trim() : "";
  if (createSlug === "") {
    return fail(422, { error: "Creating a page needs a stable slug.", code: "slug_required", path: "/slug", next: ["put_page"] });
  }
  if (createTitle === "") {
    return fail(422, { error: "Creating a page needs a title.", code: "title_required", path: "/title", next: ["put_page"] });
  }
  if (request.space !== undefined && hasLiteralMarkup(request.space.name)) {
    return fail(422, {
      error: "A Space name is plain text, so Markdown or HTML markers render literally. Remove the markers and retry the page create.",
      code: "literal_markup",
      path: "/space/name",
      next: ["put_page"],
    });
  }
  const qualityContext = { summary, title: createTitle } satisfies GuidanceContext;
  const qualityFailure = authoringQualityFailure(spec, qualityContext, "put_page");
  if (qualityFailure !== null) return qualityFailure;

  try {
    return await getDb().transaction(async (tx) => {
      const guard = await claimWrite(tx, ctx.namespace_id);
      if (guard !== null) return guard;

      const [{ pageCount }] = await tx
        .select({ pageCount: sql<number>`count(*)::int` })
        .from(schema.pages)
        .where(eq(schema.pages.namespaceId, ctx.namespace_id));
      if (pageCount >= MAX_PAGES_PER_NAMESPACE) {
        return quotaExceeded("pages", MAX_PAGES_PER_NAMESPACE);
      }

      const space = await resolveSpace(tx, ctx.namespace_id, request);
      if ("status" in space) return space;

      const id = crypto.randomUUID();
      const key = generateSecret("page");
      const [created] = await tx.insert(schema.pages).values({
        id,
        namespaceId: ctx.namespace_id,
        spaceId: space.id,
        slug: createSlug,
        title: createTitle,
        kind,
        version: 1,
        document: spec,
        registryVersion: REGISTRY_VERSION,
        sealedReadKey: sealKey(key),
        lastSummary: summary,
        lastWriterGrantId: ctx.grant_id,
        readKeyHash: sha256Hex(key),
        sourceEvent: request.source_event,
        updatingUntil: presenceDeadline(request.presence),
        shared: false,
        exposureActor: "system",
        liveSteps: request.live_steps ?? false,
      }).returning();
      await tx.insert(schema.pageWrites).values({
        pageId: id,
        grantId: ctx.grant_id,
        version: 1,
        summary,
        kind: "create",
        assetRefs: assetRefsOf(request.asset_refs),
      });
      const asks = await reconcileAsks(tx, id, spec, new Set());
      await recordPageWrite(tx, ctx.namespace_id);
      return ok(responseFor(created, ctx.baseUrl, spec, [...guidanceWarnings(spec, qualityContext), ...await deadEndWarnings(tx, spec, created)], asks, summary), 201);
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return fail(409, {
      error: "That page or space slug was created concurrently. List pages and update the existing id.",
      code: "slug_taken",
      path: "/slug",
      next: ["list_pages", "put_page"],
    });
  }
}

/**
 * Whether `produce` returned a refusal. Checks shape safely, since the value may be any JSON an
 * agent sent, including a string.
 */
function isHandlerResult(value: unknown): value is HandlerResult {
  return typeof value === "object" && value !== null && "status" in value && "body" in value;
}

/**
 * Edit a page with RFC 6902 operations. Untouched elements are not resent, so an element only
 * changes or disappears when the writer names its address.
 */
export async function patchSpec(ctx: WriteContext, request: PatchSpecRequest): Promise<HandlerResult> {
  const summary = requireSummary(request.summary, "patch_page_spec");
  if (typeof summary !== "string") return summary;
  if (!isUuid(request.page_id)) return pageNotFound(request.page_id);
  if (request.ops.length === 0) {
    return fail(422, {
      error: "Send at least one operation. An empty patch is not a write.",
      code: "empty_ops",
      path: "/ops",
      next: ["get_page", "patch_page_spec"],
    });
  }
  if (request.ops.length > MAX_PATCH_OPS) {
    return fail(422, {
      error: `A patch carries at most ${MAX_PATCH_OPS} operations; this one has ${request.ops.length}. Replace one element's subtree in a single operation, or if the whole page is being rebuilt, send it to PUT /v1/pages/{id}/spec.`,
      code: "too_many_ops",
      path: "/ops",
      next: ["get_page", "patch_page_spec", "rewrite_page_spec"],
    });
  }

  return editSpec(
    ctx,
    { ...request, summary },
    "patch_page_spec",
    (before) => applyOps(before, request.ops),
    // Rewriting an answered approval asks it again. Only elements this patch addresses count.
    (after) => touchedApprovals(after, request.ops),
  );
}

/**
 * Shared write for an existing page: one lock, one version bump, one log entry. `produce` is
 * the only difference between a patch and a rewrite.
 */
async function editSpec(
  ctx: WriteContext,
  /** `summary` is already trimmed and length-checked by `requireSummary`. */
  request: TrailFields & { page_id: string; base_version: number; summary: string; title?: string; source_event?: SourceEvent; presence?: Presence },
  operation: "patch_page_spec" | "rewrite_page_spec",
  produce: (before: StrataSpec) => unknown,
  touched: (after: StrataSpec) => ReadonlySet<string> = () => new Set(),
): Promise<HandlerResult> {
  return getDb().transaction(async (tx) => {
    const guard = await claimWrite(tx, ctx.namespace_id);
    if (guard !== null) return guard;

    // FOR UPDATE so spec writes, renames and moves of the same page serialize.
    const [row] = await tx
      .select()
      .from(schema.pages)
      .where(and(eq(schema.pages.id, request.page_id), eq(schema.pages.namespaceId, ctx.namespace_id)))
      .for("update");
    if (row === undefined) return pageNotFound(request.page_id);
    if (request.base_version !== row.version) {
      return fail(409, {
        error: `Page ${row.id} is at version ${row.version}, not ${request.base_version}. Read it and rebuild the write against the current spec.`,
        code: "version_conflict",
        path: "/base_version",
        valid: [row.version],
        next: ["get_page", operation],
      });
    }

    // Trust the stored spec; only the after-image is held to today's registry.
    const produced = produce(row.document);
    if (isHandlerResult(produced)) return produced;
    const parsed = parseSpec(produced, row.kind, {
      pathPrefix: operation === "patch_page_spec" ? "" : "/spec",
      next: operation,
    });
    if ("status" in parsed) return parsed;
    const spec = parsed;
    const candidateTitle = request.title?.trim() || row.title;
    const qualityContext = { summary: request.summary, title: candidateTitle } satisfies GuidanceContext;
    const qualityFailure = authoringQualityFailure(spec, qualityContext, operation);
    if (qualityFailure !== null) return qualityFailure;

    // A rewrite can rename or drop addresses silently, so report what moved.
    const drift = operation === "rewrite_page_spec" ? addressDrift(row.document, spec) : undefined;

    const version = row.version + 1;
    const [updated] = await tx
      .update(schema.pages)
      .set(contentUpdate({
        document: spec,
        registryVersion: REGISTRY_VERSION,
        title: candidateTitle,
        sourceEvent: request.source_event ?? row.sourceEvent,
        lastSummary: request.summary,
        lastWriterGrantId: ctx.grant_id,
        version,
        updatingUntil: presenceDeadline(request.presence),
        // Unchanged unless this write sets it.
        ...(request.live_steps === undefined ? {} : { liveSteps: request.live_steps }),
        updatedAt: new Date(),
      }))
      .where(and(eq(schema.pages.id, row.id), eq(schema.pages.version, row.version)))
      .returning();
    if (updated === undefined) {
      return fail(409, {
        error: "The page changed while this write was being saved. Read it and retry.",
        code: "version_conflict",
        path: "/base_version",
        next: ["get_page", operation],
      });
    }
    await tx.insert(schema.pageWrites).values({
      pageId: row.id,
      grantId: ctx.grant_id,
      version,
      summary: request.summary,
      // The log distinguishes rewrites, which can drop elements, from patches.
      kind: operation === "rewrite_page_spec" ? "rewrite" : "patch",
      assetRefs: assetRefsOf(request.asset_refs),
    });
    const asks = await reconcileAsks(tx, row.id, spec, touched(spec));
    await recordPageWrite(tx, ctx.namespace_id);
    return ok(responseFor(updated, ctx.baseUrl, spec, [...guidanceWarnings(spec, qualityContext, drift), ...await deadEndWarnings(tx, spec, updated)], asks, request.summary, drift));
  });
}

/**
 * Replace a page's whole spec. Patches cannot replace or remove `/elements` as a whole, so a
 * full rebuild goes through here; it still takes `base_version`.
 */
export async function rewriteSpec(ctx: WriteContext, request: RewriteSpecRequest): Promise<HandlerResult> {
  const summary = requireSummary(request.summary, "rewrite_page_spec");
  if (typeof summary !== "string") return summary;
  if (!isUuid(request.page_id)) return pageNotFound(request.page_id);
  // Parsed inside `editSpec`, since the text budget depends on the stored page's cadence.
  return editSpec(ctx, { ...request, summary }, "rewrite_page_spec", () => request.spec);
}
