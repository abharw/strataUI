import { describe, expect, it } from "vitest";

import { TITLE_LIMIT, fitTitle } from "./fit-title";

describe("fitTitle", () => {
  it("leaves a title that fits alone", () => {
    expect(fitTitle("Iceland packing list")).toBe("Iceland packing list");
  });

  it("cuts a long title at a word boundary", () => {
    const title = `${"word ".repeat(40)}end`;
    const fitted = fitTitle(title);
    expect(fitted.endsWith("…")).toBe(true);
    expect(fitted).not.toContain("wor…");
    expect(fitted.length).toBeLessThanOrEqual(TITLE_LIMIT + 1);
  });

  it("still bounds a title with no whitespace to cut at", () => {
    // e.g. a pasted identifier or a CJK title.
    const title = "x".repeat(120);
    const fitted = fitTitle(title);
    expect(fitted.length).toBe(TITLE_LIMIT + 1);
    expect(fitted.endsWith("…")).toBe(true);
  });
});
