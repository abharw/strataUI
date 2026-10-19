/** Canonical Strata schema: namespace -> named space -> page -> JSON Render spec. */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { PAGE_KINDS } from "@/page-content/document/types";
import type { StrataSpec } from "@/page-content/schema";

export const pageKind = pgEnum("page_kind", PAGE_KINDS);
export const writeKind = pgEnum("write_kind", ["create", "patch", "rewrite"]);
export const exposureActor = pgEnum("exposure_actor", ["agent", "user", "system"]);
export const viewOrigin = pgEnum("view_origin", ["message", "home", "direct"]);

/* ------------------------------------------------- authorization server */

/** A viewer grant is read-only regardless of its scope. */
export const grantKind = pgEnum("grant_kind", ["writer", "viewer"]);
/**
 * `rotating`: a short access token plus a refresh token that rotates on every use. `static`: one
 * long-lived access token for agents that only accept a fixed string; revocation is the only rotation.
 */
export const grantMode = pgEnum("grant_mode", ["rotating", "static"]);
/** Who ended a grant. `reuse_detected` is a refresh replay killing the family. */
export const grantRevokedBy = pgEnum("grant_revoked_by", [
  "owner",
  "agent",
  "reuse_detected",
  "system",
]);
export const credentialTokenKind = pgEnum("credential_token_kind", ["access", "refresh"]);

export const namespaces = pgTable("namespaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** WorkOS user id, set on first email verification. Unique: this enforces one Strata per person. */
  workosUserId: text("workos_user_id").unique(),
  /** Lowercased address the code was sent to. */
  email: text("email"),
  /** Name of this Strata, if the provisioning agent supplied one. Nullable. */
  displayName: text("display_name"),
  /** The person's own name ("Ada"), which Home greets; `display_name` names the Strata. Nullable. */
  personName: text("person_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Both identity fields are set together by the verify that claims the namespace, or neither is.
  check(
    "namespaces_identity_consistent",
    sql`(${t.workosUserId} IS NULL) = (${t.email} IS NULL)`,
  ),
]);

/**
 * One agent's standing permission on one namespace. The grant is the unit of revocation
 * (`revoked_at` kills every token under it) and of provenance (`label`).
 */
export const grants = pgTable(
  "grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    kind: grantKind("kind").notNull(),
    // Validated against `DRIVERS` (`server/credentials/config`); text so new providers need no
    // migration.
    driver: text("driver").notNull(),
    /** Provenance name shown on pages, ≤40 chars. Defaults to the driver. */
    label: text("label").notNull(),
    mode: grantMode("mode").notNull().default("rotating"),
    scope: text("scope").array().notNull().default(sql`'{}'::text[]`),
    /**
     * The grant that minted this one, or null when an email code did. `set null` so deleting an
     * issuer does not delete the grants it introduced.
     */
    issuedByGrantId: uuid("issued_by_grant_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: grantRevokedBy("revoked_by"),
  },
  (t) => [
    index("grants_namespace_id_revoked_at_idx").on(t.namespaceId, t.revokedAt),
    // Self-referential, so it is declared here rather than inline.
    foreignKey({
      name: "grants_issued_by_grant_id_grants_id_fk",
      columns: [t.issuedByGrantId],
      foreignColumns: [t.id],
    }).onDelete("set null"),
    check(
      "grants_revocation_consistent",
      sql`(${t.revokedAt} IS NULL AND ${t.revokedBy} IS NULL) OR (${t.revokedAt} IS NOT NULL AND ${t.revokedBy} IS NOT NULL)`,
    ),
    // Viewers are read-only; the ceiling lives in the database so no layer above can widen it.
    check(
      "grants_viewer_scope_read_only",
      sql`${t.kind} <> 'viewer' OR ${t.scope} <@ ARRAY['pages:read']::text[]`,
    ),
    check("grants_label_length", sql`char_length(${t.label}) BETWEEN 1 AND 40`),
    // Ceiling on the scope vocabulary, backing the validation in `server/credentials/grants`.
    check(
      "grants_scope_ceiling",
      sql`${t.scope} <@ ARRAY['pages:read','pages:write','namespace:pair']::text[]`,
    ),
  ],
);

/**
 * Opaque bearer credentials, stored as hashes only: `sw_` writer access, `sv_` viewer access,
 * `sr_` refresh. `family_id`/`parent_id` chain rotations so a replayed refresh token revokes the
 * whole grant. `expires_at` is null for a `static` grant's access token (enforced in `lib/credentials`).
 */
