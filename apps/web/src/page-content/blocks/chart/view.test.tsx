import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "@/page-content/test-format";
import { Chart } from "./view";
import { ChartData } from "./chart-data";

describe("an empty chart", () => {
  it("renders the author's sentence through the one empty state, not an axis", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Chart labels={[]} series={[]} empty="No sessions logged yet." />
      </TestViewerFormatting>,
    );

    expect(html).toContain("No sessions logged yet.");
    expect(html).not.toContain("<figure");
  });

  it("leaves the exact-data disclosure out rather than opening an empty table", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ChartData labels={[]} series={[]} />
      </TestViewerFormatting>,
    );

    expect(html).toBe("");
  });
});
