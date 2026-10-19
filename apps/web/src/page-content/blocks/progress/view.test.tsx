import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "@/page-content/test-format";
import { Progress } from "./view";

describe("progress", () => {
  it("formats the visible ratio as a percent without changing the numeric control value", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Progress label="Readiness" current={3} target={4} />
      </TestViewerFormatting>,
    );

    expect(html).toContain(">75%<");
    expect(html).toContain('aria-valuenow="75"');
    expect(html).toContain('aria-valuetext="3 of 4"');
  });

  it("keeps the bar as the default presentation: no ring svg when presentation is unset", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Progress label="Readiness" current={3} target={4} />
      </TestViewerFormatting>,
    );

    expect(html).not.toContain("<svg");
  });

  it("draws an accessible ring instead of the bar when presentation is ring", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Progress label="Weekly volume" current={8.5} target={11} presentation="ring" />
      </TestViewerFormatting>,
    );

    expect(html).toContain("<svg");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Weekly volume: 77%"');
    expect(html).not.toContain('role="progressbar"');
    // The percent is still drawn centred inside the ring, and the label below it.
    expect(html).toContain(">77%<");
    expect(html).toContain("Weekly volume");
  });

  it("still honours the deadline text in the ring presentation", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Progress
          label="Weekly volume"
          current={8.5}
          target={11}
          target_at="2026-08-30"
          presentation="ring"
        />
      </TestViewerFormatting>,
    );

    expect(html).toContain("Target");
  });

  it("measures a lower-is-better value over the fall from start to target, not as current over target", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Progress
          label="Magic mile"
          current={5.87}
          target={5.75}
          start={6.4}
          direction="lower"
        />
      </TestViewerFormatting>,
    );

    // (6.4 - 5.87) / (6.4 - 5.75) = 0.815..., not 5.87/5.75 = 102%.
    expect(html).toContain(">82%<");
    expect(html).toContain('aria-valuenow="82"');
    // The caption keeps the exact figures whatever the fraction says.
    expect(html).toContain('aria-valuetext="5.87 of 5.75"');
  });

  it("shows 100% and keeps the figures once the value is past its target, in either direction", () => {
    const beaten = renderToStaticMarkup(
      <TestViewerFormatting>
        <Progress label="Magic mile" current={5.6} target={5.75} start={6.4} direction="lower" />
      </TestViewerFormatting>,
    );
    const exceeded = renderToStaticMarkup(
      <TestViewerFormatting>
        <Progress label="Weekly volume" current={13} target={11} />
      </TestViewerFormatting>,
    );

    expect(beaten).toContain(">100%<");
    expect(beaten).toContain('aria-valuetext="5.6 of 5.75"');
    expect(exceeded).toContain(">100%<");
    expect(exceeded).toContain('aria-valuenow="100"');
  });

  it("draws the lower-is-better fraction in the ring too", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Progress
          label="Magic mile"
          current={5.87}
          target={5.75}
          start={6.4}
          direction="lower"
          presentation="ring"
        />
      </TestViewerFormatting>,
    );

    expect(html).toContain('aria-label="Magic mile: 82%"');
  });

  it("gives the bar label its own full-width row instead of squeezing it against the percent figure", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Progress label="Strength" current={100} target={100} />
      </TestViewerFormatting>,
    );

    // Stacked by default so a narrow cell does not squeeze the label mid-word; `@min-[220px]/cell`
    // restores the row layout at the same threshold as `facts`.
    expect(html).toContain("flex min-w-0 flex-col gap-1 @min-[220px]/cell:flex-row");
    expect(html).toContain("wrap-normal hyphens-none text-ui font-medium leading-5 @max-[150px]/cell:text-supporting");
  });

  it("never splits the ring label mid-word and can shrink one type step in a narrow cell", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Progress label="Mobility" current={2} target={2} presentation="ring" />
      </TestViewerFormatting>,
    );

    expect(html).toContain("wrap-normal hyphens-none text-ui font-medium leading-5 @max-[150px]/cell:text-supporting");
  });

  it("carries the classes that drop its own border/padding when a card is its ancestor, in both presentations", () => {
    const bar = renderToStaticMarkup(
      <TestViewerFormatting>
        <Progress label="Readiness" current={3} target={4} />
      </TestViewerFormatting>,
    );
    const ring = renderToStaticMarkup(
      <TestViewerFormatting>
        <Progress label="Readiness" current={3} target={4} presentation="ring" />
      </TestViewerFormatting>,
    );

    // These only apply under a `data-in-card` ancestor, so both keep their own box.
    for (const html of [bar, ring]) {
      expect(html).toContain("[[data-in-card]_&amp;]:border-0");
      expect(html).toContain("[[data-in-card]_&amp;]:p-0");
      // Nested, it sizes to its content and packs from the top.
      expect(html).toContain("[[data-in-card]_&amp;]:h-auto");
      expect(html).toContain("[[data-in-card]_&amp;]:justify-start");
    }
  });
});
