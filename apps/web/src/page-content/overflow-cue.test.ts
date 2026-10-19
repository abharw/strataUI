import { describe, expect, it } from "vitest";

import { scrollState } from "./overflow-cue";

describe("overflow cue measurement", () => {
  it("says nothing about content that fits", () => {
    expect(scrollState({ scrollLeft: 0, clientWidth: 320, scrollWidth: 320 })).toEqual({
      overflowing: false,
      more: false,
      thumb: 100,
      offset: 0,
    });
  });

  it("ignores the sub-pixel difference a fitting scroller can still report", () => {
    expect(scrollState({ scrollLeft: 0, clientWidth: 320, scrollWidth: 320.5 }).overflowing).toBe(false);
  });

  it("offers a scroll path only while content remains in that direction", () => {
    const start = scrollState({ scrollLeft: 0, clientWidth: 320, scrollWidth: 640 });
    expect(start).toEqual({ overflowing: true, more: true, thumb: 50, offset: 0 });

    const end = scrollState({ scrollLeft: 320, clientWidth: 320, scrollWidth: 640 });
    expect(end.overflowing).toBe(true);
    expect(end.more).toBe(false);
    expect(end.offset).toBe(50);
  });
});
