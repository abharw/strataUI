import { describe, expect, it } from "vitest";

import { breakdownPresentation, breakdownTotal, DONUT_PARTS } from "./presentation";

const parts = (count: number) =>
  Array.from({ length: count }, (_value, index) => ({ id: `p${index}`, label: `P${index}`, value: index + 1 }));

describe("the device's breakdown default", () => {
  it("hands back whatever the agent chose, without re-deciding it", () => {
    for (const presentation of ["donut", "pie", "bars", "radial"] as const) {
      expect(breakdownPresentation({ presentation, parts: parts(8) })).toBe(presentation);
    }
  });

  it("draws a donut whenever there is a total to put in the middle", () => {
    expect(breakdownPresentation({ presentation: null, parts: parts(8), total_label: "This week" })).toBe("donut");
  });

  it("draws a donut while the slices are still countable", () => {
    expect(breakdownPresentation({ presentation: null, parts: parts(DONUT_PARTS) })).toBe("donut");
    expect(breakdownPresentation({ presentation: null, parts: parts(1) })).toBe("donut");
  });

  it("falls to bars past that, because many small arcs are not comparable", () => {
    expect(breakdownPresentation({ presentation: null, parts: parts(DONUT_PARTS + 1) })).toBe("bars");
    expect(breakdownPresentation({ presentation: null, parts: parts(8) })).toBe("bars");
  });
});

describe("the whole a breakdown is parts of", () => {
  it("is the sum the renderer prints in the donut's centre, never an authored number", () => {
    expect(
      breakdownTotal([{ value: 1.5 }, { value: 4.5 }, { value: 2.5 }]),
    ).toBe(8.5);
    expect(breakdownTotal([])).toBe(0);
  });
});
