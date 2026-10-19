import { describe, expect, it } from "vitest";

import { schema } from "./schema";

describe("progress schema", () => {
  it("accepts a positive target in any numeric shape", () => {
    expect(schema.safeParse({ label: "Hours", current: 8.5, target: 11 }).success).toBe(true);
    expect(
      schema.safeParse({
        label: "Hours",
        current: { value: 8.5, unit: "h" },
        target: { value: 11, unit: "h" },
      }).success,
    ).toBe(true);
  });

  it("accepts a semantic target date", () => {
    expect(schema.safeParse({ label: "Hours", current: 8, target: 11, target_at: "2026-08-30" }).success).toBe(true);
  });

  it("takes a lower-is-better target with the start it comes down from", () => {
    const result = schema.safeParse({
      label: "Magic mile",
      current: { value: 5.87, unit: "min" },
      target: { value: 5.75, unit: "min" },
      start: { value: 6.4, unit: "min" },
      direction: "lower",
    });
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it("defaults to higher, so start stays optional when direction is unset", () => {
    expect(schema.safeParse({ label: "Hours", current: 8, target: 11 }).success).toBe(true);
    expect(
      schema.safeParse({ label: "Hours", current: 8, target: 11, direction: "higher" }).success,
    ).toBe(true);
  });

  it("refuses direction lower without a start, because there is nothing to measure the fall from", () => {
    const result = schema.safeParse({
      label: "Magic mile",
      current: { value: 5.87, unit: "min" },
      target: { value: 5.75, unit: "min" },
      direction: "lower",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["start"]);
      expect(result.error.issues[0]?.message).toContain("start");
    }
  });

  it("refuses a zero or negative target, pointing at metric", () => {
    for (const target of [0, -3, { value: 0, unit: "h" }]) {
      const result = schema.safeParse({ label: "Hours", current: 2, target });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("metric");
      }
    }
  });
});
