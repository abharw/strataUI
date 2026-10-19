/**
 * `phases`: named, contiguous stages toward a date. The renderer derives the current stage and
 * days remaining from the viewer's clock. No `empty`: a block without stages is a schema error.
 */
import * as z from "zod";

import {
  MAX_PHASES_STAGES,
  MAX_PHASE_NAME_CHARS,
  MAX_PHASE_NOTE_CHARS,
  MAX_PHASE_TARGET_LABEL_CHARS,
  collectionBudgetClause,
} from "@/page-content/document/limits";
import { IsoDateSchema } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";
import { ItemIdSchema } from "@/page-content/values";

const TargetSchema = z.strictObject({
  label: z.string().min(1).max(MAX_PHASE_TARGET_LABEL_CHARS).describe(
    `what the target date means, at most ${MAX_PHASE_TARGET_LABEL_CHARS} characters`,
  ),
  at: IsoDateSchema.describe("YYYY-MM-DD"),
});

export const schema = z.strictObject({
  stages: z
    .array(
      z.strictObject({
        id: ItemIdSchema,
        name: z.string().min(1).max(MAX_PHASE_NAME_CHARS),
        start: IsoDateSchema.describe("YYYY-MM-DD; must equal the previous stage's end"),
        end: IsoDateSchema.describe("YYYY-MM-DD; must equal the next stage's start"),
        note: z.string().min(1).max(MAX_PHASE_NOTE_CHARS).optional(),
      }),
    )
    .min(1, "a phases block with no stages has nothing to derive the current stage from - add at least one stage")
    .describe(
      `at most ${MAX_PHASES_STAGES} stages, contiguous and ordered: each stage's end equals the next stage's start${collectionBudgetClause()}`,
    ),
  /** The date the whole sequence is building toward, if there is one. */
  target: TargetSchema.optional(),
}).superRefine(({ stages }, ctx) => {
  stages.forEach((stage, index) => {
    if (stage.start > stage.end) {
      ctx.addIssue({
        code: "custom",
        path: ["stages", index, "end"],
        message: `stage \"${stage.name}\" ends ${stage.end}, before it starts ${stage.start}`,
      });
    }
    const previous = stages[index - 1];
    if (previous !== undefined && previous.end !== stage.start) {
      ctx.addIssue({
        code: "custom",
        path: ["stages", index, "start"],
        message:
          `stage \"${stage.name}\" starts ${stage.start}, but \"${previous.name}\" ends ${previous.end} - stages must be `
          + "contiguous and ordered, with no gap or overlap between one stage's end and the next stage's start",
      });
    }
  });
});

export const meta = {
  name: "phases",
  since: 15,
  shape: "named stages toward a date",
  readerActs: false,
  description:
    "Follow named stretches of a plan toward a date, letting the reader see which stage is current without being told the week number.",
  interaction:
    "Display-only; the current stage and days remaining are derived from the viewer's clock, not set by the reader.",
  confusable_with: [
    {
      name: "timeline",
      note: "phases groups contiguous stretches toward a date and derives the current one; timeline follows discrete dated events or stages in order.",
    },
    {
      name: "progress",
      note: "progress measures one value against a target; phases names the stretches of time between now and a target date.",
    },
    {
      name: "checklist",
      note: "checklist tracks recorded completion of steps; phases derives the current stretch of a plan from the calendar.",
    },
  ],
  example: {
    stages: [
      { id: "base", name: "Base", start: "2026-08-01", end: "2026-09-01" },
      { id: "build", name: "Build", start: "2026-09-01", end: "2026-09-22" },
      { id: "taper", name: "Taper", start: "2026-09-22", end: "2026-10-04" },
    ],
    target: { label: "Race day", at: "2026-10-04" },
  },
} as const satisfies ComponentMeta;
