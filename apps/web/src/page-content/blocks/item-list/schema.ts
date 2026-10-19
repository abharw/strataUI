/**
 * `item-list`: rows with a title, an optional supporting line and a trailing value, plus an
 * optional thumbnail, date and link per row.
 */
import * as z from "zod";

import {
  MAX_ITEM_LIST_DESCRIPTION_CHARS,
  MAX_ITEM_LIST_ITEMS,
  MAX_ITEM_LIST_TITLE_CHARS,
  MAX_ITEM_LIST_VALUE_CHARS,
  MAX_UNIT_CHARS,
  collectionBudgetClause,
} from "@/page-content/document/limits";
import {
  EmptySchema,
  IsoDateSchema,
  LinkSchema,
  MoneySchema,
  presentation,
  QuantitySchema,
} from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";
import { ItemIdSchema, MediaRefSchema } from "@/page-content/values";

/** The trailing value: a typed value as in `metric`, or a short string that stays flush right. */
const RowValueSchema = z.union([
  QuantitySchema.extend({ unit: z.string().trim().min(1).max(MAX_UNIT_CHARS).optional() }),
  MoneySchema,
  z.string().trim().min(1).max(MAX_ITEM_LIST_VALUE_CHARS),
  z.number().finite(),
  z.boolean(),
], {
  error: `an item-list value is a quantity {value, unit}, money {amount, currency}, or a plain string, number or boolean; text is at most ${MAX_ITEM_LIST_VALUE_CHARS} characters`,
});

const RowSchema = z.strictObject({
  id: ItemIdSchema,
  title: z.string().min(1).max(MAX_ITEM_LIST_TITLE_CHARS),
  /** One supporting line under the title. */
  description: z.string().min(1).max(MAX_ITEM_LIST_DESCRIPTION_CHARS).optional(),
  /** The trailing figure - a price, a count, a short state. */
  value: RowValueSchema.optional(),
  /** A small leading thumbnail. */
  media: MediaRefSchema.optional(),
  on: IsoDateSchema.describe("YYYY-MM-DD; when every row carries this, rows are grouped by day in date order").optional(),
  /** Makes the whole row tappable; the renderer draws the affordance. */
  link: LinkSchema.optional(),
});

export const schema = z.strictObject({
  items: z
    .array(RowSchema)
    .describe(`up to ${MAX_ITEM_LIST_ITEMS} rows; items may be empty only when empty is set${collectionBudgetClause()}`),
  /**
   * `by-day` shows one day at a time, opening on the reader's today. It requires `on` on every row
   * and is the one presentation an agent must request, since the data cannot imply it.
   */
  presentation: presentation(["rows", "cards", "by-day"]),
  empty: EmptySchema.describe("shown when items has none; items may be empty only when empty is set").optional(),
}).superRefine((props, ctx) => {
  if (props.presentation === "by-day" && props.items.some((item) => item.on === undefined)) {
    ctx.addIssue({
      code: "custom",
      path: ["presentation"],
      message:
        "by-day shows one day at a time, so every row needs an on date; give the undated rows a day, or leave presentation null",
    });
  }
  if (props.items.length === 0 && props.empty === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["items"],
      message:
        "an item-list with no items renders an empty shell - add a row, or set empty to the sentence the reader should see instead",
    });
  }
  if (props.items.length > 0 && props.empty !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["empty"],
      message: `empty is shown only when items has none; this item-list has ${props.items.length} items, so drop empty or clear items`,
    });
  }
});

export const meta = {
  name: "item-list",
  since: 15,
  shape: "rows with a title and a trailing value",
  readerActs: true,
  description:
    "Scan rows of things that share a title and a trailing value, such as doors, days, or line items, when a table's columns would be overkill.",
  interaction:
    "Tap a linked row to open its destination; unlinked rows are display-only. Under by-day, step between dated days with previous and next.",
  confusable_with: [
    {
      name: "facts",
      note: "item-list scans titled rows with one trailing value each; facts pairs a label with a value for named attributes of one thing.",
    },
    {
      name: "table",
      note: "item-list scans rows with one value each; table aligns several shared fields across records.",
    },
    {
      name: "status-list",
      note: "item-list is a general row-with-a-value list; status-list is specifically owned open work with a state, owner, and wait time.",
    },
  ],
  example: {
    items: [
      { id: "unit-4b", title: "Unit 4B", description: "2BR, top floor", value: { amount: 2150, currency: "USD" } },
    ],
  },
} as const satisfies ComponentMeta;
