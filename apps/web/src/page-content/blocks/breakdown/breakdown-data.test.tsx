import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "@/page-content/test-format";
import { BreakdownData } from "./breakdown-data";
import { Breakdown } from "./view";

const week = [
  { id: "swim", label: "Swim", value: 1.5 },
  { id: "bike", label: "Bike", value: 4.5 },
  { id: "run", label: "Run", value: 2.5 },
];

describe("breakdown data disclosure", () => {
  it("server-renders the parts, their shares and the total the donut shows", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <BreakdownData parts={week} unit="h" total_label="This week" />
      </TestViewerFormatting>,
    );

    expect(html).toContain('aria-label="donut breakdown in h"');
    expect(html).toContain("View breakdown data");
    expect(html).toContain("Swim");
    expect(html).toContain("4.5");
    // 1.5 of 8.5 hours, rounded the way every other percent on the page is.
    expect(html).toContain("18%");
    expect(html).toContain("This week");
    expect(html).toContain("8.5");
  });

  it("names the presentation the device actually chose, not the donut it did not", () => {
    const many = Array.from({ length: 8 }, (_value, index) => ({
      id: `p${index}`,
      label: `Part ${index}`,
      value: index + 1,
    }));
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <BreakdownData parts={many} />
      </TestViewerFormatting>,
    );

    expect(html).toContain('aria-label="bars breakdown"');
    expect(html).toContain("Total");
  });

  it("leaves the disclosure out rather than opening an empty table", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <BreakdownData parts={[]} />
      </TestViewerFormatting>,
    );

    expect(html).toBe("");
  });
});

describe("an empty breakdown", () => {
  it("renders the author's sentence through the one empty state, not a ring", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Breakdown parts={[]} empty="No sessions logged this week." />
      </TestViewerFormatting>,
    );

    expect(html).toContain("No sessions logged this week.");
    expect(html).not.toContain("<figure");
  });
});
