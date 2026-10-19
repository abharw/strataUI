/**
 * `facts`: named values. Copying is per item (`copyable`) because one page mixes values the
 * reader reads (a hotel name) with values they copy (a door code).
 */
import * as z from "zod";

import {
  MAX_FACTS_ITEMS,
  MAX_FACTS_LABEL_CHARS,
  MAX_FACTS_VALUE_CHARS,
  collectionBudgetClause,
} from "@/page-content/document/limits";
import { EmptySchema, MoneySchema, presentation, QuantitySchema } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";
import { ItemIdSchema } from "@/page-content/values";

/** A fact's value: a typed value, or a plain string capped for the row it sits in. */
const FactValueSchema = z.union([
  QuantitySchema,
  MoneySchema,
  z.string().trim().min(1).max(MAX_FACTS_VALUE_CHARS),
  z.number().finite(),
  z.boolean(),
], {
  error: `a facts value is a quantity {value, unit}, money {amount, currency}, or a plain string, number or boolean; text is at most ${MAX_FACTS_VALUE_CHARS} characters`,
});

export const schema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: ItemIdSchema,
        label: z.string().min(1).max(MAX_FACTS_LABEL_CHARS).describe(
          `what the fact is called, at most ${MAX_FACTS_LABEL_CHARS} characters - a name, not a sentence`,
        ),
        value: FactValueSchema.describe(
          `the fact itself, at most ${MAX_FACTS_VALUE_CHARS} characters when text; send a typed value or an ISO date rather than a pre-formatted string`,
        ),
        copyable: z.boolean().describe("true for anything the reader will paste elsewhere: codes, references, PINs").optional(),
      }),
    )
    .describe(`up to ${MAX_FACTS_ITEMS} named values; items may be empty only when empty is set${collectionBudgetClause()}`),
  /** Device default: stacked when any value exceeds 40 characters, else inline. */
  presentation: presentation(["stacked", "inline"]),
  empty: EmptySchema.describe("shown when items has none; items may be empty only when empty is set").optional(),
}).superRefine((props, ctx) => {
  if (props.items.length === 0 && props.empty === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["items"],
      message:
        "a facts block with no items renders an empty shell - add a field, or set empty to the sentence the reader should see instead",
    });
  }
  if (props.items.length > 0 && props.empty !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["empty"],
      message: `empty is shown only when items has none; this facts block has ${props.items.length} items, so drop empty or clear items`,
    });
  }
});

export const meta = {
  name: "facts",
  since: 15,
  shape: "named values",
  readerActs: true,
  description:
    "Look up an entity's named values in a compact layout, whether the reader reads them or copies some elsewhere.",
  interaction:
    "Copy fields marked copyable to the clipboard; other values cannot be edited here.",
  confusable_with: [
    {
      name: "code-block",
      note: "code-block preserves one exact text artifact; facts separates named values and optional copy controls.",
    },
    {
      name: "table",
      note: "facts presents named values independently; table aligns shared fields across records or attributes.",
    },
    {
      name: "item-list",
      note: "facts pairs a label with a value for named attributes of one thing; item-list scans titled rows with one trailing value each.",
    },
    {
      name: "comparison",
      note: "facts states one thing's named values; comparison stacks a before and after value per named row.",
    },
    {
      name: "accordion",
      note: "facts keeps short named values visible for scanning; accordion hides optional explanations behind labels.",
    },
    {
      name: "callout",
      note: "facts presents several named values under their own labels; callout emphasizes one contextual passage.",
    },
    {
      name: "prose",
      note: "facts separates short named values; prose keeps causal explanations and qualifications connected.",
    },
  ],
  example: {
    items: [
      { id: "record-locator", label: "Record locator", value: "ABC123", copyable: true },
      { id: "check-in", label: "Check-in", value: "2026-09-12" },
    ],
  },
} as const satisfies ComponentMeta;
