/**
 * `comparison`: before and after values on named rows, stacked per attribute so it fits a phone
 * where a multi-column `table` would scroll.
 */
import * as z from "zod";

import {
  MAX_COMPARISON_HEADER_CHARS,
  MAX_COMPARISON_ITEMS,
  MAX_COMPARISON_LABEL_CHARS,
  MAX_COMPARISON_VALUE_CHARS,
  collectionBudgetClause,
} from "@/page-content/document/limits";
import { EmptySchema } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";
import { ItemIdSchema } from "@/page-content/values";

export const schema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: ItemIdSchema,
        label: z.string().min(1).max(MAX_COMPARISON_LABEL_CHARS).describe(
          `the attribute's name, at most ${MAX_COMPARISON_LABEL_CHARS} characters`,
        ),
        before: z.string().min(1).max(MAX_COMPARISON_VALUE_CHARS).describe(
          `the earlier value, at most ${MAX_COMPARISON_VALUE_CHARS} characters`,
        ),
        after: z.string().min(1).max(MAX_COMPARISON_VALUE_CHARS).describe(
          `the current value, at most ${MAX_COMPARISON_VALUE_CHARS} characters`,
        ),
      }),
    )
    .describe(`up to ${MAX_COMPARISON_ITEMS} attribute rows; items may be empty only when empty is set${collectionBudgetClause()}`),
  before_label: z.string().min(1).max(MAX_COMPARISON_HEADER_CHARS).default("Was"),
  after_label: z.string().min(1).max(MAX_COMPARISON_HEADER_CHARS).default("Now"),
  empty: EmptySchema.describe("shown when items has none; items may be empty only when empty is set").optional(),
}).superRefine((props, ctx) => {
  if (props.items.length === 0 && props.empty === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["items"],
      message:
        "a comparison with no items renders an empty shell - add a row, or set empty to the sentence the reader should see instead",
    });
  }
  if (props.items.length > 0 && props.empty !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["empty"],
      message: `empty is shown only when items has none; this comparison has ${props.items.length} items, so drop empty or clear items`,
    });
  }
});

export const meta = {
  name: "comparison",
  since: 15,
  shape: "before and after on named rows",
  readerActs: false,
  description:
    "Show what changed on a small set of named attributes when a before and an after value, stacked on a phone, answers the reader's question better than columns.",
  interaction:
    "Display-only; readers see both values without editing controls.",
  confusable_with: [
    {
      name: "table",
      note: "comparison stacks exactly a before and after value per row for a phone; table keeps several shared fields aligned side by side.",
    },
    {
      name: "facts",
      note: "comparison stacks a before and after value per named row; facts states one thing's named values with no second state.",
    },
    {
      name: "decision",
      note: "decision weighs alternatives that have not happened yet; comparison shows what already changed on named attributes.",
    },
  ],
  example: {
    items: [
      { id: "rent", label: "Rent", before: "$1,950/mo", after: "$2,150/mo" },
      { id: "commute", label: "Commute", before: "35 min", after: "12 min" },
    ],
  },
} as const satisfies ComponentMeta;
