import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "@/page-content/test-format";
import { Metric } from "./view";

function render(html: React.ReactElement): string {
  return renderToStaticMarkup(<TestViewerFormatting>{html}</TestViewerFormatting>);
}

describe("metric", () => {
  it("renders the plain value and unit without change or trend", () => {
    const html = render(<Metric label="Hours this week" value={{ value: 8.5, unit: "h" }} />);

    expect(html).toContain("Hours this week");
    expect(html).toContain("8.5");
    expect(html).toContain("h</span>");
    expect(html).not.toContain("<svg");
  });

  it("colours a good change on the success token regardless of direction wording", () => {
    const html = render(
      <Metric
        label="Weekly pace"
        value={{ value: 6.1, unit: "min/mi" }}
        change={{ value: -12, direction: "down", polarity: "good" }}
      />,
    );

    expect(html).toContain("text-status-success-foreground");
    expect(html).not.toContain("text-status-danger-foreground");
  });

  it("colours a bad change on the danger token even though it is also a fall", () => {
    const html = render(
      <Metric
        label="Weekly revenue"
        value={{ value: 4200, unit: "USD" }}
        change={{ value: -300, direction: "down", polarity: "bad" }}
      />,
    );

    expect(html).toContain("text-status-danger-foreground");
    expect(html).not.toContain("text-status-success-foreground");
  });

  it("keeps neutral and absent polarity muted rather than coloured", () => {
    const neutral = render(
      <Metric label="Steps" value={9000} change={{ value: 40, direction: "up", polarity: "neutral" }} />,
    );
    const absent = render(
      <Metric label="Steps" value={9000} change={{ value: 40, direction: "up" }} />,
    );

    for (const html of [neutral, absent]) {
      expect(html).toContain("text-muted-foreground");
      expect(html).not.toContain("text-status-success-foreground");
      expect(html).not.toContain("text-status-danger-foreground");
    }
  });

  it("renders a flat change with the flat glyph, not up or down", () => {
    const html = render(
      <Metric label="Steps" value={9000} change={{ value: 0, direction: "flat", polarity: "neutral" }} />,
    );

    expect(html.match(/<svg/g)?.length).toBeGreaterThan(0);
  });

  it("draws an aria-hidden sparkline and discloses its exact values in a collapsed list", () => {
    const html = render(
      <Metric label="Weekly volume" value={{ value: 11, unit: "h" }} trend={[8, 9.5, 7, 11]} />,
    );

    expect(html).toContain("<polyline");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("<details");
    expect(html).toContain("<ol");
    expect(html).toContain("Trend");
    // Every exact value shows up in the disclosed list.
    expect(html).toContain(">8<");
    expect(html).toContain("9.5");
    expect(html).toContain(">11<");
  });

  it("keeps the value on one line beside a trend sparkline", () => {
    const html = render(
      <Metric label="Weekly volume" value={{ value: 11, unit: "h" }} trend={[8, 9.5, 7, 11]} />,
    );

    expect(html).toContain("whitespace-nowrap");
  });

  it("never splits the label or the change value mid-word, and can shrink one type step in a narrow cell", () => {
    const html = render(
      <Metric
        label="Strength"
        value={12}
        change={{ value: "+1", direction: "up", polarity: "good" }}
      />,
    );

    // `wrap-normal` stops narrow grid cells splitting words; `@max-[150px]/cell` steps the label
    // down a size in a compact cell instead.
    expect(html).toContain("wrap-normal hyphens-none line-clamp-2 text-supporting");
    expect(html).toContain("@max-[150px]/cell:text-meta");
    expect(html).toContain('<span class="min-w-0 wrap-normal hyphens-none">+1</span>');
  });

  it("carries the classes that drop its own border/padding when a card is its ancestor", () => {
    const html = render(<Metric label="Nights" value={4} />);

    // These only apply under a `data-in-card` ancestor, so a bare metric keeps its own box.
    expect(html).toContain("[[data-in-card]_&amp;]:border-0");
    expect(html).toContain("[[data-in-card]_&amp;]:p-0");
  });

  it("stops filling its row when a card is its ancestor, so the figure is not pushed to the card's floor", () => {
    const html = render(<Metric label="Fare" value={{ amount: 212, currency: "EUR" }} />);

    // Standalone it fills the grid row with the figure at the bottom. Inside a card the card fills
    // the row instead, so this would leave a gap under the label.
    expect(html).toContain("h-full");
    expect(html).toContain("justify-between");
    expect(html).toContain("[[data-in-card]_&amp;]:h-auto");
    expect(html).toContain("[[data-in-card]_&amp;]:min-h-0");
    expect(html).toContain("[[data-in-card]_&amp;]:justify-start");
    expect(html).toContain("[[data-in-card]_&amp;]:gap-2");
    // The gap owns the spacing nested, so the value block drops its margin.
    expect(html).toContain("[[data-in-card]_&amp;]:mt-0");
  });
});
