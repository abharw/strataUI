import { describe, expect, it, vi } from "vitest";

import { IDLE_PARK_MS } from "@/shared/polling";

import {
  RELOAD_MARK_KEY,
  assetsRunningOut,
  pollStop,
  spendReload,
} from "./poll";

describe("when the loop stops", () => {
  const live = {
    gone: false,
    agentUpdating: false,
    visible: true,
    lastInteractionAt: 0,
    now: 0,
  };

  it("keeps asking while the reader is looking, however long they sit there", () => {
    expect(pollStop({ ...live, now: IDLE_PARK_MS * 10 })).toBe(null);
  });

  it("stops for good once the address is gone: it is final, and nothing is coming", () => {
    expect(pollStop({ ...live, gone: true })).toBe("gone");
  });

  it("stops a gone page even while the reader is looking at it", () => {
    expect(pollStop({ ...live, gone: true, visible: true })).toBe("gone");
  });

  it("keeps a hidden tab going until the idle window is up", () => {
    expect(pollStop({ ...live, visible: false, now: IDLE_PARK_MS - 1 })).toBe(null);
    expect(pollStop({ ...live, visible: false, now: IDLE_PARK_MS })).toBe("idle");
  });

  it("keeps a hidden tab going while its agent is still writing", () => {
    expect(pollStop({ ...live, visible: false, agentUpdating: true, now: IDLE_PARK_MS })).toBe(null);
  });
});

describe("the one reload a skew is allowed", () => {
  function storage(initial?: string) {
    const held = new Map<string, string>(initial === undefined ? [] : [[RELOAD_MARK_KEY, initial]]);
    return {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => void held.set(key, value),
      read: () => held.get(RELOAD_MARK_KEY) ?? null,
    };
  }

  it("reloads once and records the reason before it does", () => {
    const store = storage();
    const reload = vi.fn();
    expect(spendReload(store, "registry:4", reload)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(store.read()).toBe("registry:4");
  });

  it("refuses the second reload for the same reason", () => {
    // A repeat would reload every tick on every open tab.
    const reload = vi.fn();
    expect(spendReload(storage("registry:4"), "registry:4", reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("still reloads for a registry it has not tried yet", () => {
    const reload = vi.fn();
    expect(spendReload(storage("registry:4"), "registry:5", reload)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("refuses when there is nowhere to record the attempt", () => {
    // An uncounted reload could loop.
    const reload = vi.fn();
    expect(spendReload(undefined, "registry:4", reload)).toBe(false);
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage is disabled");
      },
    };
    expect(spendReload(refusing, "registry:4", reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("when to ask for new file links", () => {
  const now = 1_700_000_000_000;
  const at = (seconds: number) => `/assets/one?expires=${Math.floor(now / 1000) + seconds}&signature=sig`;
  const resource = (href: string) => ({
    href,
    filename: "one.jpg",
    media_type: "image/jpeg",
    size_bytes: 1024,
  });

  it("waits while the links on screen still have most of their life", () => {
    expect(assetsRunningOut({ one: resource(at(9 * 60)) }, now)).toBe(false);
  });

  it("asks once a link is inside its last five minutes", () => {
    expect(assetsRunningOut({ one: resource(at(4 * 60)) }, now)).toBe(true);
  });

  it("goes by the one that dies first", () => {
    expect(assetsRunningOut({ one: resource(at(9 * 60)), two: resource(at(60)) }, now)).toBe(true);
  });

  it("asks for nothing when the page has no files", () => {
    expect(assetsRunningOut({}, now)).toBe(false);
  });
});
