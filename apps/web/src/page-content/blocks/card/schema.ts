/**
 * `card`: a unit with slots (title, media, link, footer) around one child, such as `metric` or
 * `chart`. Containment rules live in the document schema, which sees the `children` array.
 */
import * as z from "zod";

import {
  MAX_CARD_DESCRIPTION_CHARS,
  MAX_CARD_FOOTER_CHARS,
  MAX_CARD_TITLE_CHARS,
} from "@/page-content/document/limits";
import { LinkSchema } from "@/page-content/document/types";
import type { ComponentMeta } from "@/page-content/types";
import { MediaRefSchema, SingleEmojiSchema } from "@/page-content/values";

export const schema = z.strictObject({
  /**
   * One emoji before the title, using the same grapheme rule as a Space's marker. Not counted as
   * authored text in `document/text.ts`, like `media` and `link`.
   */
  emoji: SingleEmojiSchema.describe(
    "exactly one emoji, drawn before the title at title size; a bare ❤ or ☀ is stored with its emoji variation selector",
  ).optional(),
  title: z.string().min(1).max(MAX_CARD_TITLE_CHARS).describe(
    `the card's own heading, at most ${MAX_CARD_TITLE_CHARS} characters; a card with no children needs this or media`,
  ).optional(),
  /** One or two lines under the title. */
  description: z.string().min(1).max(MAX_CARD_DESCRIPTION_CHARS).optional(),
  /** A cover image. A card with no children needs this or title. */
  media: MediaRefSchema.optional(),
  /** Makes the whole card tappable; the renderer draws the affordance. */
  link: LinkSchema.optional(),
  /** A trailing line under the body - a price, a date, a status. */
  footer: z.string().min(1).max(MAX_CARD_FOOTER_CHARS).optional(),
});

export const meta = {
  name: "card",
  since: 15,
  shape: "a self-contained unit with slots",
  readerActs: true,
  description:
    "Give one self-contained peer its own titled, linkable surface - alone in a grid cell, or browsed in a carousel. One optional emoji sits before the title.",
  interaction:
    "Tap a linked card to open its destination; an unlinked card is display-only.",
  confusable_with: [
    {
      name: "section",
      note: "card is one self-contained unit with slots; section groups any number of mixed children in page order.",
    },
    {
      name: "grid",
      note: "grid is the container that holds cards (and bare metrics or progress) together; card is the unit it holds.",
    },
    {
      name: "carousel",
      note: "carousel is the container that browses cards one at a time; card is the unit it holds.",
    },
  ],
  example: {
    title: "Maple Street",
    description: "2BR, laundry in unit, 12 min to the office.",
    footer: "$2,150/mo",
  },
} as const satisfies ComponentMeta;
