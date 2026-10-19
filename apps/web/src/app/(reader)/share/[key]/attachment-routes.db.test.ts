/**
 * Attachment routes under page keys, bundles and bundle members: unknown resources 404, known
 * ones 302 to a freshly signed `/assets/…`, and `?w=thumb` carries through to the redirect.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { eq, inArray } from "drizzle-orm";

// Assembly reads the origin from the request scope, which route tests do not set up.
vi.mock("@/server/api/http/read-origin", () => ({ readOrigin: async () => "https://strata.test" }));

import { getDb, schema } from "@/server/db";
import { DEFAULT_WRITER_SCOPES } from "@/server/credentials";
import { acceptBytes, reserve } from "@/server/assets";
import { put } from "@/server/pages/handlers";
import { shareSpace } from "@/server/credentials/provision";
import { createCredentialNamespace } from "@/test/namespace";
import type { StrataSpec } from "@/page-content/schema";

import { GET as bundleAttachment } from "./assets/[resource]/route";
import { GET as memberAttachment } from "./pages/[id]/assets/[resource]/route";

const BASE = "https://strata.test";
const db = getDb();
const namespaceIds: string[] = [];

/** Shared read-only fixture; setting it up is most of each case's cost. */
let fixture: Awaited<ReturnType<typeof shared>>;

beforeAll(async () => {
  fixture = await shared();
});

afterAll(async () => {
  if (namespaceIds.length > 0) {
    await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
  }
});

/** A decodable image, so a thumbnail variant is actually generated. */
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

/** One shared Space holding one shared page, whose one attachment has a variant. */
async function shared() {
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

  const pageId = written.body.page_id as string;
  const spaceId = written.body.space_id as string;
  // Bundles only expose shared pages.
  await db.update(schema.pages).set({ shared: true, sharedAt: new Date() })
    .where(eq(schema.pages.id, pageId));
  const space = await shareSpace(spaceId, { baseUrl: BASE });

  return {
    pageId,
    resourceId: ticket.resource_id,
    pageKey: new URL(written.body.url as string).pathname.split("/")[2],
    spaceKey: space.share_key,
  };
}

function landing(response: Response): string {
  return new URL(response.headers.get("location") ?? "", BASE).pathname
    + new URL(response.headers.get("location") ?? "", BASE).search;
}

describe("GET /share/:key/assets/:resource", () => {
  it("sends a page key's own attachment to a freshly signed address", async () => {
    const { pageKey, resourceId } = fixture;

    const response = await bundleAttachment(
      new Request(`${BASE}/share/${pageKey}/assets/${resourceId}`),
      { params: Promise.resolve({ key: pageKey, resource: resourceId }) },
    );

    expect(response.status).toBe(302);
    expect(landing(response)).toMatch(/^\/assets\/[0-9a-f-]+\?expires=\d+&signature=[^&]+$/u);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("says nothing at all about a resource this page does not name", async () => {
    const { pageKey } = fixture;

    const response = await bundleAttachment(
      new Request(`${BASE}/share/${pageKey}/assets/asset_nobody`),
      { params: Promise.resolve({ key: pageKey, resource: "asset_nobody" }) },
    );

    expect(response.status).toBe(404);
  });

  it("reaches the small copy when a one-page bundle's tile asks for it", async () => {
    // Regression: the one-page bundle branch dropped the variant.
    const { spaceKey, resourceId } = fixture;

    const response = await bundleAttachment(
      new Request(`${BASE}/share/${spaceKey}/assets/${resourceId}?w=thumb`),
      { params: Promise.resolve({ key: spaceKey, resource: resourceId }) },
    );

    expect(response.status).toBe(302);
    expect(landing(response)).toContain("w=thumb");
    const original = await bundleAttachment(
      new Request(`${BASE}/share/${spaceKey}/assets/${resourceId}`),
      { params: Promise.resolve({ key: spaceKey, resource: resourceId }) },
    );
    expect(landing(original)).not.toContain("w=thumb");
  });

  it("404s a bundle resource that is not on the page the bundle renders", async () => {
    const { spaceKey } = fixture;

    const response = await bundleAttachment(
      new Request(`${BASE}/share/${spaceKey}/assets/asset_nobody`),
      { params: Promise.resolve({ key: spaceKey, resource: "asset_nobody" }) },
    );

    expect(response.status).toBe(404);
  });
});

describe("GET /share/:spk/pages/:id/assets/:resource", () => {
  it("sends a member page's attachment to a freshly signed address", async () => {
    const { spaceKey, pageId, resourceId } = fixture;

    const response = await memberAttachment(
      new Request(`${BASE}/share/${spaceKey}/pages/${pageId}/assets/${resourceId}`),
      { params: Promise.resolve({ key: spaceKey, id: pageId, resource: resourceId }) },
    );

    expect(response.status).toBe(302);
    expect(landing(response)).toMatch(/^\/assets\/[0-9a-f-]+\?expires=\d+&signature=[^&]+$/u);
  });

  it("asks for the small copy when the tile does", async () => {
    const { spaceKey, pageId, resourceId } = fixture;

    const response = await memberAttachment(
      new Request(`${BASE}/share/${spaceKey}/pages/${pageId}/assets/${resourceId}?w=thumb`),
      { params: Promise.resolve({ key: spaceKey, id: pageId, resource: resourceId }) },
    );

    expect(landing(response)).toContain("w=thumb");
  });

  it("says nothing at all about a resource that page does not name", async () => {
    const { spaceKey, pageId } = fixture;

    const response = await memberAttachment(
      new Request(`${BASE}/share/${spaceKey}/pages/${pageId}/assets/asset_nobody`),
      { params: Promise.resolve({ key: spaceKey, id: pageId, resource: "asset_nobody" }) },
    );

    expect(response.status).toBe(404);
  });
});
