import { describe, expect, it } from "vitest";

import { resolutionScript } from "./navigation";

describe("resolutionScript", () => {
  it("serializes the in-session target as data rather than executable JavaScript", () => {
    const href = "https://strata.test/pages/page_123/assets/report.pdf?name=\");globalThis.leaked=true;//";
    let assigned: string | undefined;
    const fakeGlobal = { leaked: false };
    const execute = new Function("window", "globalThis", resolutionScript(href));

    execute({ location: { assign: (value: string) => { assigned = value; } } }, fakeGlobal);

    expect(assigned).toBe(href);
    expect(fakeGlobal.leaked).toBe(false);
  });
});
