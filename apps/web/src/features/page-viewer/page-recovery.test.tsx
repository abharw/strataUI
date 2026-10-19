/**
 * `PageError` and `PageMissing` are also rendered by generic boundaries that know nothing about
 * the key or page, so their copy may claim only what those callers know.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PageError } from "./page-error";
import { PageMissing } from "./page-missing";

describe("PageError", () => {
  it("states only what a boundary can establish", () => {
    const html = renderToStaticMarkup(<PageError retry={vi.fn()} />);

    expect(html).toContain("Something went wrong while opening it.");
    expect(html).toMatch(/>\s*Try again\s*</u);
    expect(html).not.toContain("The link is fine");
    expect(html).not.toContain("nothing has been lost");
    expect(html).not.toContain("come back on its own");
  });
});

describe("PageMissing", () => {
  it("keeps asking the sender first and adds a way back for whoever has a Strata", () => {
    const html = renderToStaticMarkup(<PageMissing />);

    expect(html).toContain("Ask whoever sent it for the");
    expect(html).toContain(">Open Strata<");
    expect(html).toContain('href="/home"');
    // The markup is the same whether or not a key ever existed.
    expect(html).not.toContain("your Page");
    expect(html).toContain("The address is either no longer in use");
    expect(html.indexOf("Ask whoever sent it")).toBeLessThan(html.indexOf("Open Strata"));
  });
});
