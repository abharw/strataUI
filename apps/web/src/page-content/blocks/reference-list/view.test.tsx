import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "@/page-content/test-format";
import { ReferenceList, clamps } from "./view";

const LONG_TITLE =
  "A deliberately long reference title that keeps going past the two lines a phone can show, so the clamp has something to hold back";

describe("reference-list", () => {
  it("renders quiet external source rows with safe link attributes", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ReferenceList
          items={[{
            id: "catalog",
            title: "Catalogs",
            url: "https://json-render.dev/docs/catalog",
            published_at: "2026-08-21T19:00:00Z",
            note: "Model-facing vocabulary.",
          }]}
        />
      </TestViewerFormatting>,
    );
    expect(html).toContain('aria-label="References"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("json-render.dev");
    expect(html).toContain('dateTime="2026-08-21T19:00:00Z"');
    expect(html).toContain("Aug 21, 2026, 3:00 PM");
    expect(html).toContain("Model-facing vocabulary.");
  });

  // The arrow is decorative; the link's own name announces the new tab.
  it("says a reference leaves for a new tab exactly once per row", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ReferenceList
          items={[
            { id: "one", title: "One", url: "https://example.com/one" },
            { id: "two", title: "Two", url: "https://example.com/two" },
          ]}
        />
      </TestViewerFormatting>,
    );

    expect(html.match(/\(opens in a new tab\)/g)).toHaveLength(2);
  });

  // Overflow is measured on the client, so the server sends the clamped row without a toggle.
  it("clamps to two lines and keeps the withheld text present", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ReferenceList
          items={[{ id: "long", title: LONG_TITLE, url: "https://example.com", note: LONG_TITLE }]}
        />
      </TestViewerFormatting>,
    );

    expect(html.match(/line-clamp-2/g)).toHaveLength(2);
    expect(html.match(new RegExp(LONG_TITLE, "g"))).toHaveLength(2);
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain("title=");
  });
});

describe("reference-list empty state", () => {
  it("renders the empty sentence instead of a blank shell", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ReferenceList items={[]} empty="No sources yet." />
      </TestViewerFormatting>,
    );
    expect(html).toContain("No sources yet.");
  });
});

describe("clamped text", () => {
  it("offers to open only what the clamp is actually holding back", () => {
    expect(clamps({ scrollHeight: 40, clientHeight: 40 })).toBe(false);
    expect(clamps({ scrollHeight: 40.5, clientHeight: 40 })).toBe(false);
    expect(clamps({ scrollHeight: 120, clientHeight: 40 })).toBe(true);
  });
});
