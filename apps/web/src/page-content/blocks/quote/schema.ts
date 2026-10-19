/**
 * `quote`: one pull-quote between hairlines, at most one per page. It carries a voice, never
 * data another component renders.
 */
import * as z from "zod";

import {
  MAX_QUOTE_ATTRIBUTION_CHARS,
  MAX_QUOTE_CHARS,
} from "@/page-content/document/limits";
import type { ComponentMeta } from "@/page-content/types";

export const schema = z.strictObject({
  text: z.string().min(1).max(MAX_QUOTE_CHARS).describe(
    `the quoted words, at most ${MAX_QUOTE_CHARS} characters; at most one quote per page`,
  ),
  attribution: z.string().min(1).max(MAX_QUOTE_ATTRIBUTION_CHARS).describe(
    `who said it, at most ${MAX_QUOTE_ATTRIBUTION_CHARS} characters; omit when there is no one to name`,
  ).optional(),
});

export const meta = {
  name: "quote",
  since: 8,
  shape: "one attributed voice",
  readerActs: false,
  description:
    "Read a short quotation in its own voice, with attribution when the source identifies its speaker.",
  interaction:
    "Display-only; the quotation remains visible without controls.",
  confusable_with: [
    {
      name: "prose",
      note: "prose is the page's own explanation; quote preserves another voice with optional attribution.",
    },
    {
      name: "callout",
      note: "callout emphasizes context from the page; quote preserves words attributed to another voice.",
    },
    {
      name: "reference-list",
      note: "quote presents words on the page; reference-list lets readers open the source material.",
    },
  ],
  example: {
    text: "We would rather ship one quiet page a day than ten loud ones.",
    attribution: "Ada, product lead",
  },
} as const satisfies ComponentMeta;
