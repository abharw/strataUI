import { describe, expect, it } from "vitest";

import {
  currentStageIndex,
  daysUntil,
  remainingLabel,
  stageStates,
  viewerToday,
} from "./current";

/** The triathlon fixture's stages: contiguous, ordered, ending on race day. */
const plan = [
  { start: "2026-08-03", end: "2026-08-24" },
  { start: "2026-08-24", end: "2026-09-24" },
  { start: "2026-09-24", end: "2026-10-04" },
];

describe("the reader's calendar day", () => {
  it("is the reader's, not the server's", () => {
    // 00:30 UTC on the 25th is still the 24th in New York.
    const instant = Date.parse("2026-08-25T00:30:00Z");
    expect(viewerToday(instant, "America/New_York")).toBe("2026-08-24");
    expect(viewerToday(instant, "UTC")).toBe("2026-08-25");
  });
});

describe("which stage is now", () => {
  it("gives a boundary day to the stage it opens, not the one it closes", () => {
    expect(currentStageIndex(plan, "2026-08-23")).toBe(0);
    expect(currentStageIndex(plan, "2026-08-24")).toBe(1);
  });

  it("keeps the final day inside the last stage, so race morning is not 'finished'", () => {
    expect(currentStageIndex(plan, "2026-10-03")).toBe(2);
    expect(currentStageIndex(plan, "2026-10-04")).toBe(2);
  });

  it("has no current stage before the plan starts or after it ends", () => {
    expect(currentStageIndex(plan, "2026-07-31")).toBe(-1);
    expect(currentStageIndex(plan, "2026-10-05")).toBe(-1);
    expect(currentStageIndex([], "2026-08-24")).toBe(-1);
  });
});

describe("the state of every stage at a fixed clock", () => {
  it("marks one current, the ones behind it past and the ones after it ahead", () => {
    expect(stageStates(plan, "2026-08-24")).toEqual(["past", "current", "ahead"]);
    expect(stageStates(plan, "2026-08-03")).toEqual(["current", "ahead", "ahead"]);
    expect(stageStates(plan, "2026-10-04")).toEqual(["past", "past", "current"]);
  });

  it("reads a plan that has not started as entirely ahead", () => {
    expect(stageStates(plan, "2026-07-01")).toEqual(["ahead", "ahead", "ahead"]);
  });

  it("reads a finished plan as entirely past", () => {
    expect(stageStates(plan, "2026-11-01")).toEqual(["past", "past", "past"]);
  });
});

describe("how far away the target is", () => {
  it("counts whole calendar days, in both directions", () => {
    expect(daysUntil("2026-10-04", "2026-08-24")).toBe(41);
    expect(daysUntil("2026-10-04", "2026-10-04")).toBe(0);
    expect(daysUntil("2026-10-04", "2026-10-06")).toBe(-2);
  });

  it("counts across a daylight-saving boundary without losing or gaining a day", () => {
    // US clocks change on 2026-11-01; both ends are UTC midnight, so the count stays whole.
    expect(daysUntil("2026-11-02", "2026-10-31")).toBe(2);
  });

  it("says it in words rather than in a colour", () => {
    expect(remainingLabel(41)).toBe("41 days left");
    expect(remainingLabel(1)).toBe("Tomorrow");
    expect(remainingLabel(0)).toBe("Today");
    expect(remainingLabel(-1)).toBe("Yesterday");
    expect(remainingLabel(-3)).toBe("3 days ago");
  });
});
