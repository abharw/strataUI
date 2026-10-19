import { describe, expect, it } from "vitest";

import { schema } from "./schema";

const base = {
  labels: ["Week 1", "Week 2"],
  series: [{ name: "Actual", values: [92, 98] }],
};

describe("chart schema", () => {
  it("accepts and ignores a bar presentation's floor instead of refusing it", () => {
    // The renderer ignores y_min on bars, so any value is accepted.
    expect(schema.safeParse({ ...base, presentation: "bar", y_min: 90, y_max: 100 }).success).toBe(true);
    expect(schema.safeParse({ ...base, presentation: "bar", y_min: 0 }).success).toBe(true);
    expect(schema.safeParse({ ...base, presentation: "bar", y_min: 500 }).success).toBe(true);
  });

  it("defaults presentation to null and stack to none, leaving the look to the device", () => {
    const result = schema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.presentation).toBeNull();
      expect(result.data.stack).toBe("none");
    }
  });

  it("lets line and area pin a floor - position, not length, encodes value there", () => {
    expect(schema.safeParse({ ...base, presentation: "line", y_min: 90, y_max: 100 }).success).toBe(true);
    expect(schema.safeParse({ ...base, presentation: "area", y_min: 90, y_max: 100 }).success).toBe(true);
  });

  it("refuses bounds that clip an observed value", () => {
    const floor = schema.safeParse({ ...base, presentation: "line", y_min: 95, y_max: 100 });
    expect(floor.success).toBe(false);
    if (!floor.success) expect(floor.error.issues.some(({ message }) => message.includes("observed minimum 92"))).toBe(true);

    const ceiling = schema.safeParse({ ...base, presentation: "line", y_min: 0, y_max: 95 });
    expect(ceiling.success).toBe(false);
    if (!ceiling.success) expect(ceiling.error.issues.some(({ message }) => message.includes("observed maximum 98"))).toBe(true);
  });

  it("still refuses an inverted axis", () => {
    expect(schema.safeParse({ ...base, presentation: "line", y_min: 100, y_max: 90 }).success).toBe(false);
  });

  it("requires time-axis labels to parse as ISO dates", () => {
    expect(
      schema.safeParse({ ...base, x: { kind: "time" }, labels: ["2026-01-01", "2026-01-08"] }).success,
    ).toBe(true);
    const bad = schema.safeParse({ ...base, x: { kind: "time" } });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues.some(({ message }) => message.includes("must parse as an ISO-8601 date"))).toBe(true);
    }
  });

  it("requires empty exactly when there is no data", () => {
    expect(schema.safeParse({ labels: [], series: [] }).success).toBe(false);
    expect(schema.safeParse({ labels: [], series: [], empty: "No data yet." }).success).toBe(true);
    expect(schema.safeParse({ ...base, empty: "No data yet." }).success).toBe(false);
  });
});
