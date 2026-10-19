import { describe, expect, it } from "vitest";

import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("keeps a plain absolute path", () => {
    expect(safeNextPath("/pages/abc")).toBe("/pages/abc");
    expect(safeNextPath("/home?tab=recent")).toBe("/home?tab=recent");
  });

  it("drops everything that could leave this origin", () => {
    for (const hostile of [
      "//evil.example/steal",
      "/\\evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      "pages/abc",
      "/pages\nLocation: https://evil.example",
      "",
      null,
      undefined,
    ]) {
      expect(safeNextPath(hostile)).toBeNull();
    }
  });
});
