/**
 * `callout`: brief foreground prose, plain text with line breaks. An unknown `tone` renders as
 * the neutral default, so adding tones is backward-compatible.
 */
import * as z from "zod";

import { MAX_CALLOUT_CHARS } from "@/page-content/document/limits";
import type { ComponentMeta } from "@/page-content/types";

export const schema = z.strictObject({
  /** Plain text with line breaks; Markdown is not parsed, so `**bold**` shows asterisks. */
  text: z.string().min(1).max(MAX_CALLOUT_CHARS).describe(
    `plain text, at most ${MAX_CALLOUT_CHARS} characters; line breaks kept, no Markdown in v1`,
  ),
  tone: z
    .enum(["note", "tip", "warning"])
    .describe("note = neutral context, tip = a recommendation, warning = something that can go wrong")
    .optional(),
});

export const meta = {
  name: "callout",
  since: 14,
  shape: "a brief labelled note",
  readerActs: false,
  description:
    "Draw attention to a brief caveat, recommendation, or contextual note that deserves emphasis beside the main content.",
  interaction:
    "Display-only; readers cannot acknowledge or dismiss the note.",
  confusable_with: [
    {
      name: "quote",
      note: "callout emphasizes context from the page; quote preserves words attributed to another voice.",
    },
    {
      name: "accordion",
      note: "accordion hides detail the reader may skip; callout keeps a brief caveat or recommendation visible.",
    },
    {
      name: "prose",
      note: "callout is a labelled note that draws attention; prose carries a connected explanation without a label.",
    },
    {
      name: "facts",
      note: "callout emphasizes one contextual passage; facts presents several named values under their own labels.",
    },
    {
      name: "code-block",
      note: "callout wraps narrative text; code-block preserves exact whitespace and punctuation for reuse.",
    },
    {
      name: "metric",
      note: "callout emphasizes a sentence of context; metric gives one labelled scalar value visual prominence.",
    },
  ],
  example: {
    text: "Flights are held but not ticketed — the fare quote expires Friday.",
    tone: "warning",
  },
} as const satisfies ComponentMeta;
