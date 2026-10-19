/**
 * `breakdown`: how one whole splits into named parts. Shares `chart`'s data disclosure and
 * container, and is a lazy boundary because recharts measures the viewport before drawing.
 */
import * as z from "zod";

import {
  MAX_BREAKDOWN_LABEL_CHARS,
  MAX_BREAKDOWN_PARTS,
  MAX_BREAKDOWN_TOTAL_LABEL_CHARS,
  MAX_UNIT_CHARS,
  collectionBudgetClause,
} from "@/page-content/document/limits";
import { EmptySchema, presentation } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";
import { ItemIdSchema } from "@/page-content/values";

export const schema = z.strictObject({
  parts: z
    .array(
      z.strictObject({
        id: ItemIdSchema,
        label: z.string().min(1).max(MAX_BREAKDOWN_LABEL_CHARS),
        value: z.number().finite().nonnegative(),
      }),
    )
    .describe(`up to ${MAX_BREAKDOWN_PARTS} parts of one whole; parts may be empty only when empty is set${collectionBudgetClause()}`),
  unit: z.string().trim().min(1).max(MAX_UNIT_CHARS).describe("what value measures, e.g. \"hours\"").optional(),
  total_label: z.string().min(1).max(MAX_BREAKDOWN_TOTAL_LABEL_CHARS).describe(
    "the donut's centre text; when present the renderer shows the sum of parts there",
  ).optional(),
  /** Device default: donut when total_label is set or parts <= 5, bars otherwise. */
  presentation: presentation(["donut", "pie", "bars", "radial"]),
  empty: EmptySchema.describe("shown when parts has none; parts may be empty only when empty is set").optional(),
}).superRefine((props, ctx) => {
  if (props.parts.length === 0 && props.empty === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["parts"],
      message:
        "a breakdown with no parts renders an empty shell - add a part, or set empty to the sentence the reader should see instead",
    });
  }
  if (props.parts.length > 0 && props.empty !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["empty"],
      message: `empty is shown only when parts has none; this breakdown has ${props.parts.length} parts, so drop empty or clear parts`,
    });
  }
});

export const meta = {
  name: "breakdown",
  since: 15,
  shape: "parts of a whole",
  readerActs: true,
  description:
    "Show how one whole splits into its named parts when the reader's question is composition, not change over labels.",
  interaction:
    "Inspect tooltips or expand the exact data locally; the breakdown cannot filter or edit values.",
  confusable_with: [
    {
      name: "chart",
      note: "breakdown shows parts of one whole; chart compares values over shared labels.",
    },
    {
      name: "progress",
      note: "progress measures one value against a target; breakdown splits one whole into several named parts.",
    },
  ],
  example: {
    parts: [
      { id: "swim", label: "Swim", value: 1.5 },
      { id: "bike", label: "Bike", value: 6 },
      { id: "run", label: "Run", value: 2.5 },
    ],
    unit: "h",
  },
} as const satisfies ComponentMeta;
