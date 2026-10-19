/**
 * Strict Strata profile for canonical JSON Render specs.
 */
import type { Spec } from "@json-render/core";
import * as z from "zod";

import { ELEMENT_ID_RE } from "@/page-content/document/ids";
import { CARD_CHILD_TYPES, CAROUSEL_CHILD_TYPES, GRID_CHILD_TYPES } from "@/page-content/document/composition";
import {
  MAX_ANSWER_VERDICT_CHARS,
  MAX_BODY_BYTES,
  MAX_CAROUSEL_CHILDREN,
  MAX_COLLECTION_TEXT_CHARS,
  MAX_DEPTH,
  MAX_GRID_CHILDREN,
  MAX_ITEMS_PER_COLLECTION,
  MAX_NODES_HARD,
  MAX_PROSE_CHARS,
  MAX_PROSE_ELEMENTS,
  MAX_SEQUENCE_POSITION,
  PAGE_TEXT_BUDGET,
} from "@/page-content/document/limits";
import { collectionTexts, pageTextChars, siblingCollectionTexts, textSpans } from "@/page-content/document/text";
import { LinkSchema, type PageKind } from "@/page-content/document/types";
import { COMPONENT_NAMES, validateProps } from "./catalog";
import { strataCatalog } from "@/page-content/json-render/catalog";

const componentNames = COMPONENT_NAMES as [
  (typeof COMPONENT_NAMES)[number],
  ...(typeof COMPONENT_NAMES)[number][],
];

/** JSON Render's default-slot declaration is the authority for containment. */
const CHILD_COMPONENTS = new Set(
  Object.entries(strataCatalog.data.components)
    .filter(([, definition]) =>
      "slots" in definition && definition.slots?.includes("default") === true,
    )
    .map(([name]) => name),
);

const CARD_CHILDREN = new Set<string>(CARD_CHILD_TYPES);
const GRID_CHILDREN = new Set<string>(GRID_CHILD_TYPES);
const CAROUSEL_CHILDREN = new Set<string>(CAROUSEL_CHILD_TYPES);

/** The id grammar in words; zod alone reports a raw pattern or "Invalid key in record". */
const ELEMENT_ID_MESSAGE =
  'an element id is a lowercase letter followed by up to 63 lowercase letters, digits or hyphens, like "flight-status"';

/** `children` may be omitted on the wire; the parsed spec always has it. */
const JsonRenderElementSchema = z.strictObject({
  type: z.enum(componentNames),
  props: z.record(z.string(), z.unknown()),
  children: z.array(z.string().regex(ELEMENT_ID_RE, ELEMENT_ID_MESSAGE)).default([]),
});

/**
 * JSON Render element fields that Strata's profile omits. Agents familiar with the library put
 * them inside `props`, so they get a targeted refusal instead of "Unrecognized key".
 */
const ELEMENT_FIELDS_IN_PROPS = new Set(["visible", "on", "repeat", "watch", "slots", "children", "type"]);

/**
 * The page's standing state in one line. Unlike the write `summary`, which is a delta, it says
 * what the page says when nothing changed.
 */
const AnswerSchema = z.strictObject({
  verdict: z
    .string()
    .trim()
    .min(1, "the TLDR is the page's standing answer, so it cannot be empty")
    .max(
      MAX_ANSWER_VERDICT_CHARS,
      `the TLDR is one line: at most ${MAX_ANSWER_VERDICT_CHARS} characters. Put the reasoning in the page, not in the TLDR.`,
    )
    .describe("where this page stands right now, in one line the reader could repeat"),
});

/**
 * Spec-root navigation rendered by the chrome under the title; labels come from target page
 * titles at read time. With `position`, `previous`/`next` are derived from siblings at read time
 * (`assembleSequence`), so a plan's pages can be created in one pass.
 */
