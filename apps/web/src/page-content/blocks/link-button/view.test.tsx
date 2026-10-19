import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LinkButton } from "./view";

describe("link-button", () => {
  it("announces a new context once on a link that leaves the app", () => {
    const html = renderToStaticMarkup(<LinkButton label="Read the filing" url="https://example.com/filing" />);

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html.match(/\(opens in a new tab\)/g)).toHaveLength(1);
  });

  it("says nothing about new tabs for a page inside the app", () => {
    const html = renderToStaticMarkup(<LinkButton label="Open the page" url="/pages/abc" />);

    expect(html).not.toContain("opens in a new tab");
    expect(html).not.toContain('target="_blank"');
  });

  it("stays plain text when the viewer has no link to follow", () => {
    const html = renderToStaticMarkup(<LinkButton label="Budget" page_id="pg_1" />);

    expect(html).toContain("not shared with you");
    expect(html).not.toContain("opens in a new tab");
  });
});
