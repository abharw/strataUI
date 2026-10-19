/**
 * Asset upload over HTTP: the upload URL accepts the bytes without carrying a credential, and
 * the serving route refuses a tampered signature.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import { serveUrls } from "@/server/assets";
import {
  ALLOWED_MEDIA_TYPES,
  MAX_ASSET_BYTES,
  MAX_NAMESPACE_BYTES,
  UPLOAD_WINDOW_SECONDS,
} from "@/page-content/document/limits";
import { createCredentialNamespace } from "@/test/namespace";
import { GET as serve } from "@/app/(reader)/assets/[id]/route";
import { PUT as putBytes } from "./[id]/bytes/route";
import { DELETE as deleteAsset } from "./[id]/route";
import { POST as reissueUploadUrl } from "./[id]/upload-url/route";
import { POST as reserveAsset, GET as usage } from "./route";

const BASE = "https://strata.test";

/** A PNG header with real dimensions, which is all the prober reads. */
const PNG = (() => {
  const header = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(800, 16);
  header.writeUInt32BE(600, 20);
  return header;
})();

async function provision() {
  return createCredentialNamespace({ baseUrl: BASE });
}

async function storedBytesOf(token: string): Promise<number> {
  const counted = await usage(new Request(`${BASE}/v1/assets`, { headers: { authorization: `Bearer ${token}` } }));
  return ((await counted.json()) as { stored_bytes: number }).stored_bytes;
}

