import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "./test-format";
import { PageRenderer } from "./render";

describe("PageRenderer chart SSR", () => {
  it("keeps the chart's one visible data disclosure in the server response while Recharts is deferred", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <PageRenderer
          spec={{
            answer: { verdict: "Support volume rose through April." },
            root: "root",
            elements: {
              root: { type: "section", props: {}, children: ["volume"] },
              volume: {
                type: "chart",
                props: {
                  kind: "line",
                  y_label: "tickets",
                  labels: ["March", "April"],
                  series: [{ name: "Support", values: [31, 46] }],
                },
                children: [],
              },
            },
          }}
        />
      </TestViewerFormatting>,
    );

    expect(html).toContain('aria-label="line chart of tickets"');
    expect(html).toContain("View chart data");
    expect(html).toContain("Chart data in tickets");
    expect(html).toContain("Support");
    expect(html).toContain("March");
    expect(html).toContain("46");
    expect(html.match(/<table/g)?.length).toBe(1);
  });
});
