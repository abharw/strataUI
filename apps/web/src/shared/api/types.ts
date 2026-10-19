/**
 * Transport-neutral handler results and the shared error body. Handlers never touch HTTP beyond
 * `status`, so each transport is a thin adapter over the same functions.
 */
import { PAGE_ID_RE } from "@/page-content/document/types";
import { recoveryFor } from "./recovery";
import { CONTRACT_VERSION } from "./version";

/**
 * Error body. `error` is prose for the model; `code` is the stable handle to match on. `errors`
 * lists every independent problem in one request so an agent can fix them in one round trip.
 */
export interface ApiError {
  /** Prose the model can act on. */
  error: string;
  /** Stable machine handle for the same failure. */
  code: string;
  /** OAuth-style detail. Only the credential endpoints set it. */
  error_description?: string;
  /** The affected JSON Pointer, when there is one. */
  path?: string;
  /** The closed set of valid alternatives, when there is one. */
  valid?: readonly (string | number | boolean)[];
  /** The next tool(s) to call. Never empty. */
  next: readonly string[];
  /** Every other problem found in the same request, same shape. */
  errors?: readonly ApiError[];
  /** The current state that made this request stale, so the caller can retry against it directly. */
  current?: Record<string, unknown>;
  /**
   * The full next call, for failures where the caller cannot look one up (for example a revoked
   * credential that can no longer read `/v1/guide`).
   */
  recover?: {
    method: string;
    path: string;
    body?: Record<string, unknown>;
    /** What to do with the response, in one line. */
    then: string;
  };
  /** The plausible wrong move this failure invites, such as retrying a spent one-time code. */
  avoid?: string;
  /** On `contract_changed` only: the caller's learned version and the changes since, oldest first. */
  learned?: string;
  changes?: readonly string[];
  /** The contract version this body was written against, so long-lived agents notice changes. */
  contract_version?: string;
}

/** What every handler returns: an HTTP status and a plain JSON-able object. */
export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
  /** Transport metadata used sparingly by the REST adapter (for example OAuth challenges). */
  headers?: Readonly<Record<string, string>>;
}

export function ok(body: Record<string, unknown>, status = 200): HandlerResult {
  return { status, body: { ...body, contract_version: CONTRACT_VERSION } };
}

/**
 * Builds a failure with `recover` and `avoid` from the recovery table that also renders the
 * discovery docs. A caller-supplied `recover` wins. `recover.path` stays relative; the HTTP
 * layer prefixes the origin.
 */
export function fail(
  status: number,
  error: Omit<ApiError, "errors">,
  rest: readonly ApiError[] = [],
): HandlerResult {
  const body: ApiError = { ...withRecovery(error), contract_version: CONTRACT_VERSION };
  if (rest.length > 0) body.errors = rest.map(withRecovery);
  return { status, body: body as unknown as Record<string, unknown> };
}

/** Attaches `recover` and `avoid` from the table without overwriting either. */
function withRecovery<T extends Omit<ApiError, "errors">>(error: T): T {
  const entry = recoveryFor(error.code);
  if (entry === undefined) return error;
  const recover = error.recover ?? (entry.recover === null ? undefined : entry.recover);
  const avoid = error.avoid ?? entry.avoid;
  // OAuth-style bodies put the wire token in `error` (RFC 8628, `invalid_grant`), so the prose
  // goes in `error_description`, taken from the table.
  const description = error.error === error.code
    ? error.error_description ?? entry.truth
    : error.error_description;
  return {
    ...error,
    ...(description === undefined ? {} : { error_description: description }),
    ...(recover === undefined ? {} : { recover }),
    ...(avoid === undefined ? {} : { avoid }),
  };
}

/* -------------------------------------------------------------- id shape */

/**
 * Postgres errors on a malformed uuid instead of returning no rows, so check shape before lookups.
 * Returns a plain boolean: a type predicate would narrow the false branch of a string to `never`.
 */
export function isUuid(value: unknown): boolean {
  return typeof value === "string" && PAGE_ID_RE.test(value);
}

/**
 * The namespace was deleted between authentication and commit. Answers 401, as authentication
 * would a moment later, rather than a retryable 500.
 */
export function namespaceGone(): HandlerResult {
  return fail(401, {
    error: "That namespace no longer exists. A credential dies with it, so this one cannot be used again.",
    code: "namespace_gone",
    next: ["get_guide"],
  });
}
