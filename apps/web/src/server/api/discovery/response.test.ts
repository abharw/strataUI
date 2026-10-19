import { describe, expect, it } from "vitest";

import { CONTRACT_VERSION } from "@/shared/api/version";
import { discoveryResponse, etagFor, etagMatches } from "./response";

const serve = (headers: Record<string, string> = {}) =>
  discoveryResponse(new Request("https://strata.test/llms.txt", { headers }), "# Strata\n", {
    contentType: "text/markdown; charset=utf-8",
  });

describe("a discovery document", () => {
  it("is revalidated on every read and stamped with the contract", async () => {
    const response = serve();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, no-cache");
    expect(response.headers.get("etag")).toBe(etagFor("# Strata\n"));
    expect(response.headers.get("x-strata-contract")).toBe(CONTRACT_VERSION);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("link")).toContain("service-desc");
    expect(await response.text()).toBe("# Strata\n");
  });

  it("costs a 304 when the reader already holds it", async () => {
    const etag = serve().headers.get("etag")!;
    const response = serve({ "If-None-Match": etag });
    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe(etag);
    expect(response.headers.get("x-strata-contract")).toBe(CONTRACT_VERSION);
    expect(await response.text()).toBe("");
  });

  it("sends the body again once it changed", () => {
    expect(serve({ "If-None-Match": '"stale"' }).status).toBe(200);
  });

  it("matches weak and multi-valued If-None-Match", () => {
    const etag = etagFor("x");
    expect(etagMatches(`W/${etag}`, etag)).toBe(true);
    expect(etagMatches(`"a", ${etag}`, etag)).toBe(true);
    expect(etagMatches("*", etag)).toBe(true);
    expect(etagMatches('"a"', etag)).toBe(false);
    expect(etagMatches(null, etag)).toBe(false);
  });
});
