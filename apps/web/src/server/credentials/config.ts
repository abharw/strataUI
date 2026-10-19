/** Credential lifetimes, prefixes and scopes. Keep these values here rather than inlined. */

/* ------------------------------------------------------------- lifetimes */

/** Access tokens are short because revocation is checked per request anyway. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
/** Refresh: 90 days, sliding; every rotation issues a fresh window. */
export const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * How long after a rotation the spent refresh token may be presented once more, so a retry after
 * a dropped response can recover. Outside it, or once the successor is spent, the grant is revoked.
 */
export const REFRESH_REPLAY_GRACE_SECONDS = 30;

/**
 * A static grant's access token never expires, for agents that hold one fixed string (ChatGPT
 * Actions). Revoking is the only rotation.
 */
export const STATIC_ACCESS_EXPIRES_AT = null;

/** Resolution of `grants.last_used_at`, so verify is not a write on every request. */
export const LAST_USED_RESOLUTION_SECONDS = 60;

/** The longest a grant label may be; `createGrant` trims to it. */
export const MAX_LABEL_LENGTH = 40;

/* --------------------------------------------------------------- secrets */

/** Prefixes make a leaked token greppable and its kind checkable before any lookup. */
export const TOKEN_PREFIXES = {
  writer: "sw_",
  /** read-only */
  viewer: "sv_",
  /** refresh token, either kind of grant */
  refresh: "sr_",
} as const;

export const ACCESS_TOKEN_PREFIXES = [TOKEN_PREFIXES.writer, TOKEN_PREFIXES.viewer] as const;

/* ---------------------------------------------------------------- scopes */

export const SCOPES = {
  pagesRead: "pages:read",
  pagesWrite: "pages:write",
  namespacePair: "namespace:pair",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

export const SUPPORTED_SCOPES: readonly Scope[] = [
  SCOPES.pagesRead,
  SCOPES.pagesWrite,
  SCOPES.namespacePair,
];

/** What a writer grant gets unless the caller asked for less. */
export const DEFAULT_WRITER_SCOPES: readonly Scope[] = [
  SCOPES.pagesRead,
  SCOPES.pagesWrite,
  SCOPES.namespacePair,
];
/** Viewers read only; `kind` enforces this separately. */
export const VIEWER_SCOPES: readonly Scope[] = [SCOPES.pagesRead];

/**
 * Allowed drivers. `grants.driver` is `text` so adding one needs no migration, but the list stays
 * closed because the value is shown in the person's agent list.
 */
export const DRIVERS = [
  "instinct",
  "claude-code",
  "claude",
  "chatgpt",
  "strata-mobile",
  "generic",
  "other",
] as const;

export function parseScope(scope: string): string[] {
  return [...new Set(scope.split(/\s+/u).filter((entry) => entry !== ""))];
}

/** RFC 6749 `scope` string; the only place scopes are joined. */
export function formatScope(scope: readonly string[]): string {
  return scope.join(" ");
}

export function scopeSatisfies(
  granted: string | readonly string[],
  required: readonly string[],
): boolean {
  const held = new Set(typeof granted === "string" ? parseScope(granted) : granted);
  return required.every((entry) => held.has(entry));
}
