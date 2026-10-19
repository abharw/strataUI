import { describe, expect, it } from "vitest";

import { seriesDash } from "./series";

describe("chart series identity", () => {
  it("leaves one and two series as solid strokes", () => {
    expect(seriesDash(0, 1)).toBeUndefined();
    expect(seriesDash(0, 2)).toBeUndefined();
    expect(seriesDash(1, 2)).toBeUndefined();
  });

  it("gives three crossing series something other than shade to be told apart by", () => {
    const dashes = [0, 1, 2].map((index) => seriesDash(index, 3));
    expect(dashes[0]).toBeUndefined();
    expect(dashes[1]).toBeDefined();
    expect(dashes[2]).toBeDefined();
    expect(new Set(dashes).size).toBe(3);
  });

  it("keeps five series distinct, and each one's pattern stable", () => {
    const dashes = [0, 1, 2, 3, 4].map((index) => seriesDash(index, 5));
    expect(new Set(dashes).size).toBe(5);
    expect(seriesDash(2, 5)).toBe(dashes[2]);
    // Past the pattern count, dashes repeat.
    expect(seriesDash(5, 6)).toBe(seriesDash(1, 6));
  });
});
