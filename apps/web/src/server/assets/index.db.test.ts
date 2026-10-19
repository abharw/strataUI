/** Upload lifecycle, with focus on how a second request to an upload URL must be refused. */
import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { createCredentialNamespace } from "@/test/namespace";
import { AssetError, acceptBytes, committedBytes, list, readForServing, reissueUpload, release, reserve, resolveAssetId, serveUrls, storedBytes } from "./index";
import { MAX_ASSET_BYTES, MAX_NAMESPACE_BYTES } from "@/page-content/document/limits";
import { sign } from "./signing";

const BASE = "https://strata.test";
const db = getDb();
const namespaceIds: string[] = [];

afterEach(async () => {
  if (namespaceIds.length > 0) {
    await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
  }
});

async function namespace(): Promise<string> {
  const created = await createCredentialNamespace({ baseUrl: BASE });
  namespaceIds.push(created.namespace_id);
  return created.namespace_id;
}

/** A PNG header carrying real dimensions, which is all the prober reads. */
const PNG = (() => {
  const header = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(800, 16);
  header.writeUInt32BE(600, 20);
  return header;
})();

function parts(uploadUrl: string): { assetId: string; expiresAt: number; signature: string } {
  const url = new URL(uploadUrl);
  const assetId = url.pathname.split("/")[3];
  return {
    assetId,
    expiresAt: Number(url.searchParams.get("expires")),
    signature: url.searchParams.get("signature") ?? "",
  };
}

/** Splits a signed serving URL the way `/assets/:id` does. */
function serveParts(serveUrl: string): { assetId: string; expiresAt: number; signature: string } {
  const url = new URL(serveUrl, BASE);
  return {
    assetId: url.pathname.split("/")[2],
    expiresAt: Number(url.searchParams.get("expires")),
    signature: url.searchParams.get("signature") ?? "",
  };
}

/** A decodable image for thumbnail tests; a smooth gradient keeps the PNG small. */
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

async function reserved(namespaceId: string, size = PNG.byteLength) {
  return reserve({
    namespaceId,
    baseUrl: BASE,
    filename: "receipt.png",
    mediaType: "image/png",
    sizeBytes: size,
  });
}

async function idOf(resourceId: string): Promise<string> {
  const [row] = await db.select({ id: schema.assets.id })
    .from(schema.assets)
    .where(eq(schema.assets.resourceId, resourceId));
  return row.id;
}

