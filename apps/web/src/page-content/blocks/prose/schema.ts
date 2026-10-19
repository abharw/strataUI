/**
 * `prose`: plain paragraphs on the page background, the quiet counterpart to `callout`. No size
 * variant; stored specs with an extra size prop still parse and the renderer ignores it.
 */
import * as z from "zod";

import { MAX_PROSE_CHARS, MAX_PROSE_ELEMENTS } from "@/page-content/document/limits";
import type { ComponentMeta } from "@/page-content/types";

export const schema = z.strictObject({
  /** A blank line starts a new paragraph. No Markdown, no links, no bold. */
  text: z
    .string()
    .min(1)
    .max(MAX_PROSE_CHARS)
    .describe(
      `plain paragraphs, at most ${MAX_PROSE_CHARS} characters; at most ${MAX_PROSE_ELEMENTS} prose element per page, never the root's first child. A blank line starts a new paragraph; no Markdown`,
    ),
});

export const meta = {
  name: "prose",
  since: 6,
  shape: "a connected explanation",
  readerActs: false,
  description:
    "Read a connected explanation when causal relationships, qualifications, or reasoning need to stay together in sentences.",
  interaction:
    "Display-only; paragraphs remain visible and cannot be edited by the reader.",
  confusable_with: [
    {
      name: "quote",
      note: "prose is the page's own explanation; quote preserves another voice with optional attribution.",
    },
    {
      name: "accordion",
      note: "accordion separates optional explanations behind labels; prose keeps connected reasoning visible.",
    },
    {
      name: "callout",
      note: "callout is a labelled note that draws attention; prose carries a connected explanation without a label.",
    },
    {
      name: "facts",
      note: "facts separates short named values; prose keeps causal explanations and qualifications connected.",
    },
  ],
  example: {
    text: "The consulate confirmed the appointment for the 14th.\n\nThey want the original lease, not a scan, so the deposit has to clear first.",
  },
} as const satisfies ComponentMeta;
