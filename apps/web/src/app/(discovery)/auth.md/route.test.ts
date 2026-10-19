import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

describe("auth.md", () => {
  const configured = process.env.PUBLIC_BASE_URL;

  afterEach(() => {
    if (configured === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = configured;
  });

  const fetchDoc = () => {
    process.env.PUBLIC_BASE_URL = "https://strata.test";
    return GET(new Request("https://internal.test/auth.md"));
  };

  it("serves revalidated, unindexed markdown", async () => {
    const response = fetchDoc();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(response.headers.get("cache-control")).toBe("public, no-cache");
    expect(response.headers.get("etag")).toMatch(/^"[A-Za-z0-9_-]+"$/);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("link")).toContain("service-desc");
    expect(await response.text()).toContain("# Connecting to Strata");
  });

  it("opens with the tokens it may already hold, not with a question", async () => {
    const body = await fetchDoc().text();
    expect(body).toContain("You already hold Strata tokens");
    expect(body.indexOf("You already hold Strata tokens")).toBeLessThan(
      body.indexOf("/v1/auth/start"),
    );
    expect(body).not.toMatch(/Do you already have a Strata\?/);
  });

  it("gives the two connection calls, in order, and the refresh dead end", async () => {
    const body = await fetchDoc().text();
    expect(body).toContain("/v1/auth/start");
    expect(body).toContain("/v1/auth/verify");
    expect(body.indexOf("/v1/auth/start")).toBeLessThan(body.indexOf("/v1/auth/verify"));
    expect(body).toContain("/v1/auth/refresh");
    expect(body).toContain("namespace_display_name");
    expect(body).toContain("`invalid_grant`");
  });

  it("contains no credential of its own", async () => {
    const body = await fetchDoc().text();
    expect(body).not.toMatch(/\b(?:sw|sv|sr|sk)_[A-Za-z0-9_-]{8,}/);
  });
});
