/**
 * Every hard limit in the system. Anthropic's strict-schema subset forbids `maxItems`, so caps
 * are server-enforced constants rather than modifiers on the Zod schemas.
 */
import type { PageKind } from "./types";

/* ---------------------------------------------------------- write caps */

export const MAX_NODES_HARD = 200;

/** Guidance only: crossing it is a warning, not a 4xx. */
export const GUIDE_NODES = 40;

/** A patch larger than this is rebuilding the page node by node instead of replacing a subtree. */
export const MAX_PATCH_OPS = 200;

export const MAX_ITEMS_PER_COLLECTION = 500;

/** Root counts as depth 1. */
export const MAX_DEPTH = 8;

/** 256 KB. */
export const MAX_BODY_BYTES = 262_144;

/* ------------------------------------------ provisioning & account quotas */

export const MAX_SPACES_PER_NAMESPACE = 50;

export const MAX_PAGES_PER_NAMESPACE = 250;

/** A position past the number of pages a Strata can hold names a slot nothing can fill. */
export const MAX_SEQUENCE_POSITION = MAX_PAGES_PER_NAMESPACE;

export const MAX_PAGE_WRITES_PER_NAMESPACE_PER_DAY = 2_000;

/** The consent log is never pruned, so the response is the only place a ceiling can live. */
export const DECISIONS_PAGE_DEFAULT = 100;

export const DECISIONS_PAGE_MAX = 500;

/* ----------------------------------------------------------- attachments */

/**
 * Vercel Functions reject request bodies over about 4.5 MB with an HTML
 * `FUNCTION_PAYLOAD_TOO_LARGE` before our code runs, so the limit is enforced at reservation time.
 */
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;

/** Stored bytes plus live reservations. */
export const MAX_NAMESPACE_BYTES = 200 * 1024 * 1024;

/**
 * Single-use upload URL lifetime. Agents often reserve files before slow work; the reservation
 * holds the quota and `POST /v1/assets/{id}/upload-url` re-issues the link.
 */
export const UPLOAD_WINDOW_SECONDS = 60 * 60;

export const SERVE_WINDOW_SECONDS = 10 * 60;

/** Types a browser renders inline. */
export const ALLOWED_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
] as const;

export const MAX_ASSET_FILENAME_CHARS = 200;

/** One caption line under the image. */
export const MAX_ASSET_CREDIT_CHARS = 120;

/** Displayed as a plain link, never fetched by the host. */
export const MAX_ASSET_SOURCE_URL_CHARS = 500;

/** `GET /v1/assets` page size, newest first. */
export const ASSETS_PAGE_MAX = 100;

/* ------------------------------------------------------- live updates */

export const POLL_VISIBLE_MS = 3_000;

export const POLL_HIDDEN_MS = 30_000;

/**
 * Presence lease set by `presence: "open"` and renewed by each write in the sequence; a write
 * without it clears the claim. Two minutes covers the gap between calls without flicker.
 */
export const PRESENCE_MINUTES = 2;

/** Navigations closer than this share one `view_log` row. */
export const VIEW_LOG_DEBOUNCE_MS = 60_000;

/* ------------------------------------------------------- text budgets */

/*
 * Structural caps alone allow a text wall, so text has its own budget per field, per
 * collection and per page. Over-budget writes are refused, not trimmed.
 *
 * Label caps follow how the reader meets them: glanced (32), scanned (48), read (80).
 */

/** metric / progress `label`: must not wrap beside the number. */
export const MAX_VALUE_LABEL_CHARS = 32;

/** decision / approval option `label`: pill copy, which cannot wrap. */
export const MAX_CHOICE_LABEL_CHARS = 32;

/** facts `label`: read in a narrow left column. */
export const MAX_FACTS_LABEL_CHARS = 48;

export const MAX_ACCORDION_TITLE_CHARS = 48;

/** checklist `label`: the only label that may be a sentence. */
export const MAX_CHECKLIST_LABEL_CHARS = 80;

export const MAX_QUOTE_ATTRIBUTION_CHARS = 80;

/*
 * Value caps follow the room the value is read in: item-list row value (24, flush right),
 * metric value (40, display size), comparison before/after (80, half width), facts value (200).
 */

/** Longer explanations belong in `prose`. */
export const MAX_FACTS_VALUE_CHARS = 200;

/** Shared by the text counter and the component schema. `MAX_COLLECTION_TEXT_CHARS` binds first. */
export const MAX_REFERENCE_TITLE_CHARS = 240;

