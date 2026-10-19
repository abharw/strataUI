/**
 * `metric`: one display value. Offset-bearing datetimes render relatively; date-only values stay
 * exact days. `change` is coloured by `polarity`, and `trend` discloses its exact values.
 */
import * as z from "zod";

import {
  MAX_METRIC_ABSOLUTE_VALUE,
  MAX_METRIC_CHANGE_VALUE_CHARS,
  MAX_METRIC_TREND_POINTS,
  MAX_METRIC_VALUE_CHARS,
  MAX_UNIT_CHARS,
  MAX_VALUE_LABEL_CHARS,
} from "@/page-content/document/limits";
import { MoneySchema, QuantitySchema } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";

const MetricNumberSchema = z.number().finite()
  .min(-MAX_METRIC_ABSOLUTE_VALUE)
  .max(MAX_METRIC_ABSOLUTE_VALUE);

/*
 * The canonical typed shapes, narrowed so a figure fits on a phone. Extending them keeps the
 * ISO 4217 rule and its message in one place.
 */
const MetricQuantitySchema = QuantitySchema.extend({
  value: MetricNumberSchema,
  unit: z.string().trim().min(1).max(MAX_UNIT_CHARS).optional(),
});

const MetricMoneySchema = MoneySchema.extend({ amount: MetricNumberSchema });

const MetricValueSchema = z.union([
  MetricQuantitySchema,
  MetricMoneySchema,
  z.string().trim().min(1).max(MAX_METRIC_VALUE_CHARS),
  MetricNumberSchema,
  z.boolean(),
], {
  // Without a custom error, every miss is refused with only "Invalid input".
  error: `a metric value is a quantity {value, unit}, money {amount, currency}, or a plain string, number or `
    + `boolean. Money needs both fields, and currency is an ISO 4217 code like USD; an ISO-8601 date or datetime `
    + `goes in as the plain string, which the metric formats for the reader. Text is at most `
    + `${MAX_METRIC_VALUE_CHARS} characters, a unit at most ${MAX_UNIT_CHARS}, and a raw figure at most `
    + `${MAX_METRIC_ABSOLUTE_VALUE}.`,
});

/** The delta since whatever the reader last saw, and whether that is good news. */
const ChangeSchema = z.strictObject({
  value: z.union([MetricNumberSchema, z.string().trim().min(1).max(MAX_METRIC_CHANGE_VALUE_CHARS)]).describe(
    `the delta: a number, or a short string at most ${MAX_METRIC_CHANGE_VALUE_CHARS} characters such as "+3"`,
  ),
  direction: z.enum(["up", "down", "flat"]).describe("which way the value moved"),
  /**
   * What the move means. Colour follows polarity, not direction: a falling pace and a falling
   * expense move the same way and mean opposite things.
   */
  polarity: z.enum(["good", "bad", "neutral"]).describe(
    "what the move means for the reader; omit only when the move is neither good nor bad news",
  ).optional(),
});

export const schema = z.strictObject({
  // Matches the write-time MAX_VALUE_LABEL_CHARS check so the manifest advertises the real limit.
  label: z.string().min(1).max(MAX_VALUE_LABEL_CHARS),
  value: MetricValueSchema.describe(
    `the figure: a typed value like {value,unit} or {amount,currency}, an ISO date, or a plain scalar; offset-bearing datetimes render relatively and date-only values stay exact days. Text is at most ${MAX_METRIC_VALUE_CHARS} characters, units ${MAX_UNIT_CHARS}, and raw figures ${MAX_METRIC_ABSOLUTE_VALUE}`,
  ),
  /** The move since whatever the reader last saw, when the source supports one. */
  change: ChangeSchema.optional(),
  /** Exact values for a sparkline; also disclosed as text, as `chart` does. */
  trend: z
    .array(z.number().finite())
    .min(1)
    .max(MAX_METRIC_TREND_POINTS)
    .describe(`up to ${MAX_METRIC_TREND_POINTS} finite values, oldest first, rendered as a sparkline beside the value`)
    .optional(),
});

export const meta = {
  name: "metric",
  since: 15,
  shape: "one value",
  readerActs: false,
  description:
    "Glance at one important labelled value, such as a quantity, amount, date, or short state. A value that is an offset-bearing ISO datetime renders relatively - a countdown, or \"3 days ago\" - while a date-only value stays a fixed day. Optional change is a delta with direction and polarity (\"+12 vs yesterday\") and trend a sparkline of recent values.",
  interaction:
    "Display-only; readers see the formatted value without editing controls.",
  confusable_with: [
    {
      name: "progress",
      note: "metric emphasizes one value; progress measures a current value against a target.",
    },
    {
      name: "callout",
      note: "callout emphasizes a sentence of context; metric gives one labelled scalar value visual prominence.",
    },
  ],
  example: {
    label: "Hours this week",
    value: { value: 8.5, unit: "h" },
  },
} as const satisfies ComponentMeta;