describe("assets", () => {
  it("takes the bytes once and serves them back through a fresh signature", async () => {
    const namespaceId = await namespace();
    const ticket = await reserved(namespaceId);
    expect(ticket.resource_id.startsWith("asset_")).toBe(true);
    expect(ticket.upload_url).not.toContain(namespaceId);

    const stored = await acceptBytes({ ...parts(ticket.upload_url), bytes: PNG });
    expect(stored.resource_id).toBe(ticket.resource_id);
    expect(await storedBytes(namespaceId)).toBe(PNG.byteLength);

    const urls = await serveUrls(namespaceId, [ticket.resource_id]);
    const servable = urls.get(ticket.resource_id);
    expect(servable?.media_type).toBe("image/png");
    const url = new URL(servable?.url ?? "", BASE);
    const read = await readForServing({
      assetId: url.pathname.split("/")[2],
      expiresAt: Number(url.searchParams.get("expires")),
      signature: url.searchParams.get("signature") ?? "",
    });
    // The digest comes from the row, so conditional requests never touch the blob.
    expect(read?.sha256).toBe(createHash("sha256").update(PNG).digest("hex"));
    expect((await read?.bytes())?.equals(PNG)).toBe(true);
  });

  it("makes one small copy of an image as the bytes land, and serves it beside the original", async () => {
    const namespaceId = await namespace();
    const bytes = await photo(1600, 900);
    const ticket = await reserve({
      namespaceId,
      baseUrl: BASE,
      filename: "roof.png",
      mediaType: "image/png",
      sizeBytes: bytes.byteLength,
    });
    await acceptBytes({ ...parts(ticket.upload_url), bytes });

    const servable = (await serveUrls(namespaceId, [ticket.resource_id])).get(ticket.resource_id);
    // The thumbnail is the same signed URL plus one parameter.
    expect(servable?.thumb_url).toBe(`${servable?.url ?? ""}&w=thumb`);
    expect(servable?.thumb_width).toBe(640);
    expect(servable?.thumb_height).toBe(360);

    const thumb = await readForServing({ ...serveParts(servable?.url ?? ""), variant: "thumb" });
    expect(thumb?.variant).toBe("thumb");
    expect(thumb?.mediaType).toBe("image/webp");
    expect(thumb?.filename).toBe("roof.webp");
    const served = await thumb?.bytes();
    expect(served?.byteLength).toBeLessThan(bytes.byteLength);

    const original = await readForServing(serveParts(servable?.url ?? ""));
    expect(original?.variant).toBe("original");
    expect((await original?.bytes())?.equals(bytes)).toBe(true);
    // The variant is derived and does not count toward stored bytes.
    expect(await storedBytes(namespaceId)).toBe(bytes.byteLength);
  });

  it("keeps serving the original for a file that has no variant", async () => {
    const namespaceId = await namespace();
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n");
    const ticket = await reserve({
      namespaceId,
      baseUrl: BASE,
      filename: "lease.pdf",
      mediaType: "application/pdf",
      sizeBytes: pdf.byteLength,
    });
    await acceptBytes({ ...parts(ticket.upload_url), bytes: pdf });

    const servable = (await serveUrls(namespaceId, [ticket.resource_id])).get(ticket.resource_id);
    expect(servable?.thumb_url).toBeNull();

    // Requesting a thumbnail that does not exist falls back to the original.
    const asked = await readForServing({ ...serveParts(servable?.url ?? ""), variant: "thumb" });
    expect(asked?.variant).toBe("original");
    expect(asked?.mediaType).toBe("application/pdf");
    expect((await asked?.bytes())?.equals(pdf)).toBe(true);
  });

  it("reads the facts off the bytes rather than taking the reservation's word", async () => {
    const namespaceId = await namespace();
    const ticket = await reserve({
      namespaceId,
      baseUrl: BASE,
      filename: "receipt.png",
      mediaType: "image/png",
      sizeBytes: PNG.byteLength,
      attribution: { credit: "Photo by the concierge", sourceUrl: "https://hotel.example/receipt" },
    });
    const stored = await acceptBytes({ ...parts(ticket.upload_url), bytes: PNG });

    expect(stored).toMatchObject({
      content_type: "image/png",
      size_bytes: PNG.byteLength,
      sha256: createHash("sha256").update(PNG).digest("hex"),
      width: 800,
      height: 600,
      credit: "Photo by the concierge",
      source_url: "https://hotel.example/receipt",
      stored: true,
    });

    // Later reads return the same facts, so the renderer can size the frame before the image loads.
    const servable = (await serveUrls(namespaceId, [ticket.resource_id])).get(ticket.resource_id);
    expect(servable).toMatchObject({ width: 800, height: 600, credit: "Photo by the concierge" });
    expect(await list(namespaceId)).toMatchObject([{ resource_id: ticket.resource_id, width: 800, height: 600 }]);
  });

  it("refuses the same upload link a second time", async () => {
    const namespaceId = await namespace();
    const ticket = await reserved(namespaceId);
    await acceptBytes({ ...parts(ticket.upload_url), bytes: PNG });
    await expect(acceptBytes({ ...parts(ticket.upload_url), bytes: PNG })).rejects.toThrow(AssetError);
  });

  it("refuses bytes that are not the size the reservation declared", async () => {
    const namespaceId = await namespace();
    const ticket = await reserved(namespaceId, PNG.byteLength + 10);
    await expect(acceptBytes({ ...parts(ticket.upload_url), bytes: PNG })).rejects.toThrow(/bytes/);
    expect(await storedBytes(namespaceId)).toBe(0);
  });

  it("refuses an expired link, and a signature minted for serving", async () => {
    const namespaceId = await namespace();
    const ticket = await reserved(namespaceId);
    const { assetId } = parts(ticket.upload_url);


    const stale = Math.floor(Date.now() / 1000) - 60;
    await expect(
      acceptBytes({ assetId, expiresAt: stale, signature: sign("upload", assetId, stale), bytes: PNG }),
    ).rejects.toThrow(/not valid/);

    const live = Math.floor(Date.now() / 1000) + 600;
    await expect(
      acceptBytes({ assetId, expiresAt: live, signature: sign("serve", assetId, live), bytes: PNG }),
    ).rejects.toThrow(/not valid/);
  });

  it("will not hold a type a page cannot show, or a file over the cap", async () => {
    const namespaceId = await namespace();
    await expect(
      reserve({ namespaceId, baseUrl: BASE, filename: "logs.zip", mediaType: "application/zip", sizeBytes: 10 }),
    ).rejects.toThrow(/does not hold/);
    await expect(reserved(namespaceId, MAX_ASSET_BYTES + 1)).rejects.toThrow(/larger than/);
  });

  it("keeps one namespace's files out of another's page", async () => {
    const mine = await namespace();
    const theirs = await namespace();
    const ticket = await reserved(mine);
    await acceptBytes({ ...parts(ticket.upload_url), bytes: PNG });

    expect((await serveUrls(theirs, [ticket.resource_id])).size).toBe(0);
    expect((await serveUrls(mine, [ticket.resource_id])).size).toBe(1);
  });

  it("drops the bytes when the namespace goes", async () => {
    const namespaceId = await namespace();
    const ticket = await reserved(namespaceId);
    await acceptBytes({ ...parts(ticket.upload_url), bytes: PNG });
    const [row] = await db
      .select({ key: schema.assets.storageKey })
      .from(schema.assets)
      .where(eq(schema.assets.namespaceId, namespaceId));

    await db.delete(schema.namespaces).where(eq(schema.namespaces.id, namespaceIds.splice(0)[0]));
    const blobs = await db
      .select({ key: schema.assetBlobs.storageKey })
      .from(schema.assetBlobs)
      .where(eq(schema.assetBlobs.storageKey, row.key));
    expect(blobs).toHaveLength(0);
  });
});

