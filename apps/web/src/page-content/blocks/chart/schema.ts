/**
 * `chart`: values over shared labels. Series-oriented because strict structured-output modes forbid
 * model-chosen object keys; a series is keyed by `name`, which is also its legend label.
 */
import * as z from "zod";

import { collectionBudgetClause } from "@/page-content/document/limits";
import { EmptySchema, IsoDateSchema, IsoDateTimeSchema, presentation } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";

/** Beyond this many series the lines become hard to follow. */
const MAX_SERIES = 5;

/** A label that would format as a date on a time axis. */
function isIsoDateLabel(label: string): boolean {
  return IsoDateSchema.safeParse(label).success || IsoDateTimeSchema.safeParse(label).success;
}

const XAxisSchema = z.strictObject({
  kind: z.enum(["category", "time"]).describe(
    "category for distinct groups (the default reading when x is omitted), time when every label is an ISO date the axis should format",
  ),
});

export const schema = z.strictObject({
  /** The x axis, shared by every series: one label per point, in order. */
  labels: z
    .array(z.string())
    .describe(`x-axis labels in order; every series has one value per label. May be empty only when empty is set${collectionBudgetClause()}`),
  series: z
    .array(
      z.strictObject({
        /** Legend label, and the series' identity across updates. */
        name: z.string().min(1),
        values: z.array(z.number()).describe("one number per label, same order as labels"),
      }),
    )
    .max(MAX_SERIES, `a chart supports at most ${MAX_SERIES} series`)
    // `maxItems` is stripped from the emitted JSON Schema (Anthropic rejects it) and refinements
    // never reach it, so this text is how the model learns the cap and the superRefine rules.
    .describe(
      `at most ${MAX_SERIES} series, each with a distinct name and one value per label. May be empty only when empty is set${collectionBudgetClause()}`,
    ),
  y_label: z.string().min(1).describe("what the y axis measures, e.g. \"hours\"").optional(),
  /** Pin the axis floor without excluding any observed value. Line and area only. */
  y_min: z
    .number()
    .describe(
      "optional axis floor for line and area; it must not exceed the lowest observed value. A bar presentation's floor is fixed at the smaller of 0 and the lowest value because bar length encodes value, so y_min is accepted and ignored there",
    )
    .optional(),
  y_max: z.number().describe("optional axis ceiling; it must not be below the highest observed value").optional(),
  x: XAxisSchema.describe("omit for an ordinary category axis; set kind to time when every label must parse as an ISO-8601 date").optional(),
  /** How multiple series relate to each other. Ignored with one series. */
  stack: z.enum(["none", "stacked", "percent"]).default("none").describe(
    "none keeps series independent (the default); stacked sums them; percent normalizes the stack to 100%",
  ),
  show_values: z.boolean().describe("true to print each point or bar's exact value; false leaves them to the tooltip").optional(),
  presentation: presentation(["line", "bar", "area", "bar-horizontal"]),
  empty: EmptySchema.describe("shown when labels and series have none; they may be empty only when empty is set").optional(),
}).superRefine((props, ctx) => {
  const names = new Set<string>();
  for (const [index, item] of props.series.entries()) {
    if (names.has(item.name)) {
      ctx.addIssue({
        code: "custom",
        path: ["series", index, "name"],
        message: `series name \"${item.name}\" is duplicated`,
      });
    }
    names.add(item.name);
    if (item.values.length !== props.labels.length) {
      ctx.addIssue({
        code: "custom",
        path: ["series", index, "values"],
        message: `expected ${props.labels.length} values, one for each label`,
      });
    }
  }
  if (props.x?.kind === "time") {
    for (const [index, label] of props.labels.entries()) {
      if (!isIsoDateLabel(label)) {
        ctx.addIssue({
          code: "custom",
          path: ["labels", index],
          message: `label \"${label}\" must parse as an ISO-8601 date or datetime because x.kind is "time"`,
        });
      }
    }
  }
  // Bars ignore `y_min` (bar length encodes value), so these rules only apply to presentations
  // that read it. A null presentation is held to the non-bar reading.
  const readsFloor = props.presentation !== "bar" && props.presentation !== "bar-horizontal";
  if (readsFloor && props.y_min !== undefined && props.y_max !== undefined && props.y_min >= props.y_max) {
    ctx.addIssue({
      code: "custom",
      path: ["y_max"],
      message: "y_max must be greater than y_min",
    });
  }
  const observed = props.series.flatMap((item) => item.values);
  if (observed.length > 0) {
    const observedMin = Math.min(...observed);
    const observedMax = Math.max(...observed);
    if (readsFloor && props.y_min !== undefined && props.y_min > observedMin) {
      ctx.addIssue({
        code: "custom",
        path: ["y_min"],
        message: `y_min ${props.y_min} excludes the observed minimum ${observedMin}; omit it or choose a floor at or below every plotted value`,
      });
    }
    if (props.y_max !== undefined && props.y_max < observedMax) {
      ctx.addIssue({
        code: "custom",
        path: ["y_max"],
        message: `y_max ${props.y_max} excludes the observed maximum ${observedMax}; omit it or choose a ceiling at or above every plotted value`,
      });
    }
  }

  const hasData = props.labels.length > 0 || props.series.length > 0;
  if (!hasData && props.empty === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["labels"],
      message:
        "a chart with no data renders an empty shell - add labels and series, or set empty to the sentence the reader should see instead",
    });
  }
  if (hasData && props.empty !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["empty"],
      message: "empty is shown only when labels and series have none; this chart has data, so drop empty or clear labels and series",
    });
  }
});

export const meta = {
  name: "chart",
  since: 1,
  shape: "values over shared labels",
  readerActs: true,
  description:
    "Compare quantities or inspect patterns across shared labels when relative magnitude or change is the reader's main question.",
  interaction:
    "Inspect tooltips or expand the exact data locally; the chart cannot filter or edit values.",
  confusable_with: [
    {
      name: "table",
      note: "chart emphasizes numerical patterns; table keeps exact values aligned for lookup and comparison.",
    },
    {
      name: "streak-grid",
      note: "chart plots magnitudes over labels; streak-grid shows daily activity through calendar position and relative intensity.",
    },
    {
      name: "breakdown",
      note: "chart compares values over shared labels; breakdown shows parts of one whole.",
    },
  ],
  example: {
    labels: ["Week 1", "Week 2", "Week 3"],
    series: [{ name: "Actual", values: [6.2, 7.4, 8.5] }],
    y_label: "hours",
    presentation: "bar",
  },
} as const satisfies ComponentMeta;
