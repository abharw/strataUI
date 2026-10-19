/** What is stored about a request source: keyed digests only, never reversible to an address. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import { emailPseudonym, requestSource, requestSourcePseudonym, requestUserAgent } from "./request-source";

const KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);
let previous: string | undefined;

beforeEach(() => {
  previous = process.env.STRATA_SOURCE_HASH_KEY;
  process.env.STRATA_SOURCE_HASH_KEY = KEY;
});

afterEach(() => {
  if (previous === undefined) delete process.env.STRATA_SOURCE_HASH_KEY;
  else process.env.STRATA_SOURCE_HASH_KEY = previous;
});

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://strata.test/v1/auth/start", { method: "POST", headers });
}

describe("requestSource", () => {
  it("takes the address the platform computed", () => {
    expect(requestSource(request({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("does not take a forwarding header the caller wrote", () => {
    // Only `x-real-ip`, which Vercel's proxy sets and overwrites, is trusted.
    expect(requestSource(request({ "x-forwarded-for": "198.51.100.9" }))).toBeUndefined();
    expect(requestSource(request())).toBeUndefined();
  });
});

describe("the pseudonyms that are actually stored", () => {
  it("separates the two purposes, so one bucket cannot be read from the other", () => {
    const from = request({ "x-real-ip": "203.0.113.7" });
    expect(requestSourcePseudonym(from, "auth-start"))
      .not.toBe(requestSourcePseudonym(from, "auth-verify"));
  });

  it("keys the email digest rather than hashing the address bare", () => {
    const email = "Ada@Strata.test";
    const keyed = emailPseudonym(email);

    expect(keyed).toHaveLength(64);
    // An unsalted sha256 of an address is not a pseudonym.
    expect(keyed).not.toBe(createHash("sha256").update("ada@strata.test").digest("hex"));
    // Canonicalized, so every consumer agrees on which address this was.
    expect(emailPseudonym("  ada@strata.test ")).toBe(keyed);
    // Domain-separated from the source digest under the same key.
    expect(keyed).not.toBe(requestSourcePseudonym(request({ "x-real-ip": email }), "auth-start"));

    process.env.STRATA_SOURCE_HASH_KEY = OTHER_KEY;
    expect(emailPseudonym(email)).not.toBe(keyed);
  });

  it("refuses to enforce a quota it cannot key safely", () => {
    delete process.env.STRATA_SOURCE_HASH_KEY;
    expect(() => emailPseudonym("ada@strata.test")).toThrow(/STRATA_SOURCE_HASH_KEY/);
    process.env.STRATA_SOURCE_HASH_KEY = "too-short";
    expect(() => emailPseudonym("ada@strata.test")).toThrow(/32 bytes/);
  });
});

describe("requestUserAgent", () => {
  it("bounds what the caller says about itself", () => {
    expect(requestUserAgent(request({ "user-agent": "  curl/8  " }))).toBe("curl/8");
    expect(requestUserAgent(request({ "user-agent": "x".repeat(900) }))).toHaveLength(512);
    expect(requestUserAgent(request())).toBeUndefined();
  });
});
