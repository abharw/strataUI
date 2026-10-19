import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Comparison } from "./view";

describe("comparison", () => {
  it("stacks the before and after under their labels, defaulting to Was/Now", () => {
    const html = renderToStaticMarkup(
      <Comparison items={[{ id: "rent", label: "Rent", before: "$1,950/mo", after: "$2,150/mo" }]} />,
    );
    expect(html).toContain("Rent");
    expect(html).toContain("Was");
    expect(html).toContain("$1,950/mo");
    expect(html).toContain("Now");
    expect(html).toContain("$2,150/mo");
  });

  it("uses custom before/after labels when given", () => {
    const html = renderToStaticMarkup(
      <Comparison
        before_label="Monday"
        after_label="Today"
        items={[{ id: "fare", label: "TAP fare", before: "$398", after: "$412" }]}
      />,
    );
    expect(html).toContain("Monday");
    expect(html).toContain("Today");
    expect(html).not.toContain(">Was<");
    expect(html).not.toContain(">Now<");
  });

  it("reads the after as changed through weight, not colour alone", () => {
    const html = renderToStaticMarkup(
      <Comparison items={[{ id: "rent", label: "Rent", before: "$1,950/mo", after: "$2,150/mo" }]} />,
    );
    // The after line carries font-medium; the before line does not.
    const afterLine = html.slice(html.indexOf("$2,150/mo") - 200, html.indexOf("$2,150/mo"));
    expect(afterLine).toContain("font-medium");
  });

  it("renders the empty sentence instead of a blank shell", () => {
    const html = renderToStaticMarkup(<Comparison items={[]} empty="Nothing has changed yet." />);
    expect(html).toContain("Nothing has changed yet.");
  });
});
