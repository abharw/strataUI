import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "@/page-content/test-format";
import { StatusList, unknownStatusFallback } from "./view";

/**
 * Unknown statuses render with neutral chrome instead of throwing, which is what makes adding
 * statuses backward-compatible.
 */
describe("status-list unknown-variant fallback", () => {
  it("gives an unrecognized status neutral chrome and a readable label", () => {
    const { style, label } = unknownStatusFallback("needs-reschedule");
    expect(style.badge).toContain("bg-muted");
    expect(label).toBe("Needs reschedule");
  });

  it("keeps the row's content when the status is unknown", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <StatusList
          items={[
            {
              id: "visa",
              label: "Visa appointment",
              // A value from a newer registry version, read off a stored page.
              status: "escalated",
              owner: "Consulate",
              note: "Rebooked for the 9th.",
            },
          ]}
        />
      </TestViewerFormatting>,
    );

    expect(html).toContain("Visa appointment");
    expect(html).toContain("Consulate");
    expect(html).toContain("Rebooked for the 9th.");
    expect(html).toContain("Escalated");
  });

  it("renders every status the schema now accepts", () => {
    for (const status of [
      "not-started",
      "in-progress",
      "waiting-on-you",
      "waiting-on-them",
      "blocked",
      "at-risk",
      "cancelled",
      "done",
    ]) {
      const html = renderToStaticMarkup(
        <TestViewerFormatting>
          <StatusList items={[{ id: "x", label: "Item", status }]} />
        </TestViewerFormatting>,
      );
      expect(html, status).toContain(`data-status="${status}"`);
      expect(html, status).toContain("Item");
    }
  });
});

describe("status-list partial-precision since", () => {
  it("renders a year-month since without inventing a day", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <StatusList
          items={[{ id: "permit", label: "Permit", status: "blocked", since: "2026-03" }]}
        />
      </TestViewerFormatting>,
    );
    expect(html).toContain("since");
    expect(html).toContain("Mar 2026");
  });

  it("renders a bare-year since as the year", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <StatusList
          items={[{ id: "permit", label: "Permit", status: "blocked", since: "2026" }]}
        />
      </TestViewerFormatting>,
    );
    expect(html).toContain("2026");
  });
});

describe("status-list empty state", () => {
  it("renders the empty sentence instead of a blank shell", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <StatusList items={[]} empty="No open loops right now." />
      </TestViewerFormatting>,
    );
    expect(html).toContain("No open loops right now.");
  });
});
