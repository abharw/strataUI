/**
 * `checklist`: plan steps with display-only boxes. The agent sets `done` by rewriting the page;
 * the reader cannot tick a box.
 */
import * as z from "zod";

import { MAX_CHECKLIST_LABEL_CHARS, collectionBudgetClause } from "@/page-content/document/limits";
import { EmptySchema, LinkSchema } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";
import { ItemIdSchema, TimestampSchema } from "@/page-content/values";

export const schema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: ItemIdSchema,
        label: z.string().min(1).max(MAX_CHECKLIST_LABEL_CHARS),
        done: z
          .boolean()
          .default(false)
          .describe("true once the step is finished; defaults to false"),
        due_at: TimestampSchema.describe(
          "deadline for this step: an offset-bearing ISO-8601 datetime when the minute is known, or a bare YYYY-MM-DD day when only the day is known",
        ).optional(),
        /**
         * Where the step is carried out. Links the label, not the row: the checkbox reports state,
         * so it should not be tappable.
         */
        link: LinkSchema.optional(),
      }),
    )
    .describe(`the plan's steps; items may be empty only when empty is set${collectionBudgetClause()}`),
  empty: EmptySchema.describe("shown when items has none; items may be empty only when empty is set").optional(),
}).superRefine((props, ctx) => {
  if (props.items.length === 0 && props.empty === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["items"],
      message:
        "a checklist with no items renders an empty shell - add a step, or set empty to the sentence the reader should see instead",
    });
  }
  if (props.items.length > 0 && props.empty !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["empty"],
      message: `empty is shown only when items has none; this checklist has ${props.items.length} items, so drop empty or clear items`,
    });
  }
});

export const meta = {
  name: "checklist",
  since: 1,
  shape: "a finite set of steps",
  readerActs: true,
  description:
    "Follow a finite set of steps and review their recorded completion, keeping each step and its deadline together.",
  interaction:
    "Tap a linked step's label; the box records completion and cannot be ticked from the page.",
  confusable_with: [
    {
      name: "approval",
      note: "approval collects one choice from the owner; checklist displays recorded completion without accepting ticks.",
    },
    {
      name: "decision",
      note: "checklist displays steps to carry out; decision presents alternatives to weigh, without collecting a choice.",
    },
    {
      name: "status-list",
      note: "checklist displays binary completion; status-list displays multiple states, ownership, and wait direction.",
    },
    {
      name: "timeline",
      note: "checklist emphasizes recorded completion; timeline emphasizes the order in which events or stages occur.",
    },
    {
      name: "phases",
      note: "checklist tracks recorded completion of steps; phases derives the current stretch of a plan from the calendar.",
    },
  ],
  example: {
    items: [
      { id: "w1-swim", label: "Swim 2 × 1,200 m", done: true },
      { id: "w1-bike", label: "Bike 2 × 32 km", done: false, due_at: "2026-08-25" },
    ],
  },
} as const satisfies ComponentMeta;
