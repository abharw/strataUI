/**
 * Prop-value schemas for the component catalog. Props stay flat (depth at most 3) and closed,
 * with no `oneOf` or recursion, to fit Anthropic's strict-schema subset. Unions are kept one
 * level deep because strict schemas budget union params (16 per schema).
 */
import * as z from "zod";

import { MAX_UNIT_CHARS } from "@/page-content/document/limits";
import {
  IsoDateSchema,
  IsoDateTimeSchema,
  MoneySchema,
  QuantitySchema,
} from "@/page-content/document/types";

const RegistryQuantitySchema = QuantitySchema.extend({
  unit: z
    .string()
    .trim()
    .min(1)
    .max(
      MAX_UNIT_CHARS,
      `a quantity unit may contain at most ${MAX_UNIT_CHARS} characters`,
    )
    .optional(),
});

/** Collection item id; whole-spec writes match item identity on it. */
export const ItemIdSchema = z.string().min(1);

/** An uploaded asset's `resource_id` plus alt text. Never a model-authored URL. */
export const MediaRefSchema = z.strictObject({
  resource_id: z.string().min(1).max(200).describe(
    "id from POST /v1/assets after uploading the image; the renderer mints a short-lived serving URL per render",
  ),
  alt: z.string().min(1).max(160).describe("accessible text for a reader who cannot see the image"),
});

/**
 * What a display prop accepts. Dates are plain strings; the host detects them and formats them
 * for the viewer's locale and timezone.
 */
export const DisplayValueSchema = z.union([
  RegistryQuantitySchema,
  MoneySchema,
  z.string(),
  z.number(),
  z.boolean(),
], {
  // Zod's default union error is a bare "Invalid input".
  error: "a display value is a quantity {value, unit}, money {amount, currency}, or a plain string, number or "
    + "boolean. Money needs both fields, and currency is an ISO 4217 code like USD; an ISO-8601 date or "
    + "datetime goes in as the plain string, which the page formats for the reader.",
});

/** A display value the renderer can divide, e.g. `progress` current/target. */
export const NumericValueSchema = z.union([
  RegistryQuantitySchema,
  MoneySchema,
  z.number(),
], {
  error: "this value is divided to draw the bar, so it has to be arithmetic: a quantity {value, unit}, money "
    + "{amount, currency}, or a plain number. \"12 kg\" is a string; send {value: 12, unit: \"kg\"}.",
});

/**
 * ISO-8601 date or offset datetime. One refined string rather than a union, which the prompt
 * printer would render as `string | string`.
 */
export const TimestampSchema = z
  .string()
  .refine(
    (value) =>
      IsoDateSchema.safeParse(value).success ||
      IsoDateTimeSchema.safeParse(value).success,
    "an ISO-8601 calendar date (YYYY-MM-DD) or a datetime with an offset",
  );

/**
 * Wall-clock `HH:MM` (seconds optional), kept separate from a date when the source gives local
 * time but no timezone.
 */
export const TimeOfDaySchema = z.iso.time();

export const ColumnIndexSchema = z.int().min(0);

/**
 * A superset of `TimestampSchema` that also accepts `YYYY` and `YYYY-MM`, for observed dates
 * known only coarsely. Set deadlines (`due_at`, `next_check_at`) stay exact.
 */
export const PartialTimestampSchema = z
  .string()
  .refine(
    (value) =>
      /^\d{4}$/.test(value)
      || /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
      || TimestampSchema.safeParse(value).success,
    "a year (YYYY), a year-month (YYYY-MM), an ISO-8601 calendar date, or a datetime with an offset",
  );

export const PARTIAL_TIMESTAMP_NOTE =
  "at the precision the source establishes: a bare year (YYYY), a year-month (YYYY-MM), a calendar date "
  + "(YYYY-MM-DD), or an ISO-8601 datetime with an offset - never invent precision the source does not have";

/**
 * `\p{RGI_Emoji}` matches a whole grapheme (ZWJ sequences, skin tones, flags, keycaps).
 * Built with `new RegExp` because TypeScript rejects the `v` flag on literals below ES2024.
 * Shared with `server/spaces/emoji.ts`, since blocks may not import server code.
 */
const SINGLE_EMOJI = new RegExp("^\\p{RGI_Emoji}$", "v");

/** True for exactly one complete emoji grapheme. */
export function isSingleEmoji(value: string): boolean {
  return SINGLE_EMOJI.test(value);
}

/** U+FE0F, the variation selector that asks for emoji rather than text presentation. */
const EMOJI_PRESENTATION_SELECTOR = "️";

/**
 * Appends U+FE0F to a text-presentation character (`❤`, `☀`) when that makes it a complete RGI
 * emoji; anything else is returned unchanged for the validator to refuse.
 */
export function normalizeEmoji(value: string): string {
  if (isSingleEmoji(value)) return value;
  const presented = value + EMOJI_PRESENTATION_SELECTOR;
  return isSingleEmoji(presented) ? presented : value;
}

/** One emoji grapheme, normalized to its RGI spelling on the way in. */
export const SingleEmojiSchema = z
  .string()
  .overwrite(normalizeEmoji)
  .refine(isSingleEmoji, { message: "must be exactly one complete Unicode emoji" });
