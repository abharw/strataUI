import { describe, expect, it } from "vitest";

import { schema } from "./schema";

describe("status-list schema", () => {
  it("refuses waiting-on-them with no one holding it", () => {
    const result = schema.safeParse({
      items: [{ id: "bike-fit", label: "Bike fit", status: "waiting-on-them" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("owner is required");
    }
  });

  it("accepts every other state with no owner", () => {
    for (const status of [
      "not-started",
      "in-progress",
      "waiting-on-you",
      "blocked",
      "at-risk",
      "cancelled",
      "done",
    ] as const) {
      expect(schema.safeParse({ items: [{ id: "x", label: "X", status }] }).success).toBe(true);
    }
  });

  it("still refuses a state it has no rendering for", () => {
    expect(schema.safeParse({ items: [{ id: "x", label: "X", status: "snoozed" }] }).success)
      .toBe(false);
  });

  it("takes since at whatever precision the source establishes", () => {
    for (const since of ["2026", "2026-08", "2026-08-18", "2026-08-18T09:30:00-04:00"]) {
      expect(schema.safeParse({ items: [{ id: "x", label: "X", status: "done", since }] }).success)
        .toBe(true);
    }
  });

  it("still refuses a since that is not an ISO prefix at all", () => {
    for (const since of ["2026-13", "August 2026", "26-08"]) {
      expect(schema.safeParse({ items: [{ id: "x", label: "X", status: "done", since }] }).success)
        .toBe(false);
    }
  });

  it("keeps deadlines exact: a date someone set, not a coarser source", () => {
    expect(schema.safeParse({
      items: [{ id: "x", label: "X", status: "waiting-on-you", due_at: "2026" }],
    }).success).toBe(false);
    expect(schema.safeParse({
      items: [{ id: "x", label: "X", status: "waiting-on-you", next_check_at: "2026-08" }],
    }).success).toBe(false);
  });

  it("accepts typed due and next-check dates", () => {
    expect(schema.safeParse({
      items: [{
        id: "x",
        label: "X",
        status: "waiting-on-you",
        due_at: "2026-08-25",
        next_check_at: "2026-08-24T12:00:00-04:00",
      }],
    }).success).toBe(true);
  });
});
