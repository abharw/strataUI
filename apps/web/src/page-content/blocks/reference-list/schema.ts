/**
 * `reference-list`: quiet external evidence and further reading. Duplicate item ids are rejected
 * page-wide by `page-content/schema.ts`, so they are not checked here.
 */
import * as z from "zod";

import {
  MAX_COLLECTION_TEXT_CHARS,
  MAX_NOTE_CHARS,
  MAX_REFERENCE_SOURCE_CHARS,
  MAX_REFERENCE_TITLE_CHARS,
  collectionBudgetClause,
} from "@/page-content/document/limits";
import { EmptySchema } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";
import {
  ItemIdSchema,
  PARTIAL_TIMESTAMP_NOTE,
  PartialTimestampSchema,
} from "@/page-content/values";

const MAX_REFERENCES = 20;

/**
 * Field caps describe one reference; the shared collection budget binds first and decides how
 * many fit.
 */
const REFERENCE_BUDGET_NOTE =
  `every title, source and note on this element shares ${MAX_COLLECTION_TEXT_CHARS} characters, so full-length fields only fit a list of about one - a longer list means shorter entries`;

export const schema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: ItemIdSchema,
      title: z.string().min(1).max(MAX_REFERENCE_TITLE_CHARS).describe(
        `the source's own title, at most ${MAX_REFERENCE_TITLE_CHARS} characters; ${REFERENCE_BUDGET_NOTE}`,
      ),
      url: z.url({ protocol: /^https?$/ }).describe("http(s) source URL"),
      source: z.string().min(1).max(MAX_REFERENCE_SOURCE_CHARS).optional().describe(
        `who published it - a publication or site name, at most ${MAX_REFERENCE_SOURCE_CHARS} characters; ${REFERENCE_BUDGET_NOTE}`,
      ),
      published_at: PartialTimestampSchema.describe(
        `when the source was published, ${PARTIAL_TIMESTAMP_NOTE}`,
      ).optional(),
      // Matches the write-time MAX_NOTE_CHARS check so the manifest advertises the real limit.
      note: z.string().min(1).max(MAX_NOTE_CHARS).optional().describe(
        `one line on why this source is here, at most ${MAX_NOTE_CHARS} characters; ${REFERENCE_BUDGET_NOTE}`,
      ),
    }),
  )
    .max(MAX_REFERENCES, `must contain at most ${MAX_REFERENCES} references`)
    // The emitted JSON Schema has no `maxItems` (Anthropic rejects it), so the cap is stated here.
    .describe(
      `at most ${MAX_REFERENCES} sources, each with its own id. Items may be empty only when empty is set${collectionBudgetClause()}`,
    ),
  empty: EmptySchema.describe("shown when items has none; items may be empty only when empty is set").optional(),
}).superRefine((props, ctx) => {
  if (props.items.length === 0 && props.empty === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["items"],
      message:
        "a reference-list with no items renders an empty shell - add the source, or set empty to the sentence the reader should see instead",
    });
  }
  if (props.items.length > 0 && props.empty !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["empty"],
      message: `empty is shown only when items has none; this reference-list has ${props.items.length} items, so drop empty or clear items`,
    });
  }
});

export const meta = {
  name: "reference-list",
  since: 4,
  shape: "quiet external evidence",
  readerActs: true,
  description:
    "Consult supporting evidence or further reading through quiet source links with enough context to identify each source.",
  interaction:
    "Open sources in another tab; expand clipped titles and notes locally.",
  confusable_with: [
    {
      name: "quote",
      note: "quote presents words on the page; reference-list lets readers open the source material.",
    },
    {
      name: "link-button",
      note: "link-button makes one next destination prominent; reference-list keeps supporting source links quiet.",
    },
    {
      name: "attachment-list",
      note: "attachment-list presents host-resolved files belonging to the work; reference-list links to external evidence.",
    },
  ],
  example: {
    items: [
      {
        id: "json-render-catalog",
        title: "Catalogs",
        url: "https://json-render.dev/docs/catalog",
        source: "JSON Render",
        note: "How model-facing components and props are declared.",
      },
    ],
  },
} as const satisfies ComponentMeta;
