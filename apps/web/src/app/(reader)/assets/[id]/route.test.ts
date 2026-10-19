/**
 * `GET /assets/:id`. Each render mints a new signature for unchanged bytes, so the ETag is what
 * keeps re-renders from re-downloading every attachment.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const readForServing = vi.hoisted(() => vi.fn());
// Only the read is mocked; `requestedVariant` stays real.
vi.mock("@/server/assets", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/assets")>(),
  readForServing,
}));

import { GET } from "./route";

const BYTES = Buffer.from("the report, verbatim");
const SHA = createHash("sha256").update(BYTES).digest("hex");
const ETAG = `"${SHA}"`;
const bytes = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  bytes.mockResolvedValue(BYTES);
  readForServing.mockResolvedValue({
    mediaType: "text/plain",
    filename: "report.txt",
    sha256: SHA,
    bytes,
  });
});

function get(headers: Record<string, string> = {}, query = ""): Promise<Response> {
  return GET(
    new Request(`https://strata.test/assets/abc?expires=99&signature=sig${query}`, { headers }),
    { params: Promise.resolve({ id: "abc" }) },
  );
}

const THUMB = Buffer.from("the same photo, smaller");

describe("GET /assets/:id", () => {
  it("serves the bytes with a validator and the headers that keep them inert", async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe(ETAG);
    expect(response.headers.get("content-length")).toBe(String(BYTES.byteLength));
    expect(await response.text()).toBe(BYTES.toString());
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toContain("private");
  });

  it("answers 304 for a validator the browser already holds, without reading the blob", async () => {
    const response = await get({ "if-none-match": ETAG });

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(response.headers.get("etag")).toBe(ETAG);
    // The digest comes from the row, so the bytes are never read.
    expect(bytes).not.toHaveBeenCalled();
  });

  it("reads a list and a weak tag, the way RFC 9110 says to", async () => {
    expect((await get({ "if-none-match": `"other", W/${ETAG}` })).status).toBe(304);
    expect((await get({ "if-none-match": "*" })).status).toBe(304);
    expect((await get({ "if-none-match": '"stale"' })).status).toBe(200);
  });

  it("still serves a row stored before digests were recorded", async () => {
    readForServing.mockResolvedValue({ mediaType: "text/plain", filename: "report.txt", sha256: null, bytes });
    const response = await get({ "if-none-match": ETAG });

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBeNull();
  });

  it("serves the derived variant when the address asks for one", async () => {
    readForServing.mockResolvedValue({
      variant: "thumb",
      mediaType: "image/webp",
      filename: "photo.webp",
      sha256: SHA,
      bytes: vi.fn().mockResolvedValue(THUMB),
    });

    const response = await get({}, "&w=thumb");

    expect(readForServing).toHaveBeenCalledWith(expect.objectContaining({ variant: "thumb" }));
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("content-disposition")).toContain("photo.webp");
    // Variant-qualified so a cached thumbnail never satisfies a request for the original.
    expect(response.headers.get("etag")).toBe(`"${SHA}-thumb"`);
    expect(response.headers.get("cache-control")).toBe(
      (await get()).headers.get("cache-control"),
    );
    expect(await response.text()).toBe(THUMB.toString());
  });

  it("asks for the original unless the address says otherwise", async () => {
    await get();
    expect(readForServing).toHaveBeenCalledWith(expect.objectContaining({ variant: "original" }));

    await get({}, "&w=nonsense");
    expect(readForServing).toHaveBeenLastCalledWith(expect.objectContaining({ variant: "original" }));
  });

  it("falls back to the original for an asset that has no variant", async () => {
    // e.g. PDFs: the read returns the original and the route follows it.
    const response = await get({}, "&w=thumb");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(response.headers.get("etag")).toBe(ETAG);
  });

  it("says only Not found for a signature that does not check out", async () => {
    readForServing.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  it("says Not found when the row is there and the bytes are not", async () => {
    bytes.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });
});
