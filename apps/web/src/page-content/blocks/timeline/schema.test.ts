import { describe, expect, it } from "vitest";

import { schema } from "./schema";

describe("timeline schema", () => {
  it("accepts histories, local itineraries, and undated authored sequences", () => {
    expect(schema.safeParse({
      order: "descending",
      events: [
        { id: "exact", at: "2026-08-23T16:42:00-04:00", title: "Lease signed" },
        { id: "day", at: "2026-08-20", title: "Application approved" },
      ],
    }).success).toBe(true);

    expect(schema.safeParse({
      order: "ascending",
      events: [
        { id: "landing", at: "2026-09-12", time: "14:05", title: "Land", place: "LIS", ref: "TAP 1049" },
      ],
    }).success).toBe(true);

    expect(schema.safeParse({
      order: "as-provided",
      events: [{ id: "draft", title: "Draft" }, { id: "review", title: "Review" }],
    }).success).toBe(true);
  });

  it("rejects a duplicate local time beside an exact instant", () => {
    const result = schema.safeParse({
      order: "as-provided",
      events: [
        {
          id: "landing",
          at: "2026-09-12T14:05:00+01:00",
          time: "14:05",
          title: "Land",
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toContain("time");
  });

  it("requires comparable anchors when the renderer owns sorting", () => {
    expect(schema.safeParse({
      order: "ascending",
      events: [{ id: "draft", title: "Draft" }],
    }).success).toBe(false);

    expect(schema.safeParse({
      order: "ascending",
      events: [
        { id: "dated", at: "2026-09-12", title: "Dated" },
        { id: "time-only", time: "14:05", title: "Time only" },
      ],
    }).success).toBe(false);

    expect(schema.safeParse({
      order: "ascending",
      events: [
        { id: "instant", at: "2026-09-12T14:05:00+01:00", title: "Instant" },
        { id: "local", at: "2026-09-13", time: "09:30", title: "Local" },
      ],
    }).success).toBe(false);
  });

  it("takes at at whatever precision the source establishes", () => {
    expect(schema.safeParse({
      order: "ascending",
      events: [
        { id: "founded", at: "2019", title: "Company founded" },
        { id: "seed", at: "2019-06", title: "Seed round" },
        { id: "launch", at: "2019-06-04", title: "Launch" },
      ],
    }).success).toBe(true);
  });

  it("lets a wall-clock time sit beside a coarse at, which carries no time", () => {
    expect(schema.safeParse({
      order: "as-provided",
      events: [{ id: "seed", at: "2019-06", time: "14:05", title: "Seed round" }],
    }).success).toBe(true);
  });

  it("refuses a precision that is not an ISO prefix", () => {
    expect(schema.safeParse({
      order: "as-provided",
      events: [{ id: "x", at: "2019-13", title: "X" }],
    }).success).toBe(false);
  });
});
