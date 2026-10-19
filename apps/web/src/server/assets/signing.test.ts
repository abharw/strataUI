/**
 * Asset signatures survive the middle step of a key rotation (both keys set; see
 * `server/credentials/keys/at-rest.ts`), use a MAC key distinct from the encryption key, and
 * cannot be replayed across purposes.
 */
import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { resetUrlKey } from "@/server/credentials/keys/at-rest";
import { sign, verify } from "./signing";

const ASSET = "b3f0a1c2-77c5-4d0e-9a1b-2f5e8c4d6a70";

/** An absolute expiry, as the row that owns the window stores it. */
function at(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

const A = "a".repeat(64);
const B = "b".repeat(64);

function setKeys(primary: string, previous?: string): void {
  process.env.STRATA_URL_KEY = primary;
  if (previous === undefined) delete process.env.STRATA_URL_KEY_OLD;
  else process.env.STRATA_URL_KEY_OLD = previous;
  resetUrlKey();
}

afterEach(() => {
  delete process.env.STRATA_URL_KEY;
  delete process.env.STRATA_URL_KEY_OLD;
  resetUrlKey();
});

describe("asset signatures", () => {
  it("verifies what it signed", () => {
    setKeys(A);
    const expires = at(300);
    expect(verify("serve", ASSET, expires, sign("serve", ASSET, expires))).toBe(true);
  });

  it("will not let an upload signature serve, or the reverse", () => {
    setKeys(A);
    const expires = at(900);
    expect(verify("serve", ASSET, expires, sign("upload", ASSET, expires))).toBe(false);
    expect(verify("upload", ASSET, expires, sign("serve", ASSET, expires))).toBe(false);
  });

  it("refuses another asset, a stretched expiry, and an expired one", () => {
    setKeys(A);
    const expires = at(300);
    const signature = sign("serve", ASSET, expires);
    expect(verify("serve", "0f8d3b19-1f5c-4d84-9d0e-1a2b3c4d5e6f", expires, signature)).toBe(false);
    expect(verify("serve", ASSET, expires + 600, signature)).toBe(false);
    expect(verify("serve", ASSET, expires, signature, (expires + 1) * 1000)).toBe(false);
  });

  it("does not sign with the encryption key itself", () => {
    setKeys(A);
    const expires = at(300);
    const rawKeyMac = createHmac("sha256", Buffer.from(A, "hex"))
      .update("strata:asset:serve\0", "utf8")
      .update(`${ASSET}\0${String(expires)}`, "utf8")
      .digest("base64url");
    expect(sign("serve", ASSET, expires)).not.toBe(rawKeyMac);
  });

  it("still honours a URL minted before the rotation, while the old key is set", () => {
    setKeys(A);
    const expires = at(300);
    const before = sign("serve", ASSET, expires);

    setKeys(B, A);
    expect(verify("serve", ASSET, expires, before)).toBe(true);

    const after = sign("serve", ASSET, expires);
    expect(verify("serve", ASSET, expires, after)).toBe(true);
    expect(after).not.toBe(before);
  });

  it("stops honouring it once the old key is dropped", () => {
    setKeys(A);
    const expires = at(300);
    const before = sign("serve", ASSET, expires);

    setKeys(B);
    expect(verify("serve", ASSET, expires, before)).toBe(false);
  });

  it("signs with the primary key only, so the grace window closes by itself", () => {
    setKeys(B, A);
    const expires = at(300);
    const signature = sign("serve", ASSET, expires);

    setKeys(B);
    expect(verify("serve", ASSET, expires, signature)).toBe(true);
  });
});
