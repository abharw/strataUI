/** The accepted set for `DisplayValueSchema`. */
import { describe, expect, it } from "vitest";

import { DisplayValueSchema, NumericValueSchema } from "./values";

describe("DisplayValueSchema", () => {
  it("takes both the scalar and the typed forms", () => {
    for (const value of [
      "14:05",
      "2026-08-21T18:30:00-07:00",
      0,
      true,
      { value: 6.75, unit: "h" },
      { value: 3 },
      { amount: 412, currency: "USD" },
    ]) {
      expect(DisplayValueSchema.safeParse(value).success, JSON.stringify(value)).toBe(true);
    }
  });

  it("refuses everything else, and says which shapes it accepts", () => {
    for (const value of [null, [1, 2], { value: 6.75, unit: "h", extra: 1 }, { amount: 412 }]) {
      expect(DisplayValueSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
    }
    const result = DisplayValueSchema.safeParse({ amount: 412, currency: "dollars" });
    expect(result.success).toBe(false);
    if (!result.success) {
      // A specific message rather than zod's "Invalid input".
      expect(result.error.issues[0]?.message).toContain("ISO 4217");
    }
  });

  it("holds a quantity unit to a label rather than a second prose channel", () => {
    expect(DisplayValueSchema.safeParse({ value: 1, unit: "x".repeat(32) }).success).toBe(true);
    expect(DisplayValueSchema.safeParse({ value: 1, unit: "x".repeat(33) }).success).toBe(false);
  });
});

describe("NumericValueSchema", () => {
  it("excludes the shapes there is nothing to divide", () => {
    expect(NumericValueSchema.safeParse({ value: 6.75, unit: "h" }).success).toBe(true);
    expect(NumericValueSchema.safeParse({ amount: 412, currency: "USD" }).success).toBe(true);
    expect(NumericValueSchema.safeParse(11).success).toBe(true);
    expect(NumericValueSchema.safeParse("12 kg").success).toBe(false);
    expect(NumericValueSchema.safeParse(true).success).toBe(false);
  });
});