function post(token: string, body: unknown): Request {
  return new Request(`${BASE}/v1/assets`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("asset routes", () => {
  it("reserves, takes the bytes with no token, and serves them back", async () => {
    const ns = await provision();
    const reserved = await reserveAsset(
      post(ns.access_token, { filename: "shot.png", media_type: "image/png", size_bytes: PNG.byteLength }),
    );
    expect(reserved.status).toBe(201);
    const ticket = (await reserved.json()) as { asset_id: string; resource_id: string; upload_url: string };
    expect(ticket.upload_url).not.toContain(ns.access_token);

    const uploadUrl = new URL(ticket.upload_url);
    const assetId = uploadUrl.pathname.split("/")[3];
    expect(ticket.asset_id).toBe(assetId);
    const uploaded = await putBytes(
      new Request(ticket.upload_url, { method: "PUT", body: new Uint8Array(PNG) }),
      { params: Promise.resolve({ id: assetId }) },
    );
    expect(uploaded.status).toBe(200);

    const serveUrl = `${BASE}/assets/${assetId}?${new URL(ticket.upload_url).searchParams.toString()}`;
    const wrongPurpose = await serve(new Request(serveUrl), { params: Promise.resolve({ id: assetId }) });
    // The upload signature is not a serving signature, even for the same asset.
    expect(wrongPurpose.status).toBe(404);

    const minted = await serveUrls(ns.namespace_id, [ticket.resource_id]);
    const good = minted.get(ticket.resource_id);
    expect(good).toBeDefined();
    const served = await serve(new Request(`${BASE}${good?.url ?? ""}`), { params: Promise.resolve({ id: assetId }) });
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("cache-control")).toContain("private");
    expect(Buffer.from(await served.arrayBuffer()).equals(PNG)).toBe(true);

    const tampered = new URL(`${BASE}${good?.url ?? ""}`);
    tampered.searchParams.set("signature", `${tampered.searchParams.get("signature") ?? ""}x`);
    const refused = await serve(new Request(tampered), { params: Promise.resolve({ id: assetId }) });
    expect(refused.status).toBe(404);

    const counted = await usage(new Request(`${BASE}/v1/assets`, { headers: { authorization: `Bearer ${ns.access_token}` } }));
    expect(((await counted.json()) as { stored_bytes: number }).stored_bytes).toBe(PNG.byteLength);
  });

  it("refuses a reservation for a type a page cannot show", async () => {
    const ns = await provision();
    const response = await reserveAsset(
      post(ns.access_token, { filename: "logs.zip", media_type: "application/zip", size_bytes: 10 }),
    );
    expect(response.status).toBe(422);
    expect(((await response.json()) as { code: string }).code).toBe("media_type_not_allowed");
  });

  it("names the failing field with a JSON Pointer and the real reason", async () => {
    const ns = await provision();
    const response = await reserveAsset(
      post(ns.access_token, { filename: "a.png", media_type: "image/png", size_bytes: -4 }),
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as { path: string; error: string };
    expect(body.path).toBe("/size_bytes");
    expect(body.error).not.toContain("needs filename, media_type and size_bytes");
  });

  it("deletes an asset and gives the namespace its bytes back", async () => {
    const ns = await provision();
    const reserved = await reserveAsset(
      post(ns.access_token, { filename: "shot.png", media_type: "image/png", size_bytes: PNG.byteLength }),
    );
    const ticket = (await reserved.json()) as { resource_id: string; upload_url: string };
    const assetId = new URL(ticket.upload_url).pathname.split("/")[3];
    await putBytes(
      new Request(ticket.upload_url, { method: "PUT", body: new Uint8Array(PNG) }),
      { params: Promise.resolve({ id: assetId }) },
    );

    const removed = await deleteAsset(
      new Request(`${BASE}/v1/assets/${assetId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${ns.access_token}` },
      }),
      { params: Promise.resolve({ id: assetId }) },
    );
    expect(removed.status).toBe(200);
    expect(await removed.json()).toMatchObject({ resource_id: ticket.resource_id, released_bytes: PNG.byteLength });

    const counted = await usage(new Request(`${BASE}/v1/assets`, { headers: { authorization: `Bearer ${ns.access_token}` } }));
    expect(((await counted.json()) as { stored_bytes: number }).stored_bytes).toBe(0);
    expect((await serveUrls(ns.namespace_id, [ticket.resource_id])).size).toBe(0);
  });

  it("will not delete a file in another Strata, or without a credential", async () => {
    const mine = await provision();
    const theirs = await provision();
    const reserved = await reserveAsset(
      post(theirs.access_token, { filename: "shot.png", media_type: "image/png", size_bytes: PNG.byteLength }),
    );
    const ticket = (await reserved.json()) as { upload_url: string };
    const assetId = new URL(ticket.upload_url).pathname.split("/")[3];
    const params = { params: Promise.resolve({ id: assetId }) };

    const crossed = await deleteAsset(
      new Request(`${BASE}/v1/assets/${assetId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${mine.access_token}` },
      }),
      params,
    );
    expect(crossed.status).toBe(404);

    const anonymous = await deleteAsset(
      new Request(`${BASE}/v1/assets/${assetId}`, { method: "DELETE" }),
      params,
    );
    expect(anonymous.status).toBe(401);
  });

  it("lists what the Strata holds, with the limits beside it", async () => {
    const ns = await provision();
    const reserved = await reserveAsset(
      post(ns.access_token, {
        filename: "shot.png",
        media_type: "image/png",
        size_bytes: PNG.byteLength,
        credit: "Photo by the concierge",
        source_url: "https://hotel.example/receipt",
      }),
    );
    const ticket = (await reserved.json()) as { resource_id: string; upload_url: string };
    const assetId = new URL(ticket.upload_url).pathname.split("/")[3];
    await putBytes(
      new Request(ticket.upload_url, { method: "PUT", body: new Uint8Array(PNG) }),
      { params: Promise.resolve({ id: assetId }) },
    );

    const listed = await usage(
      new Request(`${BASE}/v1/assets`, { headers: { authorization: `Bearer ${ns.access_token}` } }),
    );
    // Limits are returned with usage so an agent need not learn them by being refused.
    expect(await listed.json()).toMatchObject({
      max_bytes: MAX_ASSET_BYTES,
      quota_bytes: MAX_NAMESPACE_BYTES,
      allowed_media_types: [...ALLOWED_MEDIA_TYPES],
      upload_window_seconds: UPLOAD_WINDOW_SECONDS,
      assets: [{
        asset_id: assetId,
        resource_id: ticket.resource_id,
        content_type: "image/png",
        credit: "Photo by the concierge",
        source_url: "https://hotel.example/receipt",
        stored: true,
      }],
    });
  });

  it("refuses attribution that is not an https link", async () => {
    const ns = await provision();
    const response = await reserveAsset(
      post(ns.access_token, {
        filename: "a.png",
        media_type: "image/png",
        size_bytes: 4,
        source_url: "http://hotel.example/receipt",
      }),
    );
    expect(response.status).toBe(422);
    expect(((await response.json()) as { path: string }).path).toBe("/source_url");
  });

  it("re-issues an upload URL and kills the one it replaced", async () => {
    const ns = await provision();
    const reserved = await reserveAsset(
      post(ns.access_token, { filename: "shot.png", media_type: "image/png", size_bytes: PNG.byteLength }),
    );
    const ticket = (await reserved.json()) as { upload_url: string };
    const assetId = new URL(ticket.upload_url).pathname.split("/")[3];
    const params = { params: Promise.resolve({ id: assetId }) };

    const reissued = await reissueUploadUrl(
      new Request(`${BASE}/v1/assets/${assetId}/upload-url`, {
        method: "POST",
        headers: { authorization: `Bearer ${ns.access_token}` },
      }),
      params,
    );
    expect(reissued.status).toBe(200);
    const fresh = (await reissued.json()) as { upload_url: string };

    const stale = await putBytes(new Request(ticket.upload_url, { method: "PUT", body: new Uint8Array(PNG) }), params);
    expect(stale.status).toBe(410);
    // The refusal names the call that issues a fresh link.
    expect((await stale.json()) as { recover: { path: string } }).toMatchObject({
      recover: { path: `${BASE}/v1/assets/${assetId}/upload-url` },
    });

    const pushed = await putBytes(new Request(fresh.upload_url, { method: "PUT", body: new Uint8Array(PNG) }), params);
    expect(pushed.status).toBe(200);
    // Reports the probed bytes, not what the reservation claimed.
    expect(await pushed.json()).toMatchObject({
      content_type: "image/png",
      sha256: createHash("sha256").update(PNG).digest("hex"),
      width: 800,
      height: 600,
      stored: true,
    });
  });

  it("takes the resource_id on the id routes, so either half of a reservation works", async () => {
    const ns = await provision();
    const reserved = await reserveAsset(
      post(ns.access_token, { filename: "shot.png", media_type: "image/png", size_bytes: PNG.byteLength }),
    );
    const ticket = (await reserved.json()) as { asset_id: string; resource_id: string; upload_url: string };

    const reissued = await reissueUploadUrl(
      new Request(`${BASE}/v1/assets/${ticket.resource_id}/upload-url`, {
        method: "POST",
        headers: { authorization: `Bearer ${ns.access_token}` },
      }),
      { params: Promise.resolve({ id: ticket.resource_id }) },
    );
    expect(reissued.status).toBe(200);
    const fresh = (await reissued.json()) as { asset_id: string; resource_id: string; upload_url: string };
    expect(fresh).toMatchObject({ asset_id: ticket.asset_id, resource_id: ticket.resource_id });

    const pushed = await putBytes(
      new Request(fresh.upload_url, { method: "PUT", body: new Uint8Array(PNG) }),
      { params: Promise.resolve({ id: ticket.asset_id }) },
    );
    expect(pushed.status).toBe(200);

    // Handles resolve only within the caller's own namespace.
    const stranger = await provision();
    const crossed = await deleteAsset(
      new Request(`${BASE}/v1/assets/${ticket.resource_id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${stranger.access_token}` },
      }),
      { params: Promise.resolve({ id: ticket.resource_id }) },
    );
    expect(crossed.status).toBe(404);

    const removed = await deleteAsset(
      new Request(`${BASE}/v1/assets/${ticket.resource_id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${ns.access_token}` },
      }),
      { params: Promise.resolve({ id: ticket.resource_id }) },
    );
    expect(removed.status).toBe(200);
    expect(await removed.json()).toMatchObject({
      resource_id: ticket.resource_id,
      released_bytes: PNG.byteLength,
    });
    expect(await storedBytesOf(ns.access_token)).toBe(0);
  });

  it("still 404s a handle of neither shape", async () => {
    const ns = await provision();
    const response = await deleteAsset(
      new Request(`${BASE}/v1/assets/not-an-id`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${ns.access_token}` },
      }),
      { params: Promise.resolve({ id: "not-an-id" }) },
    );
    expect(response.status).toBe(404);
    expect(((await response.json()) as { code: string }).code).toBe("not_found");
  });

  it("answers an anonymous caller 401 before it complains about the query", async () => {
    const response = await usage(new Request(`${BASE}/v1/assets?limit=10`));
    expect(response.status).toBe(401);
  });

  it("needs a credential to reserve anything", async () => {
    const response = await reserveAsset(
      new Request(`${BASE}/v1/assets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "a.png", media_type: "image/png", size_bytes: 4 }),
      }),
    );
    expect(response.status).toBe(401);
  });
});
