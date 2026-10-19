import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ requireWebSessionNamespace: vi.fn() }));
const searchMocks = vi.hoisted(() => ({ searchOwnedPageText: vi.fn() }));

vi.mock("@/server/auth/web-session", () => authMocks);
vi.mock("@/server/pages/read/search", () => ({
  MAX_OWNER_SEARCH_CHARS: 160,
  searchOwnedPageText: searchMocks.searchOwnedPageText,
}));

import { GET } from "./route";

const NAMESPACE = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.requireWebSessionNamespace.mockResolvedValue({
    namespaceId: NAMESPACE,
    sessionId: "00000000-0000-4000-8000-000000000002",
  });
  searchMocks.searchOwnedPageText.mockResolvedValue(["page-one"]);
});

describe("GET /home/search", () => {
  it("returns only matching IDs behind the live owner namespace", async () => {
    const response = await GET(new Request("https://strata.test/home/search?q=cobalt"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ page_ids: ["page-one"] });
    expect(searchMocks.searchOwnedPageText).toHaveBeenCalledWith(NAMESPACE, "cobalt");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("refuses oversized queries before reading any Page", async () => {
    const response = await GET(new Request(
      `https://strata.test/home/search?q=${"x".repeat(161)}`,
    ));

    expect(response.status).toBe(400);
    // Standard contract error body, including the offending field.
    expect(await response.json()).toMatchObject({ code: "invalid_request", path: "/q" });
    expect(searchMocks.searchOwnedPageText).not.toHaveBeenCalled();
  });

  it("keeps the owner headers on a failed search rather than a bare 500", async () => {
    searchMocks.searchOwnedPageText.mockRejectedValue(new Error("connection lost"));
    const response = await GET(new Request("https://strata.test/home/search?q=cobalt"));

    expect(response.status).toBe(500);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.json()).toMatchObject({ code: "internal_error" });
  });

  it("does not turn a missing owner session into a public search", async () => {
    authMocks.requireWebSessionNamespace.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(GET(new Request("https://strata.test/home/search?q=cobalt")))
      .rejects.toThrow("NEXT_NOT_FOUND");
    expect(searchMocks.searchOwnedPageText).not.toHaveBeenCalled();
  });
});
