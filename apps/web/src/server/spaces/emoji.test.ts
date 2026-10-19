import { describe, expect, it } from "vitest";

import { SpaceEmojiSchema, isSingleEmoji, normalizeSpaceEmoji } from "./emoji";

describe("a Space emoji", () => {
  it("accepts one complete grapheme, however many code points it takes", () => {
    for (const emoji of ["🚀", "✈️", "🗂️", "🧳", "👨‍👩‍👧‍👦", "🏳️‍🌈", "👍🏽", "1️⃣", "🇵🇹", "🐦‍🔥"]) {
      expect(isSingleEmoji(emoji)).toBe(true);
    }
  });

  it("refuses text, whitespace, emptiness, and a second emoji", () => {
    for (const value of ["", " ", "ab", "🚀🚀", "🚀 ", " 🚀", "a🚀", "🚀‍"]) {
      expect(isSingleEmoji(value)).toBe(false);
    }
  });

  it("refuses a text-presentation character until it carries U+FE0F", () => {
    expect(isSingleEmoji("❤")).toBe(false);
    expect(isSingleEmoji("❤️")).toBe(true);
    expect(isSingleEmoji("©")).toBe(false);
  });

  it("takes a bare text-presentation character and stores the emoji spelling", () => {
    // Agents type `❤`; renderers need `❤️`. The schema adds the variation selector.
    for (const [typed, stored] of [
      ["❤", "❤\uFE0F"],
      ["☀", "☀\uFE0F"],
      ["©", "©\uFE0F"],
      ["✈", "✈\uFE0F"],
    ]) {
      expect(SpaceEmojiSchema.parse(typed)).toBe(stored);
    }
  });

  it("leaves an emoji that already carries its selector exactly as sent", () => {
    for (const emoji of ["🚀", "❤\uFE0F", "👨‍👩‍👧‍👦", "🏳️‍🌈", "👍🏽", "1️⃣", "🇵🇹"]) {
      expect(SpaceEmojiSchema.parse(emoji)).toBe(emoji);
    }
  });

  it("hands back anything a selector cannot rescue, so the same refusal stands", () => {
    for (const value of ["", " ", "launch", "ab", "1", "🚀🚀", "a🚀", "1\u20E3"]) {
      expect(normalizeSpaceEmoji(value)).toBe(value);
      expect(SpaceEmojiSchema.safeParse(value).success).toBe(false);
    }
  });

  it("names the rule when the schema refuses", () => {
    const refusal = SpaceEmojiSchema.safeParse("launch");
    expect(refusal.success).toBe(false);
    expect(refusal.error?.issues[0]?.message).toBe(
      "A Space emoji must be exactly one complete Unicode emoji.",
    );
  });
});
