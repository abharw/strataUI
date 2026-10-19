import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "@/page-content/test-format";
import { Timeline } from "./view";

describe("timeline", () => {
  it("renders history newest first with complete dates", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Timeline
          events={[
            {
              id: "older",
              at: "2026-08-20",
              title: "Quote received",
              note: "Held for 72 hours.",
            },
            {
              id: "newer",
              at: "2026-08-24T09:30:00-04:00",
              title: "Deposit paid",
            },
          ]}
          order="descending"
        />
      </TestViewerFormatting>,
    );

    expect(html).toContain('role="list"');
    expect(html.match(/role="listitem"/g)).toHaveLength(2);
    expect(html.indexOf("Deposit paid")).toBeLessThan(html.indexOf("Quote received"));
    expect(html).toContain('dateTime="2026-08-24T09:30:00-04:00"');
    expect(html).toContain('dateTime="2026-08-20"');
    expect(html).not.toContain('data-completed="true"');
  });

  it("renders an itinerary through the same timeline with one shared date and local times", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Timeline
          events={[
            {
              id: "dinner",
              at: "2026-09-12",
              time: "20:30",
              title: "Dinner",
              place: "Taberna da Rua das Flores",
            },
            {
              id: "landing",
              at: "2026-09-12",
              time: "14:05",
              title: "Land at Humberto Delgado",
              place: "LIS Terminal 1",
              ref: "TAP 1049",
            },
          ]}
          order="ascending"
        />
      </TestViewerFormatting>,
    );

    expect(html.indexOf("Land at Humberto Delgado")).toBeLessThan(
      html.indexOf("Dinner"),
    );
    expect(html).toContain('dateTime="2026-09-12"');
    expect(html).toContain('dateTime="2026-09-12T14:05"');
    expect(html).toContain("LIS Terminal 1");
    expect(html).toContain("TAP 1049");
    expect(html).toContain("14:05");
  });
});

describe("timeline marker", () => {
  it("draws the ring in the secondary gray, not the hairline", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Timeline events={[{ id: "one", at: "2026-08-20", title: "Quote received" }]} />
      </TestViewerFormatting>,
    );
    // The dot needs a visible ring, not the hairline border.
    expect(html).toContain("border-muted-foreground");
    expect(html).not.toMatch(/timeline-indicator[^>]*border-border\b/u);
  });

  it("draws the rail in the same gray as the ring", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Timeline
          events={[
            { id: "one", at: "2026-08-20", title: "Quote received" },
            { id: "two", at: "2026-08-21", title: "Deposit paid" },
          ]}
        />
      </TestViewerFormatting>,
    );
    expect(html).toMatch(/timeline-separator[^>]*bg-muted-foreground\b|bg-muted-foreground[^>]*timeline-separator/u);
    expect(html).not.toMatch(/timeline-separator[^>]*bg-border\b|bg-border[^>]*timeline-separator/u);
  });

  it("sorts coarse dates against fuller ones by ISO prefix, and labels them", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Timeline
          events={[
            { id: "launch", at: "2019-06-04", title: "Launch" },
            { id: "founded", at: "2019", title: "Company founded" },
            { id: "seed", at: "2019-06", title: "Seed round" },
          ]}
          order="ascending"
        />
      </TestViewerFormatting>,
    );

    expect(html.indexOf("Company founded")).toBeLessThan(html.indexOf("Seed round"));
    expect(html.indexOf("Seed round")).toBeLessThan(html.indexOf("Launch"));
    // A bare year is not an instant: it renders as itself, and stays its own
    // machine-readable value.
    expect(html).toContain("2019");
    expect(html).toContain('dateTime="2019"');
    expect(html).toContain("Jun 2019");
  });
});

describe("a linked timeline event", () => {
  it("makes an internal page's title the tap target once the reader may open it", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Timeline
          events={[
            {
              id: "race-start",
              at: "2026-10-04",
              title: "Wave start",
              link: { page: "2f4c8a1e-6b30-4d7a-9c15-8e0b3d5a7f21", href: "/p/race-morning" },
            },
          ]}
        />
      </TestViewerFormatting>,
    );

    expect(html).toContain('href="/p/race-morning"');
    expect(html).toContain("Wave start");
  });

  it("opens an external destination in a new tab and says so once", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Timeline
          events={[
            {
              id: "packet-pickup",
              at: "2026-10-02",
              title: "Packet pickup",
              link: { url: "https://example.org/athlete-guide" },
            },
          ]}
        />
      </TestViewerFormatting>,
    );

    expect(html).toContain('href="https://example.org/athlete-guide"');
    expect(html).toContain('target="_blank"');
  });

  it("draws no affordance for a page this reader cannot reach", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Timeline
          events={[
            {
              id: "race-start",
              at: "2026-10-04",
              title: "Wave start",
              link: { page: "2f4c8a1e-6b30-4d7a-9c15-8e0b3d5a7f21" },
            },
          ]}
        />
      </TestViewerFormatting>,
    );

    expect(html).not.toContain("<a ");
    expect(html).toContain('data-page-id="2f4c8a1e-6b30-4d7a-9c15-8e0b3d5a7f21"');
    expect(html).toContain("Wave start");
  });

  it("leaves an unlinked event as plain content", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Timeline events={[{ id: "recon", at: "2026-10-03", title: "Course recon swim" }]} />
      </TestViewerFormatting>,
    );

    expect(html).not.toContain("<a ");
    expect(html).not.toContain("data-page-id");
  });
});

describe("an empty timeline", () => {
  it("renders the author's sentence through the one empty state, not a bare rail", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Timeline events={[]} empty="Nothing scheduled for race week yet." />
      </TestViewerFormatting>,
    );

    expect(html).toContain("Nothing scheduled for race week yet.");
    expect(html).not.toContain("timeline-separator");
  });
});
