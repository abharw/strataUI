import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "@/page-content/test-format";
import { ChartData } from "./chart-data";

describe("chart data fallback", () => {
  it("server-renders one named, visible data disclosure before the deferred chart chunk exists", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ChartData
          presentation="line"
          y_label="hours"
          labels={["Mon", "Tue"]}
          series={[{ name: "Actual", values: [6.2, 7.4] }]}
        />
      </TestViewerFormatting>,
    );

    expect(html).toContain('aria-label="line chart of hours"');
    expect(html).toContain("<details");
    expect(html).toContain("View chart data");
    expect(html).toContain("Chart data in hours");
    expect(html).toContain("Actual");
    expect(html).toContain("Mon");
    expect(html).toContain("6.2");
    expect(html.match(/<table/g)?.length).toBe(1);
    expect(html).not.toContain("sr-only max-w-px");
  });

  it("offers no scroll instruction before anything has been measured", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ChartData labels={["Mon"]} series={[{ name: "Actual", values: [1] }]} />
      </TestViewerFormatting>,
    );

    expect(html).toContain('aria-label="Chart data"');
    expect(html).not.toContain("Scroll horizontally");
    expect(html).not.toContain("aria-describedby");
  });
});
