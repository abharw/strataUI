/**
 * `progress`: `current` toward `target`, both numeric typed values so the bar can label itself.
 * With `direction: "lower"` (a mile time), completion runs from `start` down to `target`, so
 * `start` is required.
 */
import * as z from "zod";

import { MAX_VALUE_LABEL_CHARS } from "@/page-content/document/limits";
import { presentation } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";
import { NumericValueSchema, TimestampSchema } from "@/page-content/values";

export const schema = z
  .strictObject({
    // Matches the write-time MAX_VALUE_LABEL_CHARS check so the manifest advertises the real limit.
    label: z.string().min(1).max(MAX_VALUE_LABEL_CHARS),
    current: NumericValueSchema.describe("the value reached so far; use the same shape and unit as target"),
    target: NumericValueSchema.describe("the value that means done; must be greater than 0"),
    target_at: TimestampSchema.describe(
      "target date: an offset-bearing ISO-8601 datetime when the minute is known, or a bare YYYY-MM-DD day when only the day is known",
    ).optional(),
    direction: z.enum(["higher", "lower"]).describe(
      "which way good runs; omit for the default higher, and use lower when a falling value is the improvement (a mile time, a backlog), which requires start",
    ).optional(),
    start: NumericValueSchema.describe(
      "where the value started, in the same shape and unit as current; required when direction is lower, because completion is measured from start down toward target",
    ).optional(),
    presentation: presentation(["bar", "ring"]),
  })
  .superRefine((props, ctx) => {
    // Mirrors numericAmount in ../../format; kept local so the schema layer never imports it.
    const amount = (value: unknown): number | null => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (value !== null && typeof value === "object") {
        const object = value as Record<string, unknown>;
        if (typeof object.value === "number" && Number.isFinite(object.value)) return object.value;
        if (typeof object.amount === "number" && Number.isFinite(object.amount)) return object.amount;
      }
      return null;
    };
    if (props.direction === "lower" && props.start === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["start"],
        message:
          "direction is \"lower\", so completion is how far current has come down from start toward target - give the start it came down from, or drop direction if higher is better",
      });
    }
    const target = amount(props.target);
    if (target !== null && target <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: `target is ${target}; a target of ${target} measures nothing - if there is no target, this is a metric`,
      });
    }
  });

export const meta = {
  name: "progress",
  since: 1,
  shape: "one value against a target",
  readerActs: false,
  description:
    "Judge how far a measured value has advanced toward a real target and any source-backed deadline. When lower is better - a mile time, a backlog - set direction:\"lower\" with the start it is coming down from.",
  interaction:
    "Display-only; readers cannot adjust the value or mark the target complete.",
  confusable_with: [
    {
      name: "metric",
      note: "metric emphasizes one value; progress measures a current value against a target.",
    },
    {
      name: "streak-grid",
      note: "progress compares a value with a target; streak-grid reveals activity cadence and intensity by day.",
    },
    {
      name: "breakdown",
      note: "progress measures one value against a target; breakdown splits one whole into several named parts.",
    },
    {
      name: "phases",
      note: "progress measures one value against a target; phases names the stretches of time between now and a target date.",
    },
  ],
  example: {
    label: "Weekly volume",
    current: { value: 8.5, unit: "h" },
    target: { value: 11, unit: "h" },
    target_at: "2026-08-30",
  },
} as const satisfies ComponentMeta;