export const credentialTokens = pgTable(
  "credential_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => grants.id, { onDelete: "cascade" }),
    kind: credentialTokenKind("kind").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** All descendants of one issuance share this; reuse detection works on it. */
    familyId: uuid("family_id").notNull(),
    parentId: uuid("parent_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Set when a refresh token is spent. A second spend is a replay. */
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("credential_tokens_grant_id_kind_idx").on(t.grantId, t.kind),
    index("credential_tokens_family_id_idx").on(t.familyId),
    index("credential_tokens_expires_at_idx").on(t.expiresAt),
    foreignKey({
      name: "credential_tokens_parent_id_credential_tokens_id_fk",
      columns: [t.parentId],
      foreignColumns: [t.id],
    }).onDelete("set null"),
    check(
      "credential_tokens_expiry_after_creation",
      sql`${t.expiresAt} IS NULL OR ${t.expiresAt} > ${t.createdAt}`,
    ),
  ],
);

/** Owner browser session, created only by entering an emailed code. Stores the secret's SHA-256. */
export const ownerSessions = pgTable(
  "owner_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    sessionHash: text("session_hash").notNull().unique(),
    /**
     * Coarse browser label ("Safari on iPhone") so the owner can tell sessions apart. The raw
     * User-Agent is not stored, to avoid keeping a fingerprint. Null when unrecognised.
     */
    clientLabel: text("client_label"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("owner_sessions_namespace_id_revoked_at_idx").on(t.namespaceId, t.revokedAt),
    index("owner_sessions_expires_at_idx").on(t.expiresAt),
    // Serves the `revoked_at < cutoff` half of the retention sweep; the composite above leads with
    // the namespace.
    index("owner_sessions_revoked_at_idx").on(t.revokedAt),
    check("owner_sessions_expiry_after_creation", sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

/**
 * Rolling-window counters for unauthenticated auth endpoints, keyed by request-source pseudonym or a
 * keyed digest of the email; neither is reversible to an address. Rows are removed only by the
 * nightly sweep (`sweepRateLimitEvents`), so a delete never races a count.
 */
export const rateLimitEvents = pgTable(
  "rate_limit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Which budget: `auth-start`, `auth-start-email`, `auth-verify-failure`, ... */
    bucket: text("bucket").notNull(),
    /** Source pseudonym, namespace id, or another opaque bucket key. */
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rate_limit_events_bucket_key_created_at_idx").on(t.bucket, t.key, t.createdAt),
    index("rate_limit_events_bucket_created_at_idx").on(t.bucket, t.createdAt),
    // Sweeps filter on `created_at` alone, which neither composite above serves.
    index("rate_limit_events_created_at_idx").on(t.createdAt),
  ],
);

/** Abuse quota accounting survives page deletion and is reset per UTC day. */
export const namespaceUsage = pgTable(
  "namespace_usage",
  {
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    pageWrites: integer("page_writes").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.namespaceId, t.day] }),
    check("namespace_usage_page_writes_nonnegative", sql`${t.pageWrites} >= 0`),
  ],
);

/** A named space. Membership, lifecycle, and its stable shared link live here. */
export const spaces = pgTable(
  "spaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull(),
    shareKeyHash: text("share_key_hash"),
    /**
     * The `spk_` share key sealed with STRATA_URL_KEY, so the owner can copy the link again. The
     * origin comes from the request (`lib/keys#spaceUrl`), not the row.
     */
    sealedShareKey: text("sealed_share_key"),
    /** When the stable link was first minted or last rotated. */
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("spaces_namespace_id_idx").on(t.namespaceId),
    // A constraint, not a unique index, so `drizzle-kit push` can create the composite FK on a fresh DB.
    unique("spaces_id_namespace_id_unique").on(t.id, t.namespaceId),
    uniqueIndex("spaces_namespace_id_slug_idx").on(t.namespaceId, t.slug),
    uniqueIndex("spaces_share_key_hash_idx").on(t.shareKeyHash),
    // The sealed key and the hash that authenticates it are set and cleared together.
    check(
      "spaces_share_state_consistent",
      sql`(${t.shareKeyHash} IS NULL) = (${t.sealedShareKey} IS NULL)`,
    ),
  ],
);