/** A reservation returns both `asset_id` and `resource_id`; either must resolve. */
describe("naming one file two ways", () => {
  it("resolves either handle the reservation returned, inside this Strata only", async () => {
    const namespaceId = await namespace();
    const other = await namespace();
    const ticket = await reserved(namespaceId);
    expect(ticket.asset_id).toBe(await idOf(ticket.resource_id));

    expect(await resolveAssetId(namespaceId, ticket.asset_id)).toBe(ticket.asset_id);
    expect(await resolveAssetId(namespaceId, ticket.resource_id)).toBe(ticket.asset_id);

    await expect(resolveAssetId(other, ticket.resource_id)).rejects.toThrow(AssetError);
    await expect(resolveAssetId(other, ticket.asset_id)).rejects.toThrow(AssetError);
    // Neither shape is a 404, not a malformed-uuid database error.
    await expect(resolveAssetId(namespaceId, "asset_nothing")).rejects.toThrow(AssetError);
    await expect(resolveAssetId(namespaceId, "00000000-0000-4000-8000-000000000009"))
      .rejects.toThrow(AssetError);
  });
});

describe("re-issuing the upload link", () => {
  it("hands back a working link and kills the one it replaced", async () => {
    const namespaceId = await namespace();
    const first = await reserved(namespaceId);
    const id = await idOf(first.resource_id);

    const second = await reissueUpload({ namespaceId, assetId: id, baseUrl: BASE });
    expect(second.resource_id).toBe(first.resource_id);
    expect(second.upload_url).not.toBe(first.upload_url);

    await expect(acceptBytes({ ...parts(first.upload_url), bytes: PNG })).rejects.toThrow(/newer upload link/);
    await acceptBytes({ ...parts(second.upload_url), bytes: PNG });
    expect(await storedBytes(namespaceId)).toBe(PNG.byteLength);
    // Re-issuing must not charge the quota twice.
    expect(await committedBytes(namespaceId)).toBe(PNG.byteLength);
  });

  it("refuses a file that already has its bytes, and another Strata's id", async () => {
    const namespaceId = await namespace();
    const other = await namespace();
    const ticket = await reserved(namespaceId);
    const id = await idOf(ticket.resource_id);
    await acceptBytes({ ...parts(ticket.upload_url), bytes: PNG });

    await expect(reissueUpload({ namespaceId, assetId: id, baseUrl: BASE })).rejects.toThrow(/already has its bytes/);
    await expect(reissueUpload({ namespaceId: other, assetId: id, baseUrl: BASE })).rejects.toThrow(/No asset/);
  });
});

