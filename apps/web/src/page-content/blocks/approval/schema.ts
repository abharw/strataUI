/**
 * `approval`: a question the reader answers in the page (`decision` only displays a settled
 * call). Anyone with a link sees it; only the owner surface can answer.
 */
import * as z from "zod";

import type { ComponentMeta } from "@/page-content/types";
import { ItemIdSchema } from "@/page-content/values";
import {
  MAX_APPROVAL_CONTEXT_CHARS,
  MAX_APPROVAL_COPY_CHARS,
  MAX_CHOICE_LABEL_CHARS,
  MAX_CHOICE_QUESTION_CHARS,
} from "@/page-content/document/limits";

function authoredString(max: number, overLimit: string, field: string) {
  return z
    .string()
    .min(1)
    .max(max, overLimit)
    .refine((value) => value === value.trim(), `${field} must not begin or end with whitespace`);
}

function normalizedCopy(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export const schema = z
  .strictObject({
    /** Stable id, unique within the page; the answer is filed under it. */
    id: ItemIdSchema.describe("stable id for this question within the page"),
    question: authoredString(
      MAX_CHOICE_QUESTION_CHARS,
      `an approval asks once, in at most ${MAX_CHOICE_QUESTION_CHARS} characters; put the explanation in context`,
      "approval question",
    ),
    context: authoredString(
      MAX_APPROVAL_CONTEXT_CHARS,
      `approval context is the short explanation the person needs before the controls - ${MAX_APPROVAL_CONTEXT_CHARS} characters at most; the full account belongs in the page body or a second page`,
      "approval context",
    ).optional(),
    options: z
      .array(
        z.strictObject({
          id: ItemIdSchema,
          label: authoredString(
            MAX_CHOICE_LABEL_CHARS,
            `an approval option is a pill label, at most ${MAX_CHOICE_LABEL_CHARS} characters; put what the person needs to know in context`,
            "approval option label",
          ),
        }),
      )
      .min(2)
      .max(4)
      .describe(
        "2-4 concise choices; the renderer keeps their label-only controls together, and a label is all an option says",
      ),
  })
  .describe(`at most ${MAX_APPROVAL_COPY_CHARS} authored characters across the question, context, and option labels`)
  .superRefine((approval, ctx) => {
    const normalizedContext = approval.context === undefined
      ? undefined
      : normalizedCopy(approval.context);
    if (
      normalizedContext !== undefined
      && normalizedContext === normalizedCopy(approval.question)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["context"],
        message: "context must explain the choice, not repeat the question",
      });
    }

    const total = approval.question.length
      + (approval.context?.length ?? 0)
      + approval.options.reduce((chars, option) => chars + option.label.length, 0);
    if (total <= MAX_APPROVAL_COPY_CHARS) return;
    ctx.addIssue({
      code: "custom",
      path: [],
      message:
        `this approval carries ${total} authored characters across its question, context, and labels; those fields may carry ${MAX_APPROVAL_COPY_CHARS} total. `
        + "Keep only what the person needs to choose, state each fact once, or move the comparison into typed page content.",
    });
  });

export const meta = {
  name: "approval",
  since: 7,
  shape: "a question the reader answers",
  readerActs: true,
  description:
    "Ask the owner to choose between a few alternatives when the page needs a recorded answer.",
  interaction:
    "The owner can answer an open question once; the choice is saved. Other readers only view it.",
  confusable_with: [
    {
      name: "decision",
      note: "approval collects and saves the owner's choice; decision displays alternatives and an optional recorded recommendation.",
    },
    {
      name: "checklist",
      note: "approval collects one choice from the owner; checklist displays recorded completion without accepting ticks.",
    },
  ],
  example: {
    id: "movers",
    question: "Book the movers for the 14th?",
    context: "The quote holds until Friday, and the 14th is the only slot left before the lease starts.",
    options: [
      { id: "book", label: "Book it" },
      { id: "wait", label: "Wait for quote" },
    ],
  },
} as const satisfies ComponentMeta;
