import { describe, expect, it } from "vitest";

import { jsonPointer, malformedIndexToken, unescapePointerToken } from "./json-pointer";

describe("jsonPointer", () => {
  it("preserves nested segments and RFC 6901-escapes slashes and tildes", () => {
    expect(jsonPointer(["elements", "a/b~c", "props", "series", 0, "values"]))
      .toBe("/elements/a~1b~0c/props/series/0/values");
    expect(jsonPointer([])).toBe("");
  });
});

describe("unescapePointerToken", () => {
  it("decodes ~1 before ~0, so an escaped ~1 survives as itself", () => {
    expect(unescapePointerToken("~01")).toBe("~1");
    expect(unescapePointerToken("a~1b~0c")).toBe("a/b~c");
    expect(unescapePointerToken("plain")).toBe("plain");
  });
});

describe("malformedIndexToken", () => {
  it("passes element ids, prop names, canonical indexes, and append", () => {
    for (const pointer of [
      "/root",
      "/elements/status-list/props/items/0",
      "/elements/status-list/props/items/12",
      "/elements/status-list/props/items/-",
      "/elements/a1/props/y_min",
    ]) expect(malformedIndexToken(pointer)).toBeNull();
  });

  it("catches the tokens core would coerce with parseInt", () => {
    expect(malformedIndexToken("/elements/t/props/items/1foo")).toBe("1foo");
    expect(malformedIndexToken("/elements/t/props/items/01")).toBe("01");
    expect(malformedIndexToken("/elements/t/props/items/1.5")).toBe("1.5");
    expect(malformedIndexToken("/elements/t/props/items/-1")).toBe("-1");
    expect(malformedIndexToken("/elements/t/props/items/99999999999999999999")).toBe("99999999999999999999");
  });
});