const SequenceSchema = z.strictObject({
  previous: LinkSchema.describe("the prior page in this sequence").optional(),
  next: LinkSchema.describe("the next page in this sequence").optional(),
  up: LinkSchema.describe("the page this one belongs to").optional(),
  position: z
    .int()
    .min(1)
    .max(MAX_SEQUENCE_POSITION)
    .describe(
      "this page's place among the pages that share its up, counted from 1; previous and next are then derived from the siblings that exist at read time, so a plan's pages are written in one pass without knowing each other's ids. Requires up to be a { page } link.",
    )
    .optional(),
}).superRefine((sequence, ctx) => {
  if (sequence.position === undefined) return;
  if (sequence.up === undefined || !("page" in sequence.up)) {
    ctx.addIssue({
      code: "custom",
      path: ["position"],
      message:
        "position orders this page among the children of its up page, so it needs up to be a { page } link - a url has no children to count among",
    });
  }
});

const SpecObjectSchema = z.strictObject({
  root: z.string().regex(ELEMENT_ID_RE, ELEMENT_ID_MESSAGE),
  elements: z.record(z.string().regex(ELEMENT_ID_RE, ELEMENT_ID_MESSAGE), JsonRenderElementSchema),
  // Optional in the type because stored pages may lack it; the refinement requires it on write
  // so the refusal can explain how to add one.
  answer: AnswerSchema.optional(),
  sequence: SequenceSchema.optional(),
});

/** Text budget per field, collection and page. Each refusal names the cap, the count and the fix. */
function refineText(
  spec: z.infer<typeof SpecObjectSchema>,
  ctx: z.RefinementCtx,
  kind: PageKind,
): void {
  const budget = PAGE_TEXT_BUDGET[kind];
  const total = pageTextChars(spec);
  if (total > budget) {
    const other: PageKind = kind === "living" ? "standing" : "living";
    ctx.addIssue({
      code: "custom",
      path: [],
      message:
        `This page holds ${total.toLocaleString("en-US")} characters of visible text; a ${kind} page's budget is `
        + `${budget.toLocaleString("en-US")}. Text is the scarce resource, not elements. Cut ${(total - budget).toLocaleString("en-US")} characters: `
        + "put the standing answer in `answer.verdict`, keep its supporting facts in the representation that serves "
        + "the reader's task, compress repetition, and move the background or the "
        + `full account to a second page. A ${other} page's budget is ${PAGE_TEXT_BUDGET[other].toLocaleString("en-US")}, `
        + "so a cadence change is not a way around this.",
    });
  }

  for (const collection of collectionTexts(spec)) {
    if (collection.chars <= MAX_COLLECTION_TEXT_CHARS) continue;
    ctx.addIssue({
      code: "custom",
      path: collection.path,
      message:
        `The ${collection.items} items in ${collection.type} \"${collection.element_id}\" hold `
        + `${collection.chars.toLocaleString("en-US")} characters of text; one collection may hold `
        + `${MAX_COLLECTION_TEXT_CHARS}. A list is scanned, not read: keep the few items that answer the page's `
        + "question and compress them to one line each, drop the rest, or move them to a second page. Splitting "
        + "the list into sibling collections of the same type is not a way around this: they share one budget.",
    });
  }

  for (const group of siblingCollectionTexts(spec)) {
    if (group.chars <= MAX_COLLECTION_TEXT_CHARS) continue;
    ctx.addIssue({
      code: "custom",
      path: group.path,
      message:
        `The ${group.element_ids.length} ${group.type} elements under \"${group.parent_id}\" `
        + `(${group.element_ids.join(", ")}) hold ${group.chars.toLocaleString("en-US")} characters of text `
        + `between them; same-type siblings under one parent share one ${MAX_COLLECTION_TEXT_CHARS}-character `
        + "collection budget. The reader meets them as one list, so splitting a list across sibling "
        + `${group.type} elements does not raise the cap: keep the few items that answer the page's question `
        + "and compress them to one line each, drop the rest, or move them to a second page.",
    });
  }

  for (const span of textSpans(spec)) {
    if (span.cap === null || span.chars <= span.cap) continue;
    ctx.addIssue({
      code: "custom",
      path: span.path,
      message:
        `${span.field} in \"${span.element_id}\" is ${span.chars.toLocaleString("en-US")} characters; the cap is `
        + `${span.cap}. Compress it to a short fact${span.type === "prose" ? "" : ", move the explanation into the page's one `prose` element"}`
        + `, or move it to a second page. Truncating mid-sentence is not the fix; saying less is.`,
    });
  }
}