describe("the namespace cap", () => {
  it("counts what has been promised, not only what has landed", async () => {
    // Reserve-all-then-upload must see earlier reservations.
    const namespaceId = await namespace();
    const fits = MAX_NAMESPACE_BYTES / MAX_ASSET_BYTES;
    for (let taken = 0; taken < fits; taken += 1) {
      await reserve({ namespaceId, baseUrl: BASE, filename: "a.png", mediaType: "image/png", sizeBytes: MAX_ASSET_BYTES });
    }
    expect(await committedBytes(namespaceId)).toBe(MAX_NAMESPACE_BYTES);
    expect(await storedBytes(namespaceId)).toBe(0);
    await expect(
      reserve({ namespaceId, baseUrl: BASE, filename: "one-too-many.png", mediaType: "image/png", sizeBytes: 1 }),
    ).rejects.toThrow(AssetError);
  });

  it("gives the space back when a reservation's window closes", async () => {
    const namespaceId = await namespace();
    const reserved = await reserve({ namespaceId, baseUrl: BASE, filename: "a.png", mediaType: "image/png", sizeBytes: 1024 });
    await db.update(schema.assets)
      .set({ uploadExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.assets.resourceId, reserved.resource_id));
    expect(await committedBytes(namespaceId)).toBe(0);
  });
});


describe("deleting an asset", () => {
  it("takes the row, the bytes, and the quota charge with it", async () => {
    const namespaceId = await namespace();
    const ticket = await reserved(namespaceId);
    await acceptBytes({ ...parts(ticket.upload_url), bytes: PNG });
    expect(await storedBytes(namespaceId)).toBe(PNG.byteLength);
    const [row] = await db.select({ id: schema.assets.id, key: schema.assets.storageKey })
      .from(schema.assets).where(eq(schema.assets.resourceId, ticket.resource_id));

    const released = await release(namespaceId, row.id);
    expect(released).toEqual({ resource_id: ticket.resource_id, released_bytes: PNG.byteLength });
    expect(await storedBytes(namespaceId)).toBe(0);
    expect(await committedBytes(namespaceId)).toBe(0);
    expect(await db.select({ key: schema.assetBlobs.storageKey })
      .from(schema.assetBlobs).where(eq(schema.assetBlobs.storageKey, row.key))).toHaveLength(0);
    expect((await serveUrls(namespaceId, [ticket.resource_id])).size).toBe(0);
  });

  it("releases an unused reservation, and charges nothing for it", async () => {
    const namespaceId = await namespace();
    const ticket = await reserved(namespaceId);
    const [row] = await db.select({ id: schema.assets.id })
      .from(schema.assets).where(eq(schema.assets.resourceId, ticket.resource_id));

    expect(await release(namespaceId, row.id)).toMatchObject({ released_bytes: 0 });
    expect(await committedBytes(namespaceId)).toBe(0);
  });

  it("refuses an id belonging to another Strata, and one belonging to nobody", async () => {
    const mine = await namespace();
    const theirs = await namespace();
    const ticket = await reserved(theirs);
    const [row] = await db.select({ id: schema.assets.id })
      .from(schema.assets).where(eq(schema.assets.resourceId, ticket.resource_id));

    await expect(release(mine, row.id)).rejects.toThrow(AssetError);
    await expect(release(mine, "00000000-0000-4000-8000-000000000009")).rejects.toThrow(AssetError);
    expect(await committedBytes(theirs)).toBeGreaterThan(0);
  });
});

/** Reserve-all-then-push makes parallel reservations the expected traffic. */
describe("the quota under concurrency", () => {
  it("serializes the check with the insert so parallel reservations cannot all pass it", async () => {
    const namespaceId = await namespace();
    // Fill to within one file of the cap, so exactly one reservation below fits.
    await db.insert(schema.assets).values({
      namespaceId,
      resourceId: `asset_${"f".repeat(16)}`,
      storageKey: "already-held",
      filename: "held.png",
      mediaType: "image/png",
      sizeBytes: MAX_NAMESPACE_BYTES - MAX_ASSET_BYTES,
      storedAt: new Date(),
      uploadExpiresAt: new Date(Date.now() - 1000),
    });

    const attempts = await Promise.allSettled(Array.from({ length: 8 }, () =>
      reserve({ namespaceId, baseUrl: BASE, filename: "a.png", mediaType: "image/png", sizeBytes: MAX_ASSET_BYTES })));

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(await committedBytes(namespaceId)).toBe(MAX_NAMESPACE_BYTES);
    for (const attempt of attempts) {
      if (attempt.status === "rejected") expect(attempt.reason).toBeInstanceOf(AssetError);
    }
  });
});
