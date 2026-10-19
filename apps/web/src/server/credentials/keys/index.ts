/**
 * Read-capability secrets and the URLs they live in. Pure: no database, no environment. Page keys
 * and space keys are independently revocable; only their sha256 hashes are persisted.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/* ---------------------------------------------------------------- secrets */

/** 32 bytes of CSPRNG entropy per secret. */
export const SECRET_BYTES = 32;

/** Prefixes make a leaked key greppable and let a `pgk_` in `Authorization:` be rejected early. */
export const KEY_PREFIXES = {
  /** page read key, the one that travels in texted links */
  page: "pgk_",
  /** space read key, for a shared Space */
  space: "spk_",
} as const;

export type KeyKind = keyof typeof KEY_PREFIXES;

/** Mint `<prefix><32 random bytes, base64url>`; base64url survives URL paths and copy/paste. */
export function generateSecret(kind: KeyKind): string {
  return KEY_PREFIXES[kind] + randomBytes(SECRET_BYTES).toString("base64url");
}

/** Shape check only, not auth. */
export function hasKeyPrefix(secret: string, kind: KeyKind): boolean {
  return secret.startsWith(KEY_PREFIXES[kind]);
}

/* ----------------------------------------------------------------- hashing */

/** sha256 of a secret, lowercase hex. This is the only form that reaches Postgres. */
export function sha256Hex(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/**
 * Constant-time check of a secret against a stored sha256 hex hash. Hashing both sides fixes the
 * length at 32 bytes, so neither length nor `timingSafeEqual`'s length throw leaks anything.
 */
export function verifyHash(secret: string, hash: string): boolean {
  return constantTimeEquals(sha256Hex(secret), hash);
}

/** Constant-time equality of two arbitrary strings (cron secret, asset MAC) via digest compare. */
export function constantTimeEquals(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a, "utf8").digest(),
    createHash("sha256").update(b, "utf8").digest(),
  );
}

/* ------------------------------------------------------------ URL builders */

// These builders are the only place a key, a path and an origin are joined into a capability URL.

/** Trim trailing slashes so `https://x/` and `https://x` build identical URLs. */
function origin(base: string): string {
  return base.replace(/\/+$/, "");
}

/** `GET /share/:key`. No page id in the path; the key alone resolves the page by its hash. */
export function pageUrl(base: string, key: string): string {
  return `${origin(base)}/share/${key}`;
}

/** `GET /share/:key` for a shared Space, read-only. */
export function spaceUrl(base: string, key: string): string {
  return `${origin(base)}/share/${key}`;
}

/** `GET /share/:key/og/image`. Lives under the share key so a bare page id reveals nothing. */
export function shareOgImageUrl(base: string, key: string): string {
  return `${pageUrl(base, key)}/og/image`;
}