/** At most one `prose` element, and never the root's first child. */
function refineProse(spec: z.infer<typeof SpecObjectSchema>, ctx: z.RefinementCtx): void {
  const proseIds = Object.keys(spec.elements)
    .sort()
    .filter((id) => spec.elements[id]?.type === "prose");
  if (proseIds.length > MAX_PROSE_ELEMENTS) {
    ctx.addIssue({
      code: "custom",
      path: ["elements", proseIds[MAX_PROSE_ELEMENTS]],
      message:
        `This page has ${proseIds.length} prose elements (${proseIds.join(", ")}); a page may have `
        + `${MAX_PROSE_ELEMENTS}. Keep the one passage that explains the answer, at most ${MAX_PROSE_CHARS} characters, `
        + "and turn the others into the typed elements they are describing - or move them to a second page.",
    });
  }
  const first = spec.elements[spec.root]?.children[0];
  if (first !== undefined && spec.elements[first]?.type === "prose") {
    ctx.addIssue({
      code: "custom",
      path: ["elements", spec.root, "children", 0],
      message:
        `The root's first child "${first}" is prose. Put the representation that supports the page's answer `
        + "and serves the reader's task before the explanation; a chart, timeline, comparison, or focused peer "
        + "can lead. Preserve the explanation's qualifications in prose below it, and do not invent a metric "
        + "just to fill the opening.",
    });
  }
}

/**
 * Stricter than JSON Render's Spec: no state, bindings, actions, directives, visibility, slots,
 * className/style or unknown top-level fields. Built per cadence because the text budget differs.
 */
function buildSpecSchema(kind: PageKind) {
  // Zod skips refinements when the inner parse already failed, so `parseSpec` warns that the
  // rest of the page was not evaluated on those refusals.
  return SpecObjectSchema.superRefine((spec, ctx) => {
    // `parseSpec` surfaces issue zero as `error`, so the text budget is checked first.
    refineText(spec, ctx, kind);
    refineProse(spec, ctx);
    if (spec.answer === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["answer"],
        message:
          "This spec has no `answer`. Every page states where it stands, so add "
          + '`"answer": {"verdict": "<one line, at most '
          + `${MAX_ANSWER_VERDICT_CHARS} characters>"}\` beside \`root\` and \`elements\`. `
          + "The TLDR is the page's standing state - what it says when nothing changed - not this write's summary, "
          + 'which is the delta the chrome shows. In a patch that is one operation: {"op":"add","path":"/answer",'
          + '"value":{"verdict":"..."}}.',
      });
    }
    return refineStructure(spec, ctx);
  });
}

/**
 * Structural rules, used instead of core's `validateSpec`: it adds cycles, depth, single-parent,
 * item ids, arity and container composition. Running both would duplicate refusals.
 */
