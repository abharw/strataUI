import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "@/page-content/test-format";
import { Phases } from "./view";

/** `TestViewerFormatting` is pinned to noon on 2026-08-24 in New York. */
const stages = [
  { id: "base", name: "Base", start: "2026-08-03", end: "2026-08-24" },
  { id: "build", name: "Build", start: "2026-08-24", end: "2026-09-24" },
  { id: "taper", name: "Taper", start: "2026-09-24", end: "2026-10-04" },
];

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(<TestViewerFormatting>{node}</TestViewerFormatting>);
}

describe("the phases stepper", () => {
  it("derives the current stage from the viewer's clock rather than from the author", () => {
    const html = render(<Phases stages={stages} />);

    expect(html).toContain('data-stage="past"');
    expect(html).toContain('data-stage="current"');
    expect(html).toContain('data-stage="ahead"');
    expect(html.indexOf('data-stage="current"')).toBeGreaterThan(html.indexOf('data-stage="past"'));
    expect(html).toContain('aria-current="step"');
    expect(html.match(/aria-current="step"/g)?.length).toBe(1);
  });

  it("says which stage is current in words, not only in a fill", () => {
    const html = render(<Phases stages={stages} />);
    expect(html).toContain(">Now<");
  });

  it("names every stage and the span it covers", () => {
    const html = render(<Phases stages={stages} />);
    for (const stage of stages) {
      expect(html).toContain(stage.name);
      expect(html).toContain(`dateTime="${stage.start}"`);
    }
  });

  it("renders a target as a labelled date with the days still to run", () => {
    const html = render(<Phases stages={stages} target={{ label: "Race day", at: "2026-10-04" }} />);

    expect(html).toContain("Race day");
    expect(html).toContain('dateTime="2026-10-04"');
    expect(html).toContain("41 days left");
  });

  it("leaves the target line out when there is no date to build toward", () => {
    expect(render(<Phases stages={stages} />)).not.toContain("days left");
  });

  it("carries a note the author attached to a stage", () => {
    const html = render(
      <Phases stages={[{ ...stages[1], note: "First real jump in volume." }]} />,
    );
    expect(html).toContain("First real jump in volume.");
  });
});