export const MAX_REFERENCE_SOURCE_CHARS = 120;

export const MAX_METRIC_VALUE_CHARS = 40;

/** The unit on any typed `{value, unit}`. */
export const MAX_UNIT_CHARS = 32;

/** Larger raw figures should be summarized with a compact unit by the author. */
export const MAX_METRIC_ABSOLUTE_VALUE = 999_999_999_999;

/* ---- Choice copy */

export const MAX_CHOICE_QUESTION_CHARS = 96;

/** decision option `tradeoff`: one clause. */
export const MAX_TRADEOFF_CHARS = 120;

export const MAX_RATIONALE_CHARS = 200;

/* ---- Passages */

/** timeline / status-list / reference-list `note`. */
export const MAX_NOTE_CHARS = 120;

export const MAX_QUOTE_CHARS = 200;

export const MAX_CALLOUT_CHARS = 240;

export const MAX_ACCORDION_BODY_CHARS = 240;

export const MAX_PROSE_CHARS = 400;

export const MAX_PROSE_ELEMENTS = 1;

/** Total visible text across one collection's items, so a list stays scannable. */
export const MAX_COLLECTION_TEXT_CHARS = 600;

/** Shared clause for every collection prop's description, so the manifest matches `schema.ts`. */
export function collectionBudgetClause(): string {
  return `; every visible character in this array counts against one ${MAX_COLLECTION_TEXT_CHARS}-character collection budget, and that budget binds before the item cap - short items reach the cap, long items do not`;
}

/**
 * Total visible body text per page, by cadence. `answer.verdict` is excluded; it has its own
 * cap.
 */
export const PAGE_TEXT_BUDGET = {
  living: 1_500,
  standing: 3_000,
} as const satisfies Record<PageKind, number>;

export const MAX_ANSWER_VERDICT_CHARS = 140;

/* ------------------------------------- reader-visible fields off-spec */

/** Write `summary`: renders unclamped in the chrome's delta strip. */
export const MAX_SUMMARY_CHARS = 200;

/** Page `title`: renders as the h1. */
export const MAX_TITLE_CHARS = 120;

/** Write `asset_refs`, shown inline in the "View steps" trail. More belongs in `attachment-list`. */
export const MAX_WRITE_ASSET_REFS = 4;

export const MAX_SPACE_NAME_CHARS = 30;

/** `approval.context` is exempt from the page budget (like `code-block.code`) but capped here. */
export const MAX_APPROVAL_CONTEXT_CHARS = 240;

/** Authored copy in one approval, counting every generated field once. */
export const MAX_APPROVAL_COPY_CHARS = 320;

/* --------------------------------------------------- data-shape blocks */

export const MAX_EMPTY_CHARS = 80;

export const MAX_GRID_CHILDREN = 8;
export const MAX_CAROUSEL_CHILDREN = 12;

/** Scanned in half a phone's width, so the same 48 as a facts label. */
export const MAX_CARD_TITLE_CHARS = 48;
export const MAX_CARD_DESCRIPTION_CHARS = 160;
export const MAX_CARD_FOOTER_CHARS = 120;

export const MAX_ITEM_LIST_ITEMS = 20;
export const MAX_ITEM_LIST_TITLE_CHARS = 80;
export const MAX_ITEM_LIST_DESCRIPTION_CHARS = 160;
/** Plain-string row value, short enough to sit flush right. */
export const MAX_ITEM_LIST_VALUE_CHARS = 24;

export const MAX_FACTS_ITEMS = 24;

export const MAX_COMPARISON_ITEMS = 12;
export const MAX_COMPARISON_LABEL_CHARS = 48;
export const MAX_COMPARISON_VALUE_CHARS = 80;
/** Column heading such as "Was" or "Now". */
export const MAX_COMPARISON_HEADER_CHARS = 16;

export const MAX_METRIC_CHANGE_VALUE_CHARS = 12;
export const MAX_METRIC_TREND_POINTS = 30;

export const MAX_PHASES_STAGES = 8;
export const MAX_PHASE_NAME_CHARS = 32;
export const MAX_PHASE_NOTE_CHARS = 80;
export const MAX_PHASE_TARGET_LABEL_CHARS = 32;

/** Few enough to stay a shape rather than a legend. */
export const MAX_BREAKDOWN_PARTS = 8;
export const MAX_BREAKDOWN_LABEL_CHARS = 32;
export const MAX_BREAKDOWN_TOTAL_LABEL_CHARS = 32;
