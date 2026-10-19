import { describe, expect, it } from "vitest";

import { brokenBlockNextState } from "./broken-block";

/** The boundary stays broken for the version that threw and resets on the next one. */
describe("broken block across versions", () => {
  it("keeps the placeholder while the version that threw is still on screen", () => {
    expect(brokenBlockNextState({ specVersion: 7 }, { broken: true, specVersion: 7 })).toBe(null);
  });

  it("clears the placeholder when a newer spec arrives", () => {
    expect(brokenBlockNextState({ specVersion: 8 }, { broken: true, specVersion: 7 })).toEqual({
      broken: false,
      specVersion: 8,
    });
  });

  it("leaves a healthy block alone on a new version", () => {
    expect(brokenBlockNextState({ specVersion: 8 }, { broken: false, specVersion: 7 })).toEqual({
      broken: false,
      specVersion: 8,
    });
  });
});
