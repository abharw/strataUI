import * as z from "zod";

import { isSingleEmoji, normalizeEmoji } from "@/page-content/values";

/** Space emoji validation, using the same predicate as `card.emoji` in `page-content/values.ts`. */
export { isSingleEmoji } from "@/page-content/values";

/** Alias of the shared emoji normalizer. */
export const normalizeSpaceEmoji = normalizeEmoji;

export const SpaceEmojiSchema = z
  .string()
  .overwrite(normalizeEmoji)
  .refine(isSingleEmoji, {
    message: "A Space emoji must be exactly one complete Unicode emoji.",
  });