function refineStructure(
  spec: z.infer<typeof SpecObjectSchema>,
  ctx: z.RefinementCtx,
): void {
  const ids = Object.keys(spec.elements);
  const linkButtonIds = ids.filter((id) => spec.elements[id]?.type === "link-button");
  if (linkButtonIds.length > 1) {
    ctx.addIssue({
      code: "custom",
      path: ["elements"],
      message: `a page may contain at most one link-button; keep the single primary action and replace ${linkButtonIds.slice(1).join(", ")} with references or page content`,
    });
  }
  if (ids.length > MAX_NODES_HARD) {
    ctx.addIssue({
      code: "custom",
      path: ["elements"],
      message: `a page may contain at most ${MAX_NODES_HARD} elements`,
    });
  }
  if (new TextEncoder().encode(JSON.stringify(spec)).length > MAX_BODY_BYTES) {
    ctx.addIssue({
      code: "custom",
      path: [],
      message: `a page spec may contain at most ${MAX_BODY_BYTES} bytes`,
    });
  }
  if (spec.elements[spec.root]?.type !== "section") {
    ctx.addIssue({
      code: "custom",
      path: ["root"],
      message: "the root element must be a section",
    });
  }
  if (
    spec.elements[spec.root]?.type === "section" &&
    spec.elements[spec.root]?.children.length === 0
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["elements", spec.root, "children"],
      message:
        "The root section has no children. A page with nothing on it is a message, not a page - add the element "
        + "that carries the current answer (a metric, status-list, or one or two typed elements), or send the "
        + "message instead.",
    });
  }
  if (spec.elements[spec.root]?.props.title !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["elements", spec.root, "props", "title"],
      message: "the root section cannot repeat the page title owned by app chrome",
    });
  }
  if (!(spec.root in spec.elements)) {
    ctx.addIssue({
      code: "custom",
      path: ["root"],
      message: `root \"${spec.root}\" is not present in elements`,
    });
  }

  const parents = new Map<string, string>();
  const approvalIds = new Set<string>();
  for (const [id, element] of Object.entries(spec.elements)) {
    const misplaced = Object.keys(element.props).filter((key) => ELEMENT_FIELDS_IN_PROPS.has(key));
    for (const key of misplaced) {
      ctx.addIssue({
        code: "custom",
        path: ["elements", id, "props", key],
        message: key === "type" || key === "children"
          ? `"${key}" belongs beside "props" on the element, not inside it: {"type": "${element.type}", "props": {...}, "children": []}.`
          : `"${key}" is a JSON Render element field, and Strata's profile has none of them - no state, bindings, actions, `
            + `visibility, or slots. The page shows what it says, and the agent writes the next version when the situation `
            + `changes. Remove "${key}" from ${id}'s props.`,
      });
    }
    // Strip them so the closed component schema does not also report "Unrecognized key".
    const propsToCheck = misplaced.length === 0
      ? element.props
      : Object.fromEntries(Object.entries(element.props).filter(([key]) => !ELEMENT_FIELDS_IN_PROPS.has(key)));
    const props = validateProps(element.type, propsToCheck);
    for (const issue of props.issues) {
      ctx.addIssue({
        code: "custom",
        path: ["elements", id, "props", ...issue.path],
        message: issue.message,
      });
    }

    const children = element.children;
    for (const [prop, value] of Object.entries(element.props)) {
      if (!Array.isArray(value) || value.length === 0) continue;
      const identified = value.every(
        (item) => typeof item === "object" && item !== null && !Array.isArray(item) && typeof (item as { id?: unknown }).id === "string",
      );
      if (!identified) continue;
      if (value.length > MAX_ITEMS_PER_COLLECTION) {
        ctx.addIssue({
          code: "custom",
          path: ["elements", id, "props", prop],
          message: `a collection may contain at most ${MAX_ITEMS_PER_COLLECTION} items`,
        });
      }
      const seen = new Set<string>();
      let duplicateReported = false;
      for (const [index, item] of value.entries()) {
        const itemId = (item as { id: string }).id;
        if (seen.has(itemId) && !duplicateReported) {
          // One issue per collection; per-occurrence issues could exceed 4x the request size.
          duplicateReported = true;
          ctx.addIssue({
            code: "custom",
            path: ["elements", id, "props", prop, index, "id"],
            message: `item id "${itemId}" is duplicated - an id is how a later write addresses its item, so two items sharing one would move together`,
          });
        }
        seen.add(itemId);
      }
    }
    if (children.length > 0 && !CHILD_COMPONENTS.has(element.type)) {
      ctx.addIssue({
        code: "custom",
        path: ["elements", id, "children"],
        message: `leaf component \"${element.type}\" cannot have children`,
      });
    }
    if (element.type === "approval") {
      // Answers are keyed by this id, so it must be unique on the page.
      const approvalId = element.props.id;
      if (typeof approvalId === "string") {
        if (approvalIds.has(approvalId)) {
          ctx.addIssue({
            code: "custom",
            path: ["elements", id, "props", "id"],
            message: `two approvals both use the id \"${approvalId}\"; an answer is filed under it, so it has to be unique on the page`,
          });
        }
        approvalIds.add(approvalId);
      }
    }
    if (element.type === "carousel") {
      if (children.length > MAX_CAROUSEL_CHILDREN) {
        ctx.addIssue({
          code: "custom",
          path: ["elements", id, "children"],
          message: `carousel has ${children.length} children; the card is the unit browsed one at a time, up to ${MAX_CAROUSEL_CHILDREN}`,
        });
      }
      const carouselChildTypes = new Set(
        children.map((child) => spec.elements[child]?.type).filter((type) => type !== undefined),
      );
      if ([...carouselChildTypes].some((type) => !CAROUSEL_CHILDREN.has(type))) {
        ctx.addIssue({
          code: "custom",
          path: ["elements", id, "children"],
          message: "carousel children must be card elements; a card is a container with its own slots for whatever the peer needs",
        });
      }
    }
    if (element.type === "grid") {
      if (children.length > MAX_GRID_CHILDREN) {
        ctx.addIssue({
          code: "custom",
          path: ["elements", id, "children"],
          message: `grid has ${children.length} children; a grid is two phone columns, up to ${MAX_GRID_CHILDREN}`,
        });
      }
      const gridChildTypes = new Set(
        children.map((child) => spec.elements[child]?.type).filter((type) => type !== undefined),
      );
      if ([...gridChildTypes].some((type) => !GRID_CHILDREN.has(type))) {
        ctx.addIssue({
          code: "custom",
          path: ["elements", id, "children"],
          message:
            "a grid cell is half the phone's width; only a single metric, progress bar, or card stays glanceable there, so bars, rows, axes, and sentences stay in a section",
        });
      }
    }
    if (element.type === "card") {
      const cardChildTypes = new Set(
        children.map((child) => spec.elements[child]?.type).filter((type) => type !== undefined),
      );
      if ([...cardChildTypes].some((type) => !CARD_CHILDREN.has(type))) {
        ctx.addIssue({
          code: "custom",
          path: ["elements", id, "children"],
          message: `a card is read on its own screen or half a grid row, so nested containers stay in a section; children must be one of: ${CARD_CHILD_TYPES.join(", ")}`,
        });
      }
      if (children.length === 0 && element.props.title === undefined && element.props.media === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["elements", id, "children"],
          message:
            "a card with no children needs title or media - a cover card - or it renders nothing; add one of those, or give the card a child block",
        });
      }
    }

    for (const [index, child] of children.entries()) {
      if (!(child in spec.elements)) {
        ctx.addIssue({
          code: "custom",
          path: ["elements", id, "children", index],
          message: `child \"${child}\" is not present in elements`,
        });
      }
      const previous = parents.get(child);
      if (previous !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["elements", id, "children", index],
          message: `element \"${child}\" already belongs to \"${previous}\"`,
        });
      } else {
        parents.set(child, id);
      }
    }
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const walk = (id: string, depth = 1): void => {
    if (depth > MAX_DEPTH) {
      ctx.addIssue({
        code: "custom",
        path: ["elements", id],
        message: `element depth may not exceed ${MAX_DEPTH}`,
      });
      return;
    }
    if (active.has(id)) {
      ctx.addIssue({
        code: "custom",
        path: ["elements", id],
        message: `element \"${id}\" forms a cycle`,
      });
      return;
    }
    if (visited.has(id)) return;
    const element = spec.elements[id];
    if (element === undefined) return;
    active.add(id);
    for (const child of element.children) walk(child, depth + 1);
    active.delete(id);
    visited.add(id);
  };
  walk(spec.root);

  for (const id of Object.keys(spec.elements)) {
    if (!visited.has(id)) {
      ctx.addIssue({
        code: "custom",
        path: ["elements", id],
        message: `element \"${id}\" is not reachable from root \"${spec.root}\"`,
      });
    }
  }
}

/** `StrataSpecSchema` is the stricter `living` schema, for callers that do not know the cadence. */
const SPEC_SCHEMAS = {
  living: buildSpecSchema("living"),
  standing: buildSpecSchema("standing"),
} as const satisfies Record<PageKind, unknown>;

export const StrataSpecSchema = SPEC_SCHEMAS.living;

export function specSchemaFor(kind: PageKind): typeof StrataSpecSchema {
  return SPEC_SCHEMAS[kind];
}

export type StrataSpec = z.infer<typeof StrataSpecSchema>;

/** Asserts the profile narrows core's `Spec`, so stored documents pass to `applySpecPatch` uncast. */
export type StrataSpecNarrowsSpec = StrataSpec extends Spec ? true : never;
