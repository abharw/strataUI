import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "@/page-content/test-format";
import { Metric } from "@/page-content/blocks/metric/view";
import { Card } from "./view";

function render(html: React.ReactElement): string {
  return renderToStaticMarkup(<TestViewerFormatting>{html}</TestViewerFormatting>);
}

describe("card", () => {
  it("renders title and description", () => {
    const html = render(
      <Card title="Villa Sintra" description="3 nights" />,
    );

    expect(html).toContain("Villa Sintra");
    expect(html).toContain("3 nights");
  });

  it("marks its content wrapper as a container so a nested leaf can react to this card's own width", () => {
    const html = render(<Card title="Trip total" />);

    expect(html).toContain("@container/card");
  });

  it("flags its content wrapper for nested leaves to read, and lets a bare card keep its own surface", () => {
    const html = render(<Card title="Trip total" />);

    // The attribute itself is set only by the card; every leaf carries the selector text.
    expect(html).toContain('data-in-card=""');
    // The card itself still draws the one box - nothing here resets its own border.
    expect(html).toContain("rounded-contained");
  });

  it("drops a nested metric's own border and padding so the card is the only box", () => {
    const html = render(
      <Card title="Nights">
        <Metric label="Nights" value={4} />
      </Card>
    );

    const metricArticle = html.slice(html.indexOf("<article", html.indexOf("<article") + 1));
    // `&` is HTML-entity-escaped to `&amp;` inside a static-markup attribute.
    expect(metricArticle).toContain("[[data-in-card]_&amp;]:border-0");
    expect(metricArticle).toContain("[[data-in-card]_&amp;]:p-0");
  });

  it("keeps a standalone metric's border and padding outside of a card", () => {
    const html = render(<Metric label="Nights" value={4} />);

    // The reset classes are always in the markup but only match under a real `data-in-card`.
    expect(html).not.toContain('data-in-card=""');
  });
});

describe("a card's emoji", () => {
  it("draws it before the title, inside the heading, and hidden from the accessibility tree", () => {
    const html = render(<Card emoji="🏊" title="Swim block" />);

    const heading = html.slice(html.indexOf("<h"), html.indexOf("</h") + 4);
    expect(heading).toContain("🏊");
    expect(heading).toContain("Swim block");
    // Before the title and hidden from screen readers, like a Space's marker.
    expect(heading.indexOf("🏊")).toBeLessThan(heading.indexOf("Swim block"));
    expect(heading).toContain("aria-hidden");
  });

  it("still draws the emoji on a card with no title of its own", () => {
    const html = render(<Card emoji="🏊" description="Two lane sessions" />);

    expect(html).toContain("🏊");
    expect(html).toContain("Two lane sessions");
  });
});
