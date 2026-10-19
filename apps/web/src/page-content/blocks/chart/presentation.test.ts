import { describe, expect, it } from "vitest";

import { barsAreGrouped, chartPresentation, chartStack, LONG_LABEL_CHARS } from "./presentation";

const series = (count: number) =>
  Array.from({ length: count }, (_value, index) => ({
    name: `Series ${index + 1}`,
    values: [1, 2, 3],
  }));

describe("the device's chart default", () => {
  it("hands back whatever the agent chose, without re-deciding it", () => {
    for (const presentation of ["line", "bar", "area", "bar-horizontal"] as const) {
      expect(
        chartPresentation({ presentation, labels: ["a"], series: series(1), x: { kind: "time" } }),
      ).toBe(presentation);
    }
  });

  it("draws a time axis as a line", () => {
    expect(
      chartPresentation({
        presentation: null,
        labels: ["2026-08-03", "2026-08-10"],
        series: series(1),
        x: { kind: "time" },
      }),
    ).toBe("line");
  });

  it("draws a stacked time axis as an area, because a stacked line is not a sum", () => {
    for (const stack of ["stacked", "percent"] as const) {
      expect(
        chartPresentation({
          presentation: null,
          labels: ["2026-08-03", "2026-08-10"],
          series: series(3),
          x: { kind: "time" },
          stack,
        }),
      ).toBe("area");
    }
  });

  it("draws a category axis as bars", () => {
    expect(chartPresentation({ presentation: null, labels: ["Swim", "Bike"], series: series(1) })).toBe("bar");
    expect(
      chartPresentation({ presentation: null, labels: ["Swim"], series: series(3), x: { kind: "category" } }),
    ).toBe("bar");
  });

  it("turns one series on its side once a label stops fitting under a tick", () => {
    const long = "x".repeat(LONG_LABEL_CHARS + 1);
    const fits = "x".repeat(LONG_LABEL_CHARS);

    expect(chartPresentation({ presentation: null, labels: [fits, "Bike"], series: series(1) })).toBe("bar");
    expect(chartPresentation({ presentation: null, labels: [long, "Bike"], series: series(1) })).toBe(
      "bar-horizontal",
    );
  });

  it("keeps several series upright even under long labels, because grouped bars need the width", () => {
    const long = "Open-water swim session";
    expect(chartPresentation({ presentation: null, labels: [long], series: series(2) })).toBe("bar");
  });
});

describe("the stacking the renderer applies", () => {
  it("ignores stacking for a single series, which has nothing to stack against", () => {
    expect(chartStack(1, "stacked")).toBe("none");
    expect(chartStack(1, "percent")).toBe("none");
  });

  it("honours stacking from two series up, and defaults to none", () => {
    expect(chartStack(2, "stacked")).toBe("stacked");
    expect(chartStack(3, "percent")).toBe("percent");
    expect(chartStack(3, null)).toBe("none");
    expect(chartStack(3, undefined)).toBe("none");
  });

  it("calls several unstacked bars over one label grouped, and nothing else", () => {
    expect(barsAreGrouped({ presentation: null, labels: ["Swim"], series: series(2) })).toBe(true);
    expect(barsAreGrouped({ presentation: null, labels: ["Swim"], series: series(1) })).toBe(false);
    expect(barsAreGrouped({ presentation: null, labels: ["Swim"], series: series(2), stack: "stacked" })).toBe(false);
    expect(
      barsAreGrouped({ presentation: null, labels: ["2026-08-03"], series: series(2), x: { kind: "time" } }),
    ).toBe(false);
  });
});
