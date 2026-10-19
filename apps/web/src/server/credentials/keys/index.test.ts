import { describe, expect, it } from "vitest";

import { constantTimeEquals, generateSecret, hasKeyPrefix, KEY_PREFIXES, pageUrl, SECRET_BYTES, sha256Hex, shareOgImageUrl, spaceUrl, verifyHash } from "./index";

describe("generateSecret", () => {
  it("prefixes each kind so a leaked string is greppable and mis-presented keys are recognisable", () => {
    expect(KEY_PREFIXES).toEqual({
      page: "pgk_",
      space: "spk_",
    });

    for (const [kind, prefix] of Object.entries(KEY_PREFIXES)) {
      const secret = generateSecret(kind as keyof typeof KEY_PREFIXES);
      expect(secret.startsWith(prefix)).toBe(true);
      expect(hasKeyPrefix(secret, kind as keyof typeof KEY_PREFIXES)).toBe(true);
    }
  });

  it("carries 32 bytes of entropy, base64url encoded", () => {
    const body = generateSecret("page").slice(KEY_PREFIXES.page.length);
    // base64url only: no +, / or = padding, so it survives a URL path segment.
    expect(body).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(body, "base64url")).toHaveLength(SECRET_BYTES);
  });

  it("never repeats", () => {
    const seen = new Set(
      Array.from({ length: 200 }, () => generateSecret("space")),
    );
    expect(seen.size).toBe(200);
  });
});

describe("verifyHash", () => {
  it("accepts the matching secret and rejects everything else", () => {
    const secret = generateSecret("page");
    const hash = sha256Hex(secret);

    expect(verifyHash(secret, hash)).toBe(true);
    expect(verifyHash(generateSecret("page"), hash)).toBe(false);
    // A one-character difference in the presented secret.
    expect(verifyHash(secret + "x", hash)).toBe(false);
    expect(verifyHash(secret.slice(0, -1), hash)).toBe(false);
  });

  it("does not throw on wrong-length input — the digests compared are always 32 bytes", () => {
    // Hashing both sides avoids the length check that would skip the constant-time path.
    const hash = sha256Hex(generateSecret("space"));
    expect(() => verifyHash("", hash)).not.toThrow();
    expect(verifyHash("", hash)).toBe(false);
    expect(() => verifyHash("x".repeat(5000), hash)).not.toThrow();
    expect(verifyHash(generateSecret("space"), "")).toBe(false);
    expect(verifyHash(generateSecret("space"), "not-a-hash")).toBe(false);
  });
});

describe("URL builders", () => {
  const base = "https://strata.example";

  it("builds the shapes in the §4.4 route table", () => {
    expect(pageUrl(base, "pgk_key")).toBe("https://strata.example/share/pgk_key");
    expect(spaceUrl(base, "spk_key")).toBe("https://strata.example/share/spk_key");
    expect(shareOgImageUrl(base, "pgk_key")).toBe("https://strata.example/share/pgk_key/og/image");
  });

  it("keeps the page id out of a share link — the key resolves the page", () => {
    expect(pageUrl(base, "pgk_key")).not.toContain("abc-123");
    // Page and Space share links have the same shape.
    expect(pageUrl(base, "k").replace("/share/k", "")).toBe(
      spaceUrl(base, "k").replace("/share/k", ""),
    );
  });

  it("hangs the unfurl off the share address, so a bare page id previews nothing", () => {
    const key = generateSecret("page");
    const og = shareOgImageUrl(base, key);
    expect(pageUrl(base, key)).toContain(key);
    // The preview uses the same capability as the page.
    expect(og.startsWith(`${pageUrl(base, key)}/`)).toBe(true);
    expect(og).not.toContain("/p/");
  });

  it("tolerates a trailing slash on the base", () => {
    expect(pageUrl("https://strata.example/", "k")).toBe("https://strata.example/share/k");
    expect(spaceUrl("https://strata.example///", "k")).toBe("https://strata.example/share/k");
  });
});

describe("constantTimeEquals", () => {
  it("compares equal and unequal strings of every length", () => {
    expect(constantTimeEquals("cron-secret", "cron-secret")).toBe(true);
    expect(constantTimeEquals("cron-secret", "cron-secreT")).toBe(false);
    expect(constantTimeEquals("", "")).toBe(true);
    // A length-guarded `timingSafeEqual` would answer these from the length alone.
    expect(constantTimeEquals("short", "much-longer-value")).toBe(false);
    expect(constantTimeEquals("much-longer-value", "short")).toBe(false);
    expect(constantTimeEquals("", "x")).toBe(false);
  });

  it("does not throw on a length mismatch, the way timingSafeEqual does", () => {
    expect(() => constantTimeEquals("a", "bbbbbbbbbbbbbbbb")).not.toThrow();
  });
});
