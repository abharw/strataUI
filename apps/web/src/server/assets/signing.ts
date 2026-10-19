/**
 * Signed asset URLs: one-shot upload URLs and short-lived serving URLs minted per render. Both are
 * HMACs over asset id and expiry, keyed from STRATA_URL_KEY with domain separation so the AES-GCM key
 * is never reused as a MAC key and upload signatures cannot be replayed as serving ones.
 */
import { createHmac } from "node:crypto";

import { constantTimeEquals } from "@/server/credentials/keys";
import { previousUrlKeyBytes, urlKeyBytes } from "@/server/credentials/keys/at-rest";

export type SignatureKind = "upload" | "serve";

/** Derived from the URL key so signing and encryption use different secrets from one deployed key. */
function signingKey(material: Buffer): Buffer {
  return createHmac("sha256", material).update("strata:asset-signing:v1\0", "utf8").digest();
}

function mac(kind: SignatureKind, assetId: string, expiresAt: number, material: Buffer): string {
  return createHmac("sha256", signingKey(material))
    .update(`strata:asset:${kind}\0`, "utf8")
    .update(`${assetId}\0${String(expiresAt)}`, "utf8")
    .digest("base64url");
}

/**
 * Signs one address until `expiresAt` (unix seconds). Upload URLs use the row's `upload_expires_at`,
 * so moving that window invalidates earlier links.
 */
export function sign(kind: SignatureKind, assetId: string, expiresAt: number): string {
  return mac(kind, assetId, expiresAt, urlKeyBytes());
}

/**
 * Constant-time check of kind, asset and expiry. Signatures under the outgoing key (STRATA_URL_KEY_OLD)
 * still verify, so in-flight URLs survive a key rotation.
 */
export function verify(
  kind: SignatureKind,
  assetId: string,
  expiresAt: number,
  signature: string,
  now = Date.now(),
): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < now) return false;
  if (constantTimeEquals(mac(kind, assetId, expiresAt, urlKeyBytes()), signature)) return true;
  const previous = previousUrlKeyBytes();
  if (previous === null) return false;
  return constantTimeEquals(mac(kind, assetId, expiresAt, previous), signature);
}