/** One living JSON Render document with its own cadence, audience, URL, and lifecycle. */
export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    kind: pageKind("kind").notNull().default("living"),
    updatingUntil: timestamp("updating_until", { withTimezone: true }),
    version: integer("version").notNull().default(0),
    document: jsonb("document").$type<StrataSpec>().notNull(),
    /** Registry version the page was authored against, so drift is enumerable. Null when unknown. */
    registryVersion: integer("registry_version"),
    /**
     * The `pgk_` read key sealed with STRATA_URL_KEY. Links are built at read time from the
     * request origin (`lib/keys#pageUrl`).
     */
    sealedReadKey: text("sealed_read_key").notNull(),
    lastSummary: text("last_summary").notNull(),
    readKeyHash: text("read_key_hash").notNull(),
    sourceEvent: jsonb("source_event"),
    /** Space-bundle exposure is distinct from membership and is private by default. */
    shared: boolean("shared").notNull().default(false),
    exposureActor: exposureActor("exposure_actor").notNull().default("system"),
    exposureUpdatedAt: timestamp("exposure_updated_at", { withTimezone: true }).notNull().defaultNow(),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    /** The grant that wrote last, rendered as provenance via its label. Null once the grant is gone. */
    lastWriterGrantId: uuid("last_writer_grant_id").references(() => grants.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    /**
     * Shows the write trail as a "View steps" section; off by default. Set by writes carrying
     * `live_steps`, toggled by `set_page`.
     */
    liveSteps: boolean("live_steps").notNull().default(false),
  },
  (t) => [
    // Listings read one namespace newest-first (`readPageList`); this serves both filter and sort.
    index("pages_namespace_id_updated_at_idx").on(t.namespaceId, t.updatedAt.desc()),
    // Also serves (space_id) lookups as a prefix.
    index("pages_space_id_shared_idx").on(t.spaceId, t.shared),
    uniqueIndex("pages_space_id_slug_idx").on(t.spaceId, t.slug),
    // The read key is the page address (`/share/:pgk`), so `assemblePage` looks pages up by this
    // hash. Unique so one link can only open one document.
    uniqueIndex("pages_read_key_hash_idx").on(t.readKeyHash),
    foreignKey({
      name: "pages_space_id_namespace_id_spaces_id_namespace_id_fk",
      columns: [t.spaceId, t.namespaceId],
      foreignColumns: [spaces.id, spaces.namespaceId],
    }).onDelete("cascade"),
    check("pages_shared_at_consistent", sql`(${t.shared} AND ${t.sharedAt} IS NOT NULL) OR (NOT ${t.shared} AND ${t.sharedAt} IS NULL)`),
  ],
);

export const pageUserState = pgTable("page_user_state", {
  pageId: uuid("page_id").primaryKey().references(() => pages.id, { onDelete: "cascade" }),
  pinned: boolean("pinned").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const viewLog = pgTable(
  "view_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id").notNull().references(() => pages.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    origin: viewOrigin("origin").notNull(),
  },
  (t) => [
    index("view_log_page_id_at_idx").on(t.pageId, t.at),
    // The retention sweep filters on `at` alone, which the composite above
    // cannot serve: its leading column is the page. Without this the nightly
    // job is a sequential scan of the largest table in the schema.
    index("view_log_at_idx").on(t.at),
  ],
);

/** Whole-spec write provenance. It is an audit trail, not a revision store. */
export const pageWrites = pgTable(
  "page_writes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id").notNull().references(() => pages.id, { onDelete: "cascade" }),
    /** The grant behind the write; null once that grant's row is gone. */
    grantId: uuid("grant_id").references(() => grants.id, { onDelete: "set null" }),
    version: integer("version").notNull(),
    summary: text("summary").notNull(),
    /** Null when the write kind was not recorded. */
    kind: writeKind("kind"),
    /**
     * The `resource_id`s of the files this write attached to its summary - a
     * screenshot of the step, typically. Stored beside the summary because
     * that is what they are: evidence for one line of the trail, not content
     * of the page. Empty for every write that carried none.
     */
    assetRefs: text("asset_refs").array().notNull().default(sql`'{}'::text[]`),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("page_writes_page_id_at_idx").on(t.pageId, t.at)],
);

/**
 * One asking of one question: element id plus a sequence number. A new asking opens when the
 * question's words change or the element is rewritten after an answer; other patches leave it open.
 */
export const pageAsks = pgTable(
  "page_asks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    /** The approval element's own id, from the spec. */
    approvalId: text("approval_id").notNull(),
    /** 1 for the first asking, bumped for every re-ask. */
    askSeq: integer("ask_seq").notNull(),
    /**
     * Hash of question, context, options and tradeoffs. The words live in the spec and, once
     * answered, in `decision_log`.
     */
    questionKey: text("question_key").notNull(),
    /** When the agent took the question off the page; withdrawn asks do not count as open. */
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (t) => [
    // Also serves by-page reads as a prefix.
    uniqueIndex("page_asks_page_id_approval_id_ask_seq_idx").on(t.pageId, t.approvalId, t.askSeq),
  ],
);

