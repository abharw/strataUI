import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "@/page-content/test-format";
import { Checklist } from "./view";

describe("checklist empty state", () => {
  it("renders the empty sentence instead of a blank shell", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Checklist items={[]} empty="Nothing planned yet." />
      </TestViewerFormatting>,
    );
    expect(html).toContain("Nothing planned yet.");
  });

  it("still renders steps as before when items are present", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Checklist items={[{ id: "w1", label: "Swim 2 × 1,200 m", done: true }]} />
      </TestViewerFormatting>,
    );
    expect(html).toContain("Swim 2 × 1,200 m");
    expect(html).toContain("Completed");
  });
});

describe("checklist step links", () => {
  it("wraps a resolved page link around the label and leaves the box outside it", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Checklist
          items={[{
            id: "w1",
            label: "Book the pool lane",
            link: { page: "11111111-1111-1111-1111-111111111111", href: "/pages/pool" },
          }]}
        />
      </TestViewerFormatting>,
    );

    expect(html).toContain('href="/pages/pool"');
    // The anchor holds only the label; the checkbox reports state and is not a link.
    const anchor = html.slice(html.indexOf("<a "), html.indexOf("</a>"));
    expect(anchor).toContain("Book the pool lane");
    expect(anchor).not.toContain("Not completed");
    expect(anchor).not.toContain("<svg");
  });

  it("opens an external step in a new tab and says so once", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Checklist items={[{ id: "w1", label: "Register", link: { url: "https://example.com/register" } }]} />
      </TestViewerFormatting>,
    );

    expect(html).toContain('href="https://example.com/register"');
    expect(html).toContain('target="_blank"');
    expect(html.match(/\(opens in a new tab\)/g)).toHaveLength(1);
  });

  it("renders a step whose page the reader cannot reach as plain text", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Checklist items={[{ id: "w1", label: "Private step", link: { page: "22222222-2222-2222-2222-222222222222" } }]} />
      </TestViewerFormatting>,
    );

    expect(html).toContain("Private step");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("underline");
  });
});
