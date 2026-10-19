/**
 * `table`: records on shared fields. Cells are bare values because prop depth is capped at 3, so
 * `copyable_columns` and `highlight_column` are per column. Row-id uniqueness is enforced
 * page-wide in `page-content/schema.ts`.
 */
import * as z from "zod";

import { collectionBudgetClause } from "@/page-content/document/limits";
import { EmptySchema, presentation } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";
import { ColumnIndexSchema, DisplayValueSchema, ItemIdSchema } from "@/page-content/values";

export const schema = z.strictObject({
  /**
   * Header labels, left to right. In a comparison matrix (attributes as rows,
   * options as columns) the first header is the empty corner: `""`.
   */
  columns: z
    .array(z.string())
    .min(1)
    .describe("header labels, left to right; use \"\" for the empty corner of a comparison matrix"),
  rows: z.array(
    z.strictObject({
      id: ItemIdSchema,
      /** One value per column, in column order. Typed values render locale-aware. */
      cells: z
        .array(DisplayValueSchema)
        .describe("one value per column, in order; use {value,unit} and {amount,currency} rather than formatting numbers yourself"),
    }),
  )
    .describe(`one row per record; row ids are unique, every row carries one cell per column, and rows may be empty only when empty is set${collectionBudgetClause()}`),
  highlight_column: ColumnIndexSchema.describe(
    "zero-based index of the column to mark as the pick",
  ).optional(),
  /** Zero-based indices of columns whose cells are tap-to-copy targets. */
  // A set written as a list: duplicates are deduped (first mention wins), not refused.
  copyable_columns: z
    .array(ColumnIndexSchema)
    .transform((columns) => [...new Set(columns)])
    .describe("zero-based indices of columns whose values the reader will paste elsewhere; repeats are ignored")
    .optional(),
  key_column: z.string().min(1).describe(
    "the column name that identifies a row; must name one of columns. Heads each stacked facts block when presentation is records",
  ).optional(),
  presentation: presentation(["grid", "records"]),
  empty: EmptySchema.describe("shown when rows has none; rows may be empty only when empty is set").optional(),
}).superRefine((props, ctx) => {
  for (const [index, row] of props.rows.entries()) {
    if (row.cells.length !== props.columns.length) {
      ctx.addIssue({
        code: "custom",
        path: ["rows", index, "cells"],
        message: `expected ${props.columns.length} cells, one for each column`,
      });
    }
  }
  if (props.highlight_column !== undefined && props.highlight_column >= props.columns.length) {
    ctx.addIssue({
      code: "custom",
      path: ["highlight_column"],
      message: `column index ${props.highlight_column} is outside ${props.columns.length} columns`,
    });
  }
  for (const [index, column] of (props.copyable_columns ?? []).entries()) {
    if (column >= props.columns.length) {
      ctx.addIssue({
        code: "custom",
        path: ["copyable_columns", index],
        message: `column index ${column} is outside ${props.columns.length} columns`,
      });
    }
  }
  if (props.key_column !== undefined && !props.columns.includes(props.key_column)) {
    ctx.addIssue({
      code: "custom",
      path: ["key_column"],
      message: `key_column "${props.key_column}" is not one of the table's columns`,
    });
  }
  if (props.rows.length === 0 && props.empty === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["rows"],
      message:
        "a table with no rows renders headers over nothing - add a row, or set empty to the sentence the reader should see instead",
    });
  }
  if (props.rows.length > 0 && props.empty !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["empty"],
      message: `empty is shown only when rows has none; this table has ${props.rows.length} rows, so drop empty or clear rows`,
    });
  }
});

export const meta = {
  name: "table",
  since: 1,
  shape: "records on shared fields",
  readerActs: true,
  description:
    "Compare aligned records or attributes on shared fields when exact lookup and side-by-side comparison matter to the reader.",
  interaction:
    "Scroll wide tables and copy marked columns; no sorting, filtering, or editing.",
  confusable_with: [
    {
      name: "decision",
      note: "decision explains alternatives and their tradeoffs; table aligns shared fields for exact comparison.",
    },
    {
      name: "facts",
      note: "facts presents named values independently; table aligns shared fields across records or attributes.",
    },
    {
      name: "chart",
      note: "chart emphasizes numerical patterns; table keeps exact values aligned for lookup and comparison.",
    },
    {
      name: "streak-grid",
      note: "streak-grid reveals daily cadence and intensity; table supports exact lookup across shared fields.",
    },
    {
      name: "grid",
      note: "grid gives a few values equal prominence; table aligns shared fields for exact comparison.",
    },
    {
      name: "comparison",
      note: "comparison stacks a before and after value per row for a phone; table keeps several shared fields aligned side by side.",
    },
    {
      name: "item-list",
      note: "item-list scans rows with one trailing value; table aligns several shared fields across records.",
    },
  ],
  example: {
    columns: ["", "TAP 1049", "Iberia 3421"],
    highlight_column: 1,
    rows: [
      {
        id: "price",
        cells: [
          "Price",
          { amount: 412, currency: "USD" },
          { amount: 389, currency: "USD" },
        ],
      },
      {
        id: "duration",
        cells: [
          "Duration",
          { value: 7.5, unit: "h" },
          { value: 11, unit: "h" },
        ],
      },
      {
        id: "stops",
        cells: ["Stops", 0, 1],
      },
    ],
  },
} as const satisfies ComponentMeta;
