import { createHmac } from "node:crypto";

import { ipAddress } from "@vercel/functions/headers";

const HEX_KEY = /^[a-fA-F0-9]{64}$/;
const BASE64URL_KEY = /^[A-Za-z0-9_-]{43}$/;

/** Anything with request headers: a route's `Request` or a Server Action's `headers()`. */
export interface HeaderCarrier { headers: { get(name: string): string | null } }

export type RequestSourcePurpose =
  /** `POST /v1/auth/start`: requesting a code needs no credential. */
  | "auth-start"
  /** `POST /v1/auth/verify`: the failure budget against code guessing. */
  | "auth-verify";

/**
 * A stable, purpose-separated keyed digest of the request source. Only the digest is stored, so
 * `rate_limit_events` never becomes a list of who asked.
 */
export function requestSourcePseudonym(
  request: HeaderCarrier,
  purpose: RequestSourcePurpose,
): string {
  const source = requestSource(request) ?? "unknown";

  return createHmac("sha256", sourceHashKey())
    .update("strata:request-source:v1\0", "utf8")
    .update(purpose, "utf8")
    .update("\0", "utf8")
    .update(source, "utf8")
    .digest("hex");
}

/**
 * The client IP, unhashed. `ipAddress` reads `x-real-ip`, which Vercel's proxy sets and overwrites.
 * Only passed through to the identity provider's abuse signals; never stored.
 */
export function requestSource(request: HeaderCarrier): string | undefined {
  const source = ipAddress(request)?.trim();
  return source === undefined || source === "" ? undefined : source;
}

/**
 * Keyed HMAC of an email for rate-limit buckets. A bare `sha256(email)` is reversible with an
 * address corpus. Shares the source key, so rotating it resets both sets of windows.
 */
export function emailPseudonym(email: string): string {
  return createHmac("sha256", sourceHashKey())
    .update("strata:auth-email:v1\0", "utf8")
    .update(email.trim().toLowerCase(), "utf8")
    .digest("hex");
}

/** The caller's User-Agent, truncated to 512 chars. Passed on, never stored. */
export function requestUserAgent(request: HeaderCarrier): string | undefined {
  const agent = request.headers.get("user-agent")?.trim();
  return agent === undefined || agent === "" ? undefined : agent.slice(0, 512);
}

function sourceHashKey(): Buffer {
  const raw = process.env.STRATA_SOURCE_HASH_KEY;
  if (raw === undefined || raw === "") {
    throw new Error(
      "STRATA_SOURCE_HASH_KEY is not set; request-source quotas cannot be enforced safely.",
    );
  }
  if (HEX_KEY.test(raw)) return Buffer.from(raw, "hex");
  if (BASE64URL_KEY.test(raw)) {
    const decoded = Buffer.from(raw, "base64url");
    if (decoded.length === 32) return decoded;
  }
  throw new Error(
    "STRATA_SOURCE_HASH_KEY must be exactly 32 bytes encoded as 64 hex or 43 base64url characters.",
  );
}
