/** Every response gets the same cache and indexing headers, and handler headers survive. */
import { describe, expect, it } from "vitest";

import { json } from "./response";

describe("transport metadata", () => {
  it("renders a bearer challenge without weakening private no-store responses", () => {
    const response = json({
      status: 401,
      body: { error: "Authenticate", code: "unauthenticated", next: ["get_guide"] },
      headers: { "WWW-Authenticate": "Bearer" },
    });
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("serves a result carrying an ETag as no-cache, and a matching reader gets 304", async () => {
    const result = { status: 200, body: { topic: "authoring", text: "…" }, headers: { ETag: '"abc"' } };
    const fresh = json(result, undefined, null);
    expect(fresh.status).toBe(200);
    expect(fresh.headers.get("cache-control")).toBe("private, no-cache");
    expect(fresh.headers.get("etag")).toBe('"abc"');
    const held = json(result, undefined, '"abc"');
    expect(held.status).toBe(304);
    expect(held.headers.get("etag")).toBe('"abc"');
    expect(await held.text()).toBe("");
  });
});