/**
 * The answers people gave. No FK to pages: consent outlives the page, so title and question are
 * frozen here and page deletion stamps `pageDeletedAt` instead of cascading. The unique index over
 * one asking makes a second tap a replay that returns the recorded answer.
 */
export const decisionLog = pgTable(
  "decision_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    /** Not a foreign key: the answer outlives the page. */
    pageId: uuid("page_id").notNull(),
    /** Frozen at answer time, so the row still reads after the page is gone. */
    pageTitle: text("page_title").notNull(),
    spaceName: text("space_name"),
    approvalId: text("approval_id").notNull(),
    askSeq: integer("ask_seq").notNull(),
    questionKey: text("question_key").notNull(),
    question: text("question").notNull(),
    context: text("context"),
    options: jsonb("options").$type<unknown[]>().notNull(),
    chosenId: text("chosen_id").notNull(),
    chosenLabel: text("chosen_label").notNull(),
    /** Which capability answered; currently only the owner. */
    answeredBy: text("answered_by").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
    /** When the page this was asked on was deleted, or null while it lives. */
    pageDeletedAt: timestamp("page_deleted_at", { withTimezone: true }),
  },
  (t) => [
    // Also serves (page_id) lookups as a prefix.
    uniqueIndex("decision_log_page_id_approval_id_ask_seq_idx").on(t.pageId, t.approvalId, t.askSeq),
    index("decision_log_namespace_id_answered_at_idx").on(t.namespaceId, t.answeredAt),
  ],
);

/** Every exposure flip, including move-to-private, is explicit and attributable. */
export const exposureLog = pgTable(
  "exposure_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id").notNull().references(() => pages.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    shared: boolean("shared").notNull(),
    actor: exposureActor("actor").notNull(),
    onBehalfOfUser: boolean("on_behalf_of_user").notNull().default(false),
    /** The grant behind the flip; null for user actions. */
    grantId: uuid("grant_id").references(() => grants.id, { onDelete: "set null" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("exposure_log_page_id_at_idx").on(t.pageId, t.at)],
);

/** Postgres bytea, read and written whole; assets are small by policy. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * A file an agent uploaded for a page. `POST /v1/assets` creates the row and a one-shot upload URL;
 * the bytes arrive separately. `resourceId` is the only id written into pages, so storage can move
 * without rewriting them.
 */
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    /** The public handle: what an agent puts in a page element. */
    resourceId: text("resource_id").notNull(),
    /** Random and unguessable. A unique constraint, as `asset_blobs` references it in one migration. */
    storageKey: text("storage_key").notNull().unique(),
    filename: text("filename").notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** Set when the bytes land; null while the upload is still outstanding. */
    storedAt: timestamp("stored_at", { withTimezone: true }),
    /**
     * Deadline for the one-shot upload URL. The upload signature is minted against it, so
     * re-issuing the link (`POST /v1/assets/:id/upload-url`) invalidates the previous URL.
     */
    uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true }).notNull(),
    /* ------------------------------ what the bytes turned out to be */
    /** Hex digest of the stored bytes; the ETag `/assets/:id` answers with. */
    sha256: text("sha256"),
    /** Pixel dimensions, for images only, parsed from the header bytes. */
    width: integer("width"),
    height: integer("height"),
    /* ------------------------------------- the derived display variant */
    /**
     * Small display copy of an image for tiles and galleries, made when the bytes land. Null for
     * non-raster files or when encoding could not shrink it. Excluded from every asset read except
     * the one that serves it (`ASSET_FIELDS` in `lib/assets`).
     */
    thumbBytes: bytea("thumb_bytes"),
    /** `image/webp`, or JPEG when WebP encoding failed. */
    thumbMediaType: text("thumb_media_type"),
    thumbWidth: integer("thumb_width"),
    thumbHeight: integer("thumb_height"),
    /* ---------------------------------- attribution, display-only */
    /** Short attribution caption shown under the image. */
    credit: text("credit"),
    /** Source link, rendered only; the host never fetches it. */
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("assets_resource_id_idx").on(t.resourceId),
    // Both quota reads filter on (namespace_id, stored_at).
    index("assets_namespace_id_stored_at_idx").on(t.namespaceId, t.storedAt),
    check("assets_size_bytes_positive", sql`${t.sizeBytes} > 0`),
  ],
);

/**
 * Asset bytes, keyed by the random storage key rather than the asset id so storage can move to an
 * object store without changing the asset row.
 */
export const assetBlobs = pgTable("asset_blobs", {
  /** Deleting the asset deletes the bytes; nothing keeps an orphan alive. */
  storageKey: text("storage_key")
    .primaryKey()
    .references(() => assets.storageKey, { onDelete: "cascade" }),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
