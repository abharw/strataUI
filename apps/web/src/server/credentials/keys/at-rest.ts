/**
 * Capability keys sealed at rest with AES-256-GCM under STRATA_URL_KEY (32 bytes hex), because a
 * stored read key is the capability. Only the key is stored; URLs are built per request origin.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Marks a sealed value. A stored key either starts with this or is bare plaintext. */
const PREFIX = "enc.v1.";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class UrlKeyError extends Error {}

let cached: Buffer | null = null;
let cachedOld: Buffer | null | undefined = undefined;

function parse(raw: string, name: string): Buffer {
  const bytes = Buffer.from(raw.trim(), "hex");
  if (bytes.length !== 32) {
    throw new UrlKeyError(`${name} must be 32 bytes of hex; got ${bytes.length}.`);
  }
  return bytes;
}

function key(): Buffer {
  if (cached !== null) return cached;
  const raw = process.env.STRATA_URL_KEY;
  if (raw === undefined || raw === "") {
    throw new UrlKeyError("STRATA_URL_KEY is not set; capability keys cannot be sealed or opened.");
  }
  cached = parse(raw, "STRATA_URL_KEY");
  return cached;
}

/**
 * The key being rotated out; decrypt only. To rotate: set STRATA_URL_KEY_OLD to the current key and
 * STRATA_URL_KEY to the new one, run scripts/rewrap-sealed-keys.ts, then unset STRATA_URL_KEY_OLD.
 */
function oldKey(): Buffer | null {
  if (cachedOld !== undefined) return cachedOld;
  const raw = process.env.STRATA_URL_KEY_OLD;
  cachedOld = raw === undefined || raw === "" ? null : parse(raw, "STRATA_URL_KEY_OLD");
  return cachedOld;
}

/** The primary key, for deriving other keys (asset URL signing). Never sign with it directly. */
export function urlKeyBytes(): Buffer {
  return key();
}

/**
 * The key being rotated out, for derivers. Signatures need the same fallback as sealed rows, or
 * outstanding upload and serving URLs stop verifying mid-rotation.
 */
export function previousUrlKeyBytes(): Buffer | null {
  return oldKey();
}

/** Test only: forget the parsed keys so a changed environment is picked up. */
export function resetUrlKey(): void {
  cached = null;
  cachedOld = undefined;
}

/** True when the stored value is sealed. Older rows may be plaintext. */
export function isSealed(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

export function sealKey(key_: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(key_, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

function decrypt(raw: Buffer, with_: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", with_, raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)).toString("utf8") + decipher.final("utf8");
}


/**
 * Open a stored key. Unsealed values pass through so reads work during a backfill. The rotating-out
 * key is tried second; GCM authenticates, so a wrong key fails rather than returning garbage.
 */
export function openKey(stored: string): string {
  if (!isSealed(stored)) return stored;
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64url");
  if (raw.length <= IV_BYTES + TAG_BYTES) {
    throw new UrlKeyError("Sealed key is too short to contain an IV, a tag, and a body.");
  }
  try {
    return decrypt(raw, key());
  } catch (error) {
    const previous = oldKey();
    if (previous === null || error instanceof UrlKeyError) throw error;
    try {
      return decrypt(raw, previous);
    } catch {
      throw new UrlKeyError("Sealed key does not open with the current at-rest key or the one being rotated out.");
    }
  }
}

/** `openKey` that logs and returns null, so one unreadable key costs a link, not the page list. */
export function openKeyOrNull(stored: string): string | null {
  try {
    return openKey(stored);
  } catch (error) {
    console.error("capability key would not open:", error instanceof Error ? error.message : String(error));
    return null;
  }
}
