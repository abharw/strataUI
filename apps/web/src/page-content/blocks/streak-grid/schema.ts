/**
 * `streak-grid`: date-keyed cells for a habit or contribution grid, with today marked. Cells have
 * no `id`; `date` is the natural key and must be unique.
 */
import * as z from "zod";

import { collectionBudgetClause } from "@/page-content/document/limits";
import { EmptySchema, IsoDateSchema } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";
import { MAX_STREAK_SPAN_DAYS, MIN_STREAK_WINDOW_DAYS } from "./limits";

function utcDayNumber(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function isoFromDayNumber(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

export const schema = z.strictObject({
  cells: z
    .array(
      z.strictObject({
        date: IsoDateSchema.describe("YYYY-MM-DD; one cell per day, and the cell's identity"),
        /**
         * Intensity for the day. 0 records no activity; an absent date is an
         * unobserved day, including gaps between the earliest and latest dates.
         */
        value: z
          .number()
          .nonnegative()
          .describe("non-negative intensity for that day; 0 records no activity, an absent date has no observation"),
      }),
    )
    // No `.max()`: unique dates plus the span check bound the array (see `./limits`). The span is
    // server-enforced and absent from the emitted JSON Schema, so the description states it.
    .describe(
      `one cell per date, each date once: at most ${MAX_STREAK_SPAN_DAYS} cells spanning at most ${MAX_STREAK_SPAN_DAYS} days from the earliest to the latest. Cells may be empty only when empty is set${collectionBudgetClause()}`,
    ),
  /**
   * "The last N days": the renderer draws the whole window and `cells` may be sparse, with a
   * missing day meaning unobserved. Omitted, the window is the span of the cells.
   */
  days: z
    .int()
    .min(MIN_STREAK_WINDOW_DAYS)
    .max(MAX_STREAK_SPAN_DAYS)
    .describe(
      `draw a fixed window of the last N days (${MIN_STREAK_WINDOW_DAYS}-${MAX_STREAK_SPAN_DAYS}) ending at end, so cells may name only the days with activity; omit it to let the cells describe their own range`,
    )
    .optional(),
  /**
   * Last day of the window. Omitted, it is the reader's today, so "the last 30 days" stays true
   * without a rewrite. Set it for a fixed window such as a finished season.
   */
  end: IsoDateSchema.describe(
    "YYYY-MM-DD, the last day of the days window; omit it and the window ends on the reader's own today",
  ).optional(),
  empty: EmptySchema.describe("shown when cells has none; cells may be empty only when empty is set").optional(),
}).superRefine(({ cells, days, end, empty }, context) => {
  const dates = cells.map((cell) => cell.date).sort();
  const duplicate = dates.find((date, index) => index > 0 && date === dates[index - 1]);
  if (duplicate !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["cells"],
      message: `date ${duplicate} appears more than once`,
    });
  }

  if (dates.length > 1) {
    const span = utcDayNumber(dates[dates.length - 1]) - utcDayNumber(dates[0]) + 1;
    if (span > MAX_STREAK_SPAN_DAYS) {
      context.addIssue({
        code: "custom",
        path: ["cells"],
        message: `date range must span at most ${MAX_STREAK_SPAN_DAYS} days`,
      });
    }
  }
  // `end` without `days` names nothing; refused rather than ignored so the author knows.
  if (end !== undefined && days === undefined) {
    context.addIssue({
      code: "custom",
      path: ["end"],
      message: "end is the last day of the days window; set days as well, or drop end and let the cells describe their own range",
    });
  }

  // Every cell must fall inside the drawn window, and the error names both ends. Without `end`
  // the window floats on the reader's clock, so only its width is checked.
  if (days !== undefined && dates.length > 0) {
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (end === undefined) {
      const span = utcDayNumber(last) - utcDayNumber(first) + 1;
      if (span > days) {
        context.addIssue({
          code: "custom",
          path: ["cells"],
          message:
            `days ${days} draws a ${days}-day window ending on the reader's today, and these cells span ${span} days `
            + `(${first} to ${last}) - widen days, drop the cells outside it, or set end to the day the window closes`,
        });
      }
    } else {
      const windowStart = isoFromDayNumber(utcDayNumber(end) - (days - 1));
      const outside = dates.find((date) => date < windowStart || date > end);
      if (outside !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["cells"],
          message:
            `days ${days} ending ${end} draws ${windowStart} to ${end}, and ${outside} is outside that window - `
            + "widen days, move end, or drop the cell",
        });
      }
    }
  }

  if (cells.length === 0 && empty === undefined) {
    context.addIssue({
      code: "custom",
      path: ["cells"],
      message:
        "a streak-grid with no cells renders an empty shell - add a recorded day, or set empty to the sentence the reader should see instead",
    });
  }
  if (cells.length > 0 && empty !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["empty"],
      message: `empty is shown only when cells has none; this streak-grid has ${cells.length} cells, so drop empty or clear cells`,
    });
  }
});

export const meta = {
  name: "streak-grid",
  since: 1,
  shape: "daily activity by calendar position",
  readerActs: true,
  description:
    "Inspect daily activity patterns through calendar position and relative intensity when cadence or consistency matters more than precise comparison. Optional days (7-371) draws a last-N-days window ending on the reader's today, or on end, from cells that name only active days.",
  interaction:
    "Scroll the calendar locally; cells are display-only and cannot record activity.",
  confusable_with: [
    {
      name: "progress",
      note: "progress compares a value with a target; streak-grid reveals activity cadence and intensity by day.",
    },
    {
      name: "chart",
      note: "chart plots magnitudes over labels; streak-grid shows daily activity through calendar position and relative intensity.",
    },
    {
      name: "table",
      note: "streak-grid reveals daily cadence and intensity; table supports exact lookup across shared fields.",
    },
  ],
  example: {
    cells: [
      { date: "2026-08-19", value: 1 },
      { date: "2026-08-20", value: 0 },
      { date: "2026-08-21", value: 2 },
    ],
  },
} as const satisfies ComponentMeta;
