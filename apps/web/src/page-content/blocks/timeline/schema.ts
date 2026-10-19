/**
 * `timeline`: one ordered sequence. `order` owns sorting; `at` carries the date at the precision
 * the source establishes, and `time` a local wall-clock time. Both may be omitted.
 */
import * as z from "zod";

import {
  MAX_NOTE_CHARS,
  collectionBudgetClause,
} from "@/page-content/document/limits";
import { EmptySchema, IsoDateTimeSchema, LinkSchema } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";
import {
  ItemIdSchema,
  PARTIAL_TIMESTAMP_NOTE,
  PartialTimestampSchema,
  TimeOfDaySchema,
} from "@/page-content/values";

/** An exact instant: the one `at` form that already carries its own time of day. */
function isExactInstant(at: string | undefined): boolean {
  return at !== undefined && IsoDateTimeSchema.safeParse(at).success;
}

const TimelineOrderSchema = z.enum([
  "ascending",
  "descending",
  "as-provided",
]);

const EventSchema = z
  .strictObject({
    id: ItemIdSchema,
    /**
     * When it happened, at the source's precision. Partial ISO forms ("2019", "2019-06") sort
     * correctly against fuller ones, so no day is invented.
     */
    at: PartialTimestampSchema.describe(
      `when it happened, ${PARTIAL_TIMESTAMP_NOTE}; omit only when the sequence is intentionally undated`,
    ).optional(),
    /** Source-local wall-clock time. A full datetime in `at` already owns its time. */
    time: TimeOfDaySchema.describe(
      "HH:MM local wall-clock time; use with a date-only at, or alone when the surrounding page already establishes the day",
    ).optional(),
    title: z.string().min(1),
    // Matches the write-time MAX_NOTE_CHARS check so the manifest advertises the real limit.
    note: z.string().min(1).max(MAX_NOTE_CHARS).optional(),
    /** Where it happens: a venue, terminal, or address. */
    place: z.string().min(1).optional(),
    /** Booking reference, flight number, or short code needed there. */
    ref: z.string().min(1).optional(),
    /** Where tapping this event goes - another Strata page or an external destination. */
    link: LinkSchema.optional(),
  })
  .superRefine((event, ctx) => {
    // Only a full datetime conflicts with `time`; a date, year-month or year does not.
    if (isExactInstant(event.at) && event.time !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["time"],
        message:
          "a full datetime in at already contains the event time; remove time, or use a date-only at with the source-local wall-clock time",
      });
    }
  });

export const schema = z
  .strictObject({
    // Defaulted rather than required; `.default` also puts the fallback in the emitted JSON Schema.
    order: TimelineOrderSchema.default("ascending").describe(
      "reading direction; defaults to ascending. descending for a newest-first history, as-provided when the source order is meaningful or the events are undated",
    ),
    events: z
      .array(EventSchema)
      .describe(
        `the events in the order given; unless order is as-provided, every event needs at or time, and the whole timeline uses one time form. Events may be empty only when empty is set${collectionBudgetClause()}`,
      ),
    empty: EmptySchema.describe("shown when events has none; events may be empty only when empty is set").optional(),
  })
  .superRefine(({ events, order, empty }, ctx) => {
    if (events.length === 0 && empty === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["events"],
        message:
          "a timeline with no events renders an empty shell - add the next point, or set empty to the sentence the reader should see instead",
      });
    }
    if (events.length > 0 && empty !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["empty"],
        message: `empty is shown only when events has none; this timeline has ${events.length} events, so drop empty or clear events`,
      });
    }
    if (order === "as-provided") return;

    events.forEach((event, index) => {
      if (event.at === undefined && event.time === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["events", index],
          message:
            "ascending and descending timelines need at or time on every event; use as-provided for an undated sequence",
        });
      }
    });

    const hasDatedEvents = events.some((event) => event.at !== undefined);
    const hasTimeOnlyEvents = events.some(
      (event) => event.at === undefined && event.time !== undefined,
    );
    if (hasDatedEvents && hasTimeOnlyEvents) {
      ctx.addIssue({
        code: "custom",
        path: ["events"],
        message:
          "a sorted timeline cannot compare date-bound events with time-only events; add the dates, or use as-provided",
      });
    }

    const hasExactInstants = events.some((event) => isExactInstant(event.at));
    const hasLocalTimes = events.some((event) => event.time !== undefined);
    if (hasExactInstants && hasLocalTimes) {
      ctx.addIssue({
        code: "custom",
        path: ["events"],
        message:
          "a sorted timeline cannot mix exact offset-bearing instants with separate local wall-clock times; use one time form, or use as-provided",
      });
    }
  });

export const meta = {
  name: "timeline",
  since: 1,
  shape: "an ordered sequence",
  readerActs: true,
  description:
    "Follow an ordered sequence of events or stages, preserving only the dates and times the source establishes.",
  interaction:
    "Tap a linked event to open its destination; the sequence itself cannot be rescheduled or completed from the page.",
  confusable_with: [
    {
      name: "status-list",
      note: "status-list tracks independently owned open work; timeline orders related events or stages.",
    },
    {
      name: "checklist",
      note: "checklist emphasizes recorded completion; timeline emphasizes the order in which events or stages occur.",
    },
    {
      name: "phases",
      note: "phases groups contiguous stretches toward a date and derives the current one; timeline follows discrete dated events or stages in order.",
    },
  ],
  example: {
    order: "ascending",
    events: [
      {
        id: "landing",
        at: "2026-09-12",
        time: "14:05",
        title: "Land at Humberto Delgado",
        place: "LIS Terminal 1",
        ref: "TAP 1049",
      },
    ],
  },
} as const satisfies ComponentMeta;
