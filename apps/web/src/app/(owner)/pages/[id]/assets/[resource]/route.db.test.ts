/**
 * The resource id is not a capability: it is re-checked against a page the session owns, and the
 * response is a 302 to a freshly signed URL so long-open pages still load files.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { inArray } from "drizzle-orm";

const authMocks = vi.hoisted(() => ({
  requireWebSessionNamespace: vi.fn(),
  currentSessionNamespace: vi.fn(),
  expireSessionCookie: vi.fn(),
  readHomeData: vi.fn(async <T>(read: () => Promise<T>) => read()),
}));
vi.mock("@/server/auth/web-session", () => authMocks);
// Assembly reads the origin from request scope, which a route test does not provide.
vi.mock("@/server/api/http/read-origin", () => ({ readOrigin: async () => "https://strata.test" }));

import { getDb, schema } from "@/server/db";
import { DEFAULT_WRITER_SCOPES } from "@/server/credentials";
import { acceptBytes, reserve } from "@/server/assets";
import { put } from "@/server/pages/handlers";
import { createCredentialNamespace } from "@/test/namespace";
import type { StrataSpec } from "@/page-content/schema";

import { GET } from "./route";

const BASE = "https://strata.test";
const db = getDb();
const namespaceIds: string[] = [];

// Shared across cases; none of them write to it.
let fixture: Awaited<ReturnType<typeof owned>>;

beforeAll(async () => {
  fixture = await owned();
});

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.readHomeData.mockImplementation(async <T>(read: () => Promise<T>) => read());
  authMocks.requireWebSessionNamespace.mockResolvedValue({
    namespaceId: fixture.namespaceId,
    sessionId: crypto.randomUUID(),
  });
});

afterAll(async () => {
  if (namespaceIds.length > 0) {
    await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
  }
});

// Real pixels, since the thumbnail variant is produced by decoding and resizing.
async function photo(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let index = 0; index < pixels.length; index += 3) {
    const pixel = index / 3;
    pixels[index] = pixel % 256;
    pixels[index + 1] = Math.floor(pixel / width) % 256;
    pixels[index + 2] = (pixel % 256) ^ 0x40;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

function uploadParts(uploadUrl: string): { assetId: string; expiresAt: number; signature: string } {
  const url = new URL(uploadUrl);
  return {
    assetId: url.pathname.split("/")[3],
    expiresAt: Number(url.searchParams.get("expires")),
    signature: url.searchParams.get("signature") ?? "",
  };
}

function specWith(resourceId: string): StrataSpec {
  return {
    root: "root",
    answer: { verdict: "The survey is attached." },
    elements: {
      root: { type: "section", props: {}, children: ["files"] },
      files: {
        type: "attachment-list",
        props: { items: [{ id: "survey", resource_id: resourceId, label: "The roof survey" }] },
        children: [],
      },
    },
  };
}

async function owned() {
  const created = await createCredentialNamespace({ baseUrl: BASE });
  namespaceIds.push(created.namespace_id);

  const bytes = await photo(960, 540);
  const ticket = await reserve({
    namespaceId: created.namespace_id,
    baseUrl: BASE,
    filename: "roof.png",
    mediaType: "image/png",
    sizeBytes: bytes.byteLength,
  });
  await acceptBytes({ ...uploadParts(ticket.upload_url), bytes });

  const written = await put({
    namespace_id: created.namespace_id,
    kind: "writer",
    grant_id: created.grant_id,
    scope: DEFAULT_WRITER_SCOPES,
    baseUrl: BASE,
  }, {
    space: { slug: "roof", name: "Roof", emoji: "🏠" },
    slug: "survey",
    title: "Roof survey",
    summary: "Attached the survey",
    spec: specWith(ticket.resource_id),
  });
  expect(written.status).toBe(201);

  return {
    namespaceId: created.namespace_id,
    pageId: written.body.page_id as string,
    resourceId: ticket.resource_id,
  };
}

function get(pageId: string, resource: string, query = ""): Promise<Response> {
  return GET(
    new Request(`${BASE}/pages/${pageId}/assets/${encodeURIComponent(resource)}${query}`),
    { params: Promise.resolve({ id: pageId, resource: encodeURIComponent(resource) }) },
  );
}

function landing(response: Response): string {
  const url = new URL(response.headers.get("location") ?? "", BASE);
  return `${url.pathname}${url.search}`;
}

describe("GET /pages/:id/assets/:resource", () => {
  it("sends the owner to a freshly signed address for the bytes", async () => {
    const response = await get(fixture.pageId, fixture.resourceId);

    expect(response.status).toBe(302);
    expect(landing(response)).toMatch(/^\/assets\/[0-9a-f-]+\?expires=\d+&signature=[^&]+$/u);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("asks for the small copy when the tile does, and the file when it does not", async () => {
    expect(landing(await get(fixture.pageId, fixture.resourceId, "?w=thumb"))).toContain("w=thumb");
    expect(landing(await get(fixture.pageId, fixture.resourceId))).not.toContain("w=thumb");
  });

  it("says nothing at all about a resource this page does not name", async () => {
    const response = await get(fixture.pageId, "asset_nobody");

    expect(response.status).toBe(404);
  });

  it("rechecks the page against the session's namespace, not the id it is handed", async () => {
    authMocks.requireWebSessionNamespace.mockResolvedValue({
      namespaceId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
    });

    expect((await get(fixture.pageId, fixture.resourceId)).status).toBe(404);
  });
});
