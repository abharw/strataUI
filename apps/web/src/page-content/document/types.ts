/**
 * The persisted document is JSON Render's flat `{root,elements}` spec. Product metadata and
 * user/runtime state stay outside it so the renderer grammar stays upstream-compatible.
 */
import * as z from "zod";

import { MAX_EMPTY_CHARS } from "./limits";

/* ------------------------------------------------------------ scalars */


/** URL handle, unique per space. Unlike an element id it may start with a digit. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SlugSchema = z.string().min(1).max(80).regex(SLUG_RE, "a slug is lowercase letters, digits and single hyphens, e.g. 2026-q3-review");

/**
 * A page id. Any uuid version is accepted, matching `isUuid` at the API edge; `z.uuid()` would
 * enforce RFC 4122 version nibbles and emit them into the manifest.
 */
// No `i` flag: this is emitted as a JSON Schema `pattern`, which has no flags.
export const PAGE_ID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const PageIdSchema = z
  .string()
  .regex(PAGE_ID_RE, "a page id is the uuid GET /v1/pages returned");

/* ------------------------------------------------------ typed values */
/*
 * The host formats typed values via JSON Render's `$format` with the viewer's locale and
 * timezone. Calendar dates never shift; exact instants do.
 */

/** Unit is a free display string ("km", "h"). */
export const QuantitySchema = z.strictObject({
  value: z.number().finite(),
  unit: z.string().min(1).optional(),
});

/** ISO 4217 alpha-3, upper-cased on the way in so `usd` is accepted. */
export const MoneySchema = z.strictObject({
  amount: z.number().finite(),
  currency: z
    .string()
    .overwrite((code) => code.toUpperCase())
    .regex(/^[A-Z]{3}$/, "expected an ISO 4217 code, e.g. USD"),
});

/** `YYYY-MM-DD`. */
export const IsoDateSchema = z.iso.date();

/** A `Z` or numeric offset is required. */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/* -------------------------------------------------------- cross-cutting */

/**
 * `{ page }` or `{ url }`, nested inside another block's props (`card.link`, row links,
 * `sequence`). A page the reader cannot reach renders unlinked.
 */
export const LinkSchema = z.union([
  z.strictObject({
    page: PageIdSchema.describe("id of another Strata page; the server resolves its keyed URL, so never paste one"),
  }),
  z.strictObject({
    url: z.url({ protocol: /^https?$/ }).describe("http(s) URL of an external destination"),
  }),
], {
  error: "a link is exactly one of { page } (another Strata page's id) or { url } (an http(s) address)",
});

/**
 * Sentence shown for an empty collection. Blocks pair it with a `superRefine` that requires it
 * when the array is empty and refuses it otherwise.
 */
export const EmptySchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_EMPTY_CHARS, `empty is a sentence shown in place of the list, not a paragraph: at most ${MAX_EMPTY_CHARS} characters`);

/** Nullable presentation enum; `null` means the device decides. */
export function presentation<const Values extends readonly [string, ...string[]]>(values: Values) {
  return z
    .enum(values)
    .nullable()
    .default(null)
    .describe("how to draw this; leave null to let the device choose the presentation that fits the data and the reader's screen");
}

/* --------------------------------------------------------------- meta */

/** Provenance: the originating message's stable id, timestamp and excerpt, rendered as text. */
export const SourceEventSchema = z.strictObject({
  id: z.string().min(1),
  at: IsoDateTimeSchema,
  excerpt: z.string().min(1),
});
export type SourceEvent = z.infer<typeof SourceEventSchema>;

/** Shared with the Postgres `page_kind` enum so both sides accept the same set. */
export const PAGE_KINDS = ["living", "standing"] as const;
export const PageKindSchema = z.enum(PAGE_KINDS);
export type PageKind = z.infer<typeof PageKindSchema>;

/** `open`: more writes are coming. `done` (default): this write ends the sequence. */
export const PresenceSchema = z.enum(["open", "done"]);
export type Presence = z.infer<typeof PresenceSchema>;

/**
 * Meta as returned to readers: the agent-writable fields plus server-owned ones. `url` is built
 * per request and is null when the sealed read key cannot be opened.
 */
export interface Meta {
  title: string;
  slug: string;
  kind: PageKind;
  source_event?: SourceEvent;
  url: string | null;
  /** Registry the page was validated against; null for pages written before it was recorded. */
  written_registry_version: number | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/* --------------------------------------------------------------- user */

/** User-owned state, stored in a separate table and never reachable by a put. */
export interface UserState {
  pinned: boolean;
}

/* ----------------------------------------------------------- documents */

