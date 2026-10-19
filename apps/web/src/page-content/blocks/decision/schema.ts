/**
 * `decision`: a call laid out as a question, the options with their tradeoffs, and the answer
 * when there is one. Display-only; `approval` collects an answer.
 */
import * as z from "zod";

import type { ComponentMeta } from "@/page-content/types";
import { ItemIdSchema } from "@/page-content/values";
import {
  MAX_CHOICE_LABEL_CHARS,
  MAX_CHOICE_QUESTION_CHARS,
  MAX_RATIONALE_CHARS,
  MAX_TRADEOFF_CHARS,
} from "@/page-content/document/limits";

function authoredString(max: number, overLimit: string, field: string) {
  return z
    .string()
    .min(1)
    .max(max, overLimit)
    .refine((value) => value === value.trim(), `${field} must not begin or end with whitespace`);
}

export const schema = z
  .strictObject({
    /** The call being made, phrased as a question. */
    question: authoredString(
      MAX_CHOICE_QUESTION_CHARS,
      `a decision question is at most ${MAX_CHOICE_QUESTION_CHARS} characters`,
      "decision question",
    ),
    options: z
      .array(
        z.strictObject({
          id: ItemIdSchema,
          /** The option, named the way the reader would say it. */
          label: authoredString(
            MAX_CHOICE_LABEL_CHARS,
            `a decision option label is at most ${MAX_CHOICE_LABEL_CHARS} characters`,
            "decision option label",
          ),
          /** What this option costs or buys: the reason it is not obvious. */
          tradeoff: authoredString(
            MAX_TRADEOFF_CHARS,
            `a decision tradeoff is at most ${MAX_TRADEOFF_CHARS} characters`,
            "decision tradeoff",
          ).optional(),
        }),
      )
      .min(2)
      .max(4)
      .describe("2-4 alternatives whose ids remain stable while the decision is open"),
    chosen_id: ItemIdSchema.describe(
      "the id of one of the listed options; omit while the decision is open, and setting it requires rationale",
    ).optional(),
    /** Why the chosen option won, or what the decision waits on. Required once settled. */
    rationale: authoredString(
      MAX_RATIONALE_CHARS,
      `a decision rationale is at most ${MAX_RATIONALE_CHARS} characters`,
      "decision rationale",
    )
      .describe("why the chosen option won, or - while the call is open - what it is waiting on")
      .optional(),
  })
  .superRefine((decision, ctx) => {
    if (
      decision.chosen_id !== undefined &&
      !decision.options.some((option) => option.id === decision.chosen_id)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["chosen_id"],
        message: "chosen_id must name one of the listed options",
      });
    }
    if (decision.chosen_id !== undefined && decision.rationale === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["rationale"],
        message:
          "a settled decision needs its reason - set rationale to why the chosen option won; if the call is still "
          + "open, omit chosen_id and use rationale for what it is waiting on",
      });
    }
  });

export const meta = {
  name: "decision",
  since: 5,
  shape: "alternatives and their tradeoffs",
  readerActs: false,
  description:
    "Weigh a small set of alternatives and understand an open or settled recommendation with its tradeoffs and rationale.",
  interaction:
    "Display-only; readers cannot select an option or record an answer here.",
  confusable_with: [
    {
      name: "approval",
      note: "approval collects and saves the owner's choice; decision displays alternatives and an optional recorded recommendation.",
    },
    {
      name: "table",
      note: "decision explains alternatives and their tradeoffs; table aligns shared fields for exact comparison.",
    },
    {
      name: "status-list",
      note: "decision presents one question with alternatives; status-list tracks independently owned open work.",
    },
    {
      name: "checklist",
      note: "checklist displays steps to carry out; decision presents alternatives to weigh, without collecting a choice.",
    },
    {
      name: "comparison",
      note: "decision weighs alternatives that have not happened yet; comparison shows what already changed on named attributes.",
    },
  ],
  example: {
    question: "Ship the render rule in the guide, or in llms.txt too?",
    options: [
      { id: "guide", label: "Guide only", tradeoff: "One place to maintain; agents that never fetch the guide miss it." },
      { id: "both", label: "Guide and llms.txt", tradeoff: "Reaches the first read; two copies to keep in step." },
    ],
    chosen_id: "both",
    rationale: "llms.txt is what a new agent reads first, so the rule has to be there.",
  },
} as const satisfies ComponentMeta;
