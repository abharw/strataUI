import { describe, expect, it } from "vitest";

import { changesSince, compareContract, CONTRACT_CHANGES, CONTRACT_VERSION } from "./version";

describe("the contract version", () => {
  it("is the newest entry in its own change list", () => {
    expect(CONTRACT_CHANGES.at(-1)?.version).toBe(CONTRACT_VERSION);
  });

  it("lists changes oldest first and never repeats a version", () => {
    const versions = CONTRACT_CHANGES.map((change) => change.version);
    expect([...versions].sort(compareContract)).toEqual(versions);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("orders by date then counter, numerically", () => {
    expect(compareContract("2026-09-09.2", "2026-09-09.10")).toBeLessThan(0);
    expect(compareContract("2026-09-10.1", "2026-09-09.9")).toBeGreaterThan(0);
    expect(compareContract("2026-09-09.1", "2026-09-09.1")).toBe(0);
    expect(compareContract("garbage", "2026-01-01.1")).toBeLessThan(0);
  });

  it("gives a current agent nothing and a stale one every change it missed", () => {
    expect(changesSince(CONTRACT_VERSION)).toEqual([]);
    expect(changesSince("2026-01-01.1")).toEqual(CONTRACT_CHANGES);
    expect(changesSince("nonsense")).toEqual(CONTRACT_CHANGES);
  });

  it("points a stale agent at the guide and manifest", () => {
    const note = CONTRACT_CHANGES.at(-1)?.note ?? "";
    expect(note).toContain("GET /v1/guide?topic=authoring");
    expect(note).toContain("GET /v1/manifest");
  });
});
