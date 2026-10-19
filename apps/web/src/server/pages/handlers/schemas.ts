/** Zod schemas for every page request body, shared by the handlers, routes and OpenAPI document. */
import * as z from "zod";
import type { JsonPatch } from "@json-render/core";

import { PageKindSchema, PresenceSchema, SlugSchema, SourceEventSchema } from "@/page-content/document/types";
import { malformedIndexToken, prototypeToken } from "@/shared/api/json-pointer";
import { MAX_SPACE_NAME_CHARS, MAX_TITLE_CHARS, MAX_WRITE_ASSET_REFS } from "@/page-content/document/limits";
import { SpaceEmojiSchema } from "@/server/spaces/emoji";

/** Whether the chrome shows the "View steps" trail. Opt-in; `set_page` can flip it alone. */
const LiveStepsSchema = z.boolean().optional();

/**
 * `resource_id`s a write attaches to its own step in the trail. Step evidence, not page content;
 * page files belong in an `attachment-list`.
 */
const AssetRefsSchema = z.array(z.string().min(1).max(200))
  .max(MAX_WRITE_ASSET_REFS, `A write attaches at most ${MAX_WRITE_ASSET_REFS} files to its step. More than that is a gallery, and a gallery belongs on the page as an attachment-list.`)
  .optional();

export const SetPageBodySchema = z.strictObject({
  shared: z.boolean().optional(),
  space_id: z.string().optional(),
  title: z.string().trim().min(1, "A page needs a title.").max(MAX_TITLE_CHARS, `A page title holds at most ${MAX_TITLE_CHARS} characters - name the page, put the sentence in the TLDR, answer.verdict.`).optional(),
  live_steps: LiveStepsSchema,
  /** The agent's claim the person asked for this change. Logged only; it cannot re-share. */
  on_behalf_of_user: z.boolean().optional(),
});

export const DeletePageBodySchema = z.strictObject({
  confirm: z.boolean().optional(),
});

/** Defaults to "done", so a page never claims live activity nobody is doing. */
const PresenceInputSchema = PresenceSchema.optional();

/** Type only; presence and length are checked by `requireSummary` so its error codes surface. */
const WriteSummarySchema = z.string().optional();

export const PutInputSchema = z.strictObject({
  slug: SlugSchema.optional(),
  space_id: z.string().optional(),
  space: z.strictObject({
    slug: SlugSchema,
    name: z.string().min(1).max(
      MAX_SPACE_NAME_CHARS,
      `A space name holds at most ${MAX_SPACE_NAME_CHARS} characters - use a 2-4 word navigation label and put the detail on the Page.`,
    ),
    emoji: SpaceEmojiSchema,
  }).optional(),
  title: z.string().trim().max(MAX_TITLE_CHARS, `A page title holds at most ${MAX_TITLE_CHARS} characters - name the page, put the sentence in the TLDR, answer.verdict.`).optional(),
  kind: PageKindSchema.optional(),
  source_event: SourceEventSchema.optional(),
  spec: z.unknown(),
  summary: WriteSummarySchema,
  presence: PresenceInputSchema,
  live_steps: LiveStepsSchema,
  asset_refs: AssetRefsSchema,
});

// Core ships no zod schema for JsonPatch. `satisfies` ties this one to core's type, but a new
// upstream op would still satisfy it.
/** The addressable spec roots. The after-image is re-parsed with the whole-spec schema. */
const SPEC_ROOT_POINTER = /^\/(answer|root|elements|sequence)(\/.*)?$/;
const SPEC_ROOTS = "/answer, /root, /elements or /sequence";

export const PatchOpSchema = z.strictObject({
  op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
  path: z.string().regex(
    SPEC_ROOT_POINTER,
    `path must address ${SPEC_ROOTS}`,
  ),
  value: z.unknown().optional(),
  from: z.string().optional(),
}).superRefine((operation, ctx) => {
  for (const field of ["path", "from"] as const) {
    const pointer = operation[field];
    if (pointer === undefined) continue;
    const reserved = prototypeToken(pointer);
    if (reserved !== null) {
      ctx.addIssue({ code: "custom", path: [field], message: `"${reserved}" is a reserved name and cannot appear in a pointer.` });
      continue;
    }
    const token = malformedIndexToken(pointer);
    if (token === null) continue;
    ctx.addIssue({
      code: "custom",
      path: [field],
      message: `"${token}" is not an array index. An index is 0 or a digit string without a leading zero, sign, or decimal point, and "-" appends. A near-miss silently lands on a different item.`,
    });
  }
  // RFC 6902 requires `from`, and the renderer's patcher silently ignores it when missing.
  if ((operation.op === "move" || operation.op === "copy")) {
    if (operation.from === undefined) {
      ctx.addIssue({ code: "custom", path: ["from"], message: `${operation.op === "move" ? "A move" : "A copy"} needs "from", the pointer it reads.` });
    } else if (!SPEC_ROOT_POINTER.test(operation.from)) {
      ctx.addIssue({ code: "custom", path: ["from"], message: `from must address ${SPEC_ROOTS}.` });
    }
  }
  // Ops that swap or drop the whole element map belong on rewrite_page_spec, so patches never
  // delete silently. `/answer` can be edited but not removed: every page states where it stands.
  for (const [field, pointer] of [["path", operation.path], ["from", operation.from]] as const) {
    if (pointer === "/elements" || (pointer === "/root" && operation.op !== "replace")) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: `${pointer} is the whole page, not part of it. Rewrite it with PUT /v1/pages/{id}/spec, or name the elements this operation changes.`,
      });
    }
    if (pointer === "/answer" && (operation.op === "remove" || operation.op === "move")) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: "/answer is the page's standing state and every page has one. Replace it with the new TLDR instead of removing it.",
      });
    }
  }
  if ((operation.op === "add" || operation.op === "replace" || operation.op === "test") && !("value" in operation)) {
    ctx.addIssue({ code: "custom", path: ["value"], message: `${operation.op === "add" ? "An add" : `A ${operation.op}`} needs "value". Send null explicitly if null is what you mean.` });
  }
}) satisfies z.ZodType<JsonPatch, unknown>;

export const PatchSpecInputSchema = z.strictObject({
  base_version: z.number().int().nonnegative(),
  ops: z.array(PatchOpSchema),
  summary: WriteSummarySchema,
  title: z.string().trim().max(MAX_TITLE_CHARS, `A page title holds at most ${MAX_TITLE_CHARS} characters - name the page, put the sentence in the TLDR, answer.verdict.`).optional(),
  source_event: SourceEventSchema.optional(),
  presence: PresenceInputSchema,
  live_steps: LiveStepsSchema,
  asset_refs: AssetRefsSchema,
});

export const RewriteSpecInputSchema = z.strictObject({
  base_version: z.number().int().nonnegative(),
  spec: z.unknown(),
  summary: WriteSummarySchema,
  title: z.string().trim().max(MAX_TITLE_CHARS, `A page title holds at most ${MAX_TITLE_CHARS} characters - name the page, put the sentence in the TLDR, answer.verdict.`).optional(),
  source_event: SourceEventSchema.optional(),
  presence: PresenceInputSchema,
  live_steps: LiveStepsSchema,
  asset_refs: AssetRefsSchema,
});

export const PreflightBodySchema = z.strictObject({
  kind: PageKindSchema.optional(),
  spec: z.unknown(),
});
