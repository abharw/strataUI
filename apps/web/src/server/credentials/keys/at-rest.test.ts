/**
 * Sealed keys must not resemble the plaintext or carry its `pgk_`/`spk_` prefix, tampered rows must
 * not open, and unsealed rows must still read.
 */
import { afterEach, describe, expect, it } from "vitest";

import { isSealed, openKey, openKeyOrNull, resetUrlKey, sealKey, UrlKeyError } from "./at-rest";

const KEY = "pgk_o--IvZmekgizhMPjNO_VEOqPUf9nP3Fj8hHRmVvQkTs";

function withKey(hex: string, run: () => void): void {
  process.env.STRATA_URL_KEY = hex;
  resetUrlKey();
  run();
}

afterEach(() => {
  delete process.env.STRATA_URL_KEY;
  delete process.env.STRATA_URL_KEY_OLD;
  resetUrlKey();
});

describe("capability keys at rest", () => {
  it("round-trips", () => {
    withKey("a".repeat(64), () => {
      const sealed = sealKey(KEY);
      expect(sealed).not.toContain("pgk_");
      expect(isSealed(sealed)).toBe(true);
      expect(openKey(sealed)).toBe(KEY);
    });
  });

  it("never produces the same ciphertext twice", () => {
    withKey("a".repeat(64), () => {
      expect(sealKey(KEY)).not.toBe(sealKey(KEY));
    });
  });

  it("refuses a tampered body", () => {
    withKey("a".repeat(64), () => {
      const sealed = sealKey(KEY);
      const broken = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
      expect(() => openKey(broken)).toThrow();
    });
  });

  it("refuses the wrong key", () => {
    let sealed = "";
    withKey("a".repeat(64), () => { sealed = sealKey(KEY); });
    withKey("b".repeat(64), () => { expect(() => openKey(sealed)).toThrow(); });
  });

  it("passes a bare plaintext row through untouched", () => {
    withKey("a".repeat(64), () => {
      expect(isSealed(KEY)).toBe(false);
      expect(openKey(KEY)).toBe(KEY);
    });
  });

  it("says so plainly when the key is missing or the wrong size", () => {
    delete process.env.STRATA_URL_KEY;
    resetUrlKey();
    expect(() => sealKey(KEY)).toThrow(UrlKeyError);
    withKey("abcd", () => {
      expect(() => sealKey(KEY)).toThrow(/32 bytes/);
    });
  });

  it("opens a row sealed with the key being rotated out", () => {
    let sealed = "";
    withKey("a".repeat(64), () => { sealed = sealKey(KEY); });
    process.env.STRATA_URL_KEY_OLD = "a".repeat(64);
    withKey("b".repeat(64), () => {
      expect(openKey(sealed)).toBe(KEY);
      // And a new write goes out under the new key, so the rewrap converges.
      const fresh = sealKey(KEY);
      delete process.env.STRATA_URL_KEY_OLD;
      resetUrlKey();
      process.env.STRATA_URL_KEY = "b".repeat(64);
      expect(openKey(fresh)).toBe(KEY);
    });
  });

  it("still refuses a row that opens with neither key", () => {
    let sealed = "";
    withKey("a".repeat(64), () => { sealed = sealKey(KEY); });
    process.env.STRATA_URL_KEY_OLD = "c".repeat(64);
    withKey("b".repeat(64), () => {
      expect(() => openKey(sealed)).toThrow(UrlKeyError);
    });
  });

  it("loses one link rather than the whole list when a row will not open", () => {
    let sealed = "";
    withKey("a".repeat(64), () => { sealed = sealKey(KEY); });
    withKey("b".repeat(64), () => {
      expect(openKeyOrNull(sealed)).toBeNull();
      expect(openKeyOrNull(sealKey(KEY))).toBe(KEY);
    });
  });

  it("does not swallow a missing key silently in the sealing path", () => {
    delete process.env.STRATA_URL_KEY;
    resetUrlKey();
    expect(openKeyOrNull("enc.v1.notarealbody")).toBeNull();
  });
});
