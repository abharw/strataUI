/** Unread query parameters are refused, so an ignored filter never looks like a right answer. */
import { describe, expect, it } from "vitest";

import { onlyParams } from "./body";

describe("query parameters nobody reads", () => {
  it("takes the ones the endpoint declares", () => {
    const request = new Request("https://strata.test/v1/pages?space_id=abc");
    expect(onlyParams(request, ["space_id"])).toBe(null);
  });

  it("refuses an invented filter instead of ignoring it", () => {
    const request = new Request("https://strata.test/v1/pages?state=all");
    const result = onlyParams(request, ["space_id"]);
    expect(result?.status).toBe(422);
    expect(result?.body.code).toBe("unknown_parameter");
    expect(result?.body.error).toContain("state");
  });

  it("says so plainly when an endpoint takes none", () => {
    const request = new Request("https://strata.test/v1/pages/abc?state=all");
    const result = onlyParams(request, []);
    expect(result?.status).toBe(422);
    expect(result?.body.error).toContain("takes no query parameters");
  });
});
