import { describe, expect, it } from "vitest";

import { timeAxisUnit, timeTickFormatter } from "./time-axis";

const env = { locale: "en-US", timeZone: "America/New_York" };

describe("the time axis reads at the resolution of its span", () => {
  it("uses a clock for a span inside two days", () => {
    expect(timeAxisUnit(["2026-08-03T06:00:00Z", "2026-08-03T18:00:00Z"])).toBe("hour");
  });

  it("uses days for eight weeks of training", () => {
    expect(timeAxisUnit(["2026-08-03", "2026-08-10", "2026-09-21"])).toBe("day");
  });

  it("uses months once the span passes a season", () => {
    expect(timeAxisUnit(["2026-01-01", "2026-12-01"])).toBe("month");
  });

  it("uses years once the span passes three of them", () => {
    expect(timeAxisUnit(["2019-01-01", "2026-01-01"])).toBe("year");
  });

  it("falls to days when a single label leaves no span to measure", () => {
    expect(timeAxisUnit(["2026-08-03"])).toBe("day");
    expect(timeAxisUnit([])).toBe("day");
  });
});

describe("the time axis tick", () => {
  it("formats a calendar date as its own day, west of Greenwich too", () => {
    const labels = ["2026-08-03", "2026-08-10", "2026-09-21"];
    const format = timeTickFormatter(labels, env);
    // A calendar date, not an instant: August 3 stays August 3 in New York.
    expect(format("2026-08-03")).toBe("Aug 3");
    expect(format("2026-09-21")).toBe("Sep 21");
  });

  it("drops the year from a month axis that never leaves one", () => {
    const format = timeTickFormatter(["2026-01-01", "2026-12-01"], env);
    expect(format("2026-01-01")).toBe("Jan");
    expect(format("2026-12-01")).toBe("Dec");
  });

  it("keeps the year on a month axis that crosses one", () => {
    const format = timeTickFormatter(["2026-06-01", "2027-05-01"], env);
    expect(format("2026-06-01")).toBe("Jun 2026");
    expect(format("2027-05-01")).toBe("May 2027");
  });

  it("prints only the year once the axis spans several", () => {
    const format = timeTickFormatter(["2019-01-01", "2026-01-01"], env);
    expect(format("2019-01-01")).toBe("2019");
  });

  it("reads an offset-bearing instant in the viewer's zone, not in UTC", () => {
    const format = timeTickFormatter(["2026-08-03T04:00:00Z", "2026-08-03T16:00:00Z"], env);
    expect(format("2026-08-03T04:00:00Z")).toBe("12:00 AM");
  });

  it("leaves a label it cannot parse exactly as the author wrote it", () => {
    const format = timeTickFormatter(["2026-08-03", "2026-08-10"], env);
    expect(format("Week 1")).toBe("Week 1");
  });
});
