/**
 * `status-list`: a queue or triage list with a status badge, owner and since, in one linear
 * reading order. Unknown statuses render with neutral chrome, so adding statuses is safe.
 */
import * as z from "zod";

import {
  MAX_NOTE_CHARS,
  collectionBudgetClause,
} from "@/page-content/document/limits";
import { EmptySchema } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";
import {
  ItemIdSchema,
  PARTIAL_TIMESTAMP_NOTE,
  PartialTimestampSchema,
  TimestampSchema,
} from "@/page-content/values";

export const schema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: ItemIdSchema,
        label: z.string().min(1),
        /** The item's state; the wait states say whose move it is. */
        status: z
          .enum([
            "not-started",
            "in-progress",
            "waiting-on-you",
            "waiting-on-them",
            "blocked",
            "at-risk",
            "cancelled",
            "done",
          ])
          .describe(
            "not-started = nothing has happened yet; in-progress = underway and nobody is waiting; "
            + "waiting-on-you = the reader owes the next move; waiting-on-them = someone else does; "
            + "blocked = neither can move yet; at-risk = still moving but the date or outcome is in doubt; "
            + "cancelled = dropped rather than finished; done = closed. Prefer a wait state when the item is "
            + "stalled on a named person, and in-progress when the work itself is the answer",
          ),
        /** The person or org holding it. Required when the status is `waiting-on-them`. */
        owner: z
          .string()
          .trim()
          .min(1)
          .describe("the person or org holding it; required when the status is waiting-on-them")
          .optional(),
        /**
         * When it entered this state, at the precision actually known; never invent a minute
         * or a day to get a more specific rendering.
         */
        since: PartialTimestampSchema.describe(
          `when it entered this state, ${PARTIAL_TIMESTAMP_NOTE}. An offset-bearing datetime renders relatively ("6 days ago"); a day renders as "since <day>"; a year or year-month renders as itself`,
        ).optional(),
        due_at: TimestampSchema.describe(
          "deadline for this item: an offset-bearing ISO-8601 datetime when the minute is known, or a bare YYYY-MM-DD day when only the day is known",
        ).optional(),
        next_check_at: TimestampSchema.describe(
          "when to check this item again: an offset-bearing ISO-8601 datetime when the minute is known, or a bare YYYY-MM-DD day when only the day is known",
        ).optional(),
        /** One line of detail: what was said, what unblocks it. */
        // Matches the write-time MAX_NOTE_CHARS check so the manifest advertises the real limit.
        note: z.string().min(1).max(MAX_NOTE_CHARS).optional(),
      }),
    )
    .describe(`the open loops; items may be empty only when empty is set${collectionBudgetClause()}`),
  empty: EmptySchema.describe("shown when items has none; items may be empty only when empty is set").optional(),
}).superRefine((props, ctx) => {
  for (const [index, item] of props.items.entries()) {
    if (item.status === "waiting-on-them" && item.owner === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["items", index, "owner"],
        message:
          "owner is required when status is waiting-on-them - name the person or org holding it, or the wait has "
          + "no one to chase",
      });
    }
  }
  if (props.items.length === 0 && props.empty === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["items"],
      message:
        "a status-list with no items renders an empty shell - add the open loop, or set empty to the sentence the reader should see instead",
    });
  }
  if (props.items.length > 0 && props.empty !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["empty"],
      message: `empty is shown only when items has none; this status-list has ${props.items.length} items, so drop empty or clear items`,
    });
  }
});

export const meta = {
  name: "status-list",
  since: 1,
  shape: "an open-work queue",
  readerActs: false,
  description:
    "Review open work by its current state, ownership, and waiting time to understand what needs attention next.",
  interaction:
    "Display-only; statuses, owners, and follow-up dates are set by agent writes.",
  confusable_with: [
    {
      name: "decision",
      note: "decision presents one question with alternatives; status-list tracks independently owned open work.",
    },
    {
      name: "checklist",
      note: "checklist displays binary completion; status-list displays multiple states, ownership, and wait direction.",
    },
    {
      name: "timeline",
      note: "status-list tracks independently owned open work; timeline orders related events or stages.",
    },
    {
      name: "item-list",
      note: "item-list is a general row-with-a-value list; status-list is specifically owned open work with a state, owner, and wait time.",
    },
  ],
  example: {
    items: [
      {
        id: "bike-fit",
        label: "Bike fit at Ride Studio",
        status: "waiting-on-them",
        owner: "Ride Studio",
        since: "2026-08-18",
        next_check_at: "2026-08-25",
      },
    ],
  },
} as const satisfies ComponentMeta;
