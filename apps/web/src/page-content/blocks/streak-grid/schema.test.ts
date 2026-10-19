import { describe, expect, it } from "vitest";

import { MAX_STREAK_SPAN_DAYS, MIN_STREAK_WINDOW_DAYS } from "./limits";
import { schema } from "./schema";

describe("streak-grid schema", () => {
  it("refuses an empty grid", () => {
    expect(schema.safeParse({ cells: [] }).success).toBe(false);
  });

  it("accepts one bounded year of unique daily values", () => {
    const cells = Array.from({ length: MAX_STREAK_SPAN_DAYS }, (_, index) => {
      const date = new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10);
      return { date, value: index % 4 };
    });
    expect(schema.safeParse({ cells }).success).toBe(true);
  });

  it("rejects distant endpoints that could expand into an unbounded DOM range", () => {
    const result = schema.safeParse({
      cells: [
        { date: "1900-01-01", value: 1 },
        { date: "2100-01-01", value: 1 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(`${MAX_STREAK_SPAN_DAYS} days`);
    }
  });

  it("rejects more cells than the renderer's hard cap, as a span", () => {
    // Unique dates mean a day past the cap is also past the span, so only the span check exists.
    const cells = Array.from({ length: MAX_STREAK_SPAN_DAYS + 1 }, (_, index) => ({
      date: new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10),
      value: 1,
    }));
    const result = schema.safeParse({ cells });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes(`${MAX_STREAK_SPAN_DAYS} days`)))
        .toBe(true);
    }
  });

  it("rejects duplicate dates and negative intensities", () => {
    expect(
      schema.safeParse({
        cells: [
          { date: "2026-08-22", value: 1 },
          { date: "2026-08-22", value: 2 },
        ],
      }).success,
    ).toBe(false);
    expect(schema.safeParse({ cells: [{ date: "2026-08-22", value: -1 }] }).success).toBe(false);
  });
});

describe("the days window", () => {
  it("takes a sparse set of days inside a window that ends on a named day", () => {
    const result = schema.safeParse({
      days: 30,
      end: "2026-08-24",
      cells: [
        { date: "2026-07-26", value: 2 },
        { date: "2026-08-24", value: 1 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("names the window's two ends when a cell falls outside it", () => {
    const result = schema.safeParse({
      days: 30,
      end: "2026-08-24",
      // One day before the window opens: 30 days ending 2026-08-24 starts on
      // 2026-07-26.
      cells: [{ date: "2026-07-25", value: 1 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues.map((issue) => issue.message).join(" ");
      expect(message).toContain("2026-07-26 to 2026-08-24");
      expect(message).toContain("2026-07-25");
    }
  });

  it("checks only the window's width when end floats on the reader's clock", () => {
    expect(schema.safeParse({ days: 7, cells: [{ date: "2026-08-24", value: 1 }] }).success).toBe(true);
    const tooWide = schema.safeParse({
      days: 7,
      cells: [
        { date: "2026-08-10", value: 1 },
        { date: "2026-08-24", value: 1 },
      ],
    });
    expect(tooWide.success).toBe(false);
    if (!tooWide.success) {
      expect(tooWide.error.issues.map((issue) => issue.message).join(" ")).toContain("15 days");
    }
  });

  it("refuses end without days, because end alone names no window", () => {
    const result = schema.safeParse({ end: "2026-08-24", cells: [{ date: "2026-08-24", value: 1 }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "end")).toBe(true);
    }
  });

  it("holds days to a week at the narrow end and the span cap at the wide one", () => {
    const cells = [{ date: "2026-08-24", value: 1 }];
    expect(schema.safeParse({ days: MIN_STREAK_WINDOW_DAYS - 1, cells }).success).toBe(false);
    expect(schema.safeParse({ days: MIN_STREAK_WINDOW_DAYS, cells }).success).toBe(true);
    expect(schema.safeParse({ days: MAX_STREAK_SPAN_DAYS, cells }).success).toBe(true);
    expect(schema.safeParse({ days: MAX_STREAK_SPAN_DAYS + 1, cells }).success).toBe(false);
  });

  it("leaves a full-cell grid with no days exactly as it was", () => {
    expect(
      schema.safeParse({
        cells: [
          { date: "2026-08-19", value: 1 },
          { date: "2026-08-20", value: 0 },
        ],
      }).success,
    ).toBe(true);
  });
});
