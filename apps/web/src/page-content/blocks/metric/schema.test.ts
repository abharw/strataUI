import { describe, expect, it } from "vitest";

import { schema } from "./schema";

describe("metric schema", () => {
  it("accepts change and trend together with a typed value", () => {
    const result = schema.safeParse({
      label: "Weekly pace",
      value: { value: 6.1, unit: "min/mi" },
      change: { value: -12, direction: "down", polarity: "good" },
      trend: [6.6, 6.4, 6.3, 6.1],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a change without polarity", () => {
    expect(
      schema.safeParse({
        label: "Steps",
        value: 9000,
        change: { value: 40, direction: "up" },
      }).success,
    ).toBe(true);
  });

  it("caps trend at 30 points, matching the documented sparkline limit", () => {
    const withinLimit = schema.safeParse({
      label: "Steps",
      value: 9000,
      trend: Array.from({ length: 30 }, (_, index) => index),
    });
    expect(withinLimit.success).toBe(true);

    const overLimit = schema.safeParse({
      label: "Steps",
      value: 9000,
      trend: Array.from({ length: 31 }, (_, index) => index),
    });
    expect(overLimit.success).toBe(false);
  });

  it("refuses an empty trend rather than an invented single point", () => {
    expect(schema.safeParse({ label: "Steps", value: 9000, trend: [] }).success).toBe(false);
  });
});
