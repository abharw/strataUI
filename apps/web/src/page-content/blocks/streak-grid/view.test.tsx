import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "@/page-content/test-format";
import { StreakGrid } from "./view";

describe("StreakGrid", () => {
  it("refuses an unbounded range even if validation is bypassed", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <StreakGrid
          cells={[
            { date: "1900-01-01", value: 1 },
            { date: "2100-01-01", value: 1 },
          ]}
        />
      </TestViewerFormatting>,
    );
    expect(html).toContain("too large to display safely");
    expect(html).not.toContain("data-strata-streak-cell");
  });
});

describe("an empty streak grid", () => {
  it("renders the author's sentence through the one empty state, not a blank calendar", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <StreakGrid cells={[]} empty="No training days logged yet." />
      </TestViewerFormatting>,
    );

    expect(html).toContain("No training days logged yet.");
    expect(html).not.toContain("data-strata-streak-cell");
    expect(html).not.toContain("No streak days yet");
  });
});

/** The test clock is 2026-08-24 in America/New_York (`page-content/test-format.tsx`). */
describe("a streak grid's days window", () => {
  it("draws the whole window from the reader's today back, filling the days no cell names", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <StreakGrid days={7} cells={[{ date: "2026-08-24", value: 3 }]} />
      </TestViewerFormatting>,
    );

    // Seven days ending today starts on 2026-08-18; every day is drawn, though only one has a cell.
    expect(html).toContain("2026-08-18: no observation");
    expect(html).toContain("2026-08-24: 3");
    expect(html).toContain('dateTime="2026-08-18"');
    expect(html).toContain('dateTime="2026-08-24"');
    // One recorded day, and the caption counts the cells rather than the window.
    expect(html).toContain("1 active day");
  });

  it("ends the window on end when the author fixed one, not on the reader's today", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <StreakGrid days={7} end="2026-07-31" cells={[{ date: "2026-07-31", value: 1 }]} />
      </TestViewerFormatting>,
    );

    expect(html).toContain("2026-07-25: no observation");
    expect(html).toContain("2026-07-31: 1");
    expect(html).toContain('dateTime="2026-07-25"');
    expect(html).toContain('dateTime="2026-07-31"');
    // The reader's today is outside this window, so it is not drawn at all.
    expect(html).not.toContain("2026-08-24");
  });

  it("keeps a grid with no days exactly the range its cells describe", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <StreakGrid
          cells={[
            { date: "2026-08-19", value: 1 },
            { date: "2026-08-21", value: 2 },
          ]}
        />
      </TestViewerFormatting>,
    );

    expect(html).toContain("2026-08-19: 1");
    expect(html).toContain("2026-08-21: 2");
    // The range is the cells' own, so the caption still names 19 through 21.
    expect(html).toContain('dateTime="2026-08-19"');
    expect(html).toContain('dateTime="2026-08-21"');
    expect(html).not.toContain("2026-08-24:");
  });

  it("drops a cell that has since fallen out of a floating window", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <StreakGrid
          days={7}
          cells={[
            { date: "2026-08-01", value: 9 },
            { date: "2026-08-24", value: 1 },
          ]}
        />
      </TestViewerFormatting>,
    );

    expect(html).not.toContain("2026-08-01");
    expect(html).toContain("2026-08-24: 1");
  });
});
