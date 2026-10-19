/**
 * `accordion`: collapsible detail the reader may skip, never the page's answer.
 * 2-8 items, 240-character bodies, 600 characters across the collection.
 */
import * as z from "zod";

import {
  MAX_ACCORDION_BODY_CHARS,
  MAX_ACCORDION_TITLE_CHARS,
  collectionBudgetClause,
} from "@/page-content/document/limits";
import type { ComponentMeta } from "@/page-content/types";
import { ItemIdSchema } from "@/page-content/values";

export const schema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: ItemIdSchema,
        title: z.string().min(1).max(MAX_ACCORDION_TITLE_CHARS).describe(
          `the row's label, at most ${MAX_ACCORDION_TITLE_CHARS} characters - a name, not a sentence`,
        ),
        body: z.string().min(1).max(MAX_ACCORDION_BODY_CHARS).describe(
          `what opens in place, at most ${MAX_ACCORDION_BODY_CHARS} characters; anything longer is prose on the page`,
        ),
      }),
    )
    .min(
      2,
      "an accordion with one row is a folded sentence - open it as prose, or drop it",
    )
    .max(
      8,
      "an accordion past 8 rows is a list the reader must open one by one - use facts or a second page",
    )
    .describe(`2-8 optional details${collectionBudgetClause()}`),
});

export const meta = {
  name: "accordion",
  since: 8,
  shape: "labelled details, closed by default",
  readerActs: true,
  description:
    "Keep optional explanations behind short labels when the main answer remains understandable with those details closed.",
  interaction:
    "Expand or collapse individual rows locally; opening a row does not update the page.",
  confusable_with: [
    {
      name: "facts",
      note: "accordion hides optional explanations; facts keeps short named values visible for scanning.",
    },
    {
      name: "prose",
      note: "accordion separates optional explanations behind labels; prose keeps connected reasoning visible.",
    },
    {
      name: "callout",
      note: "accordion hides detail the reader may skip; callout keeps a brief caveat or recommendation visible.",
    },
  ],
  example: {
    items: [
      { id: "a1", title: "Cancellation", body: "Full refund until 48 hours before check-in, then one night." },
      { id: "a2", title: "Parking", body: "Street parking only after 6pm; the garage on 5th validates." },
    ],
  },
} as const satisfies ComponentMeta;
