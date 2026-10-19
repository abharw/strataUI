/** Thumbnail generation from real image bytes, including the many inputs that get no variant. */
import { randomFillSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import sharp, { type Sharp } from "sharp";

import { THUMB_MAX_EDGE, thumbFilename, thumbnail } from "./thumbnail";

/** Random pixels so the source is heavy; a flat image would compress too well to compare sizes. */
function noise(width: number, height: number): Sharp {
  const pixels = Buffer.alloc(width * height * 3);
  randomFillSync(pixels);
  return sharp(pixels, { raw: { width, height, channels: 3 } });
}

describe("thumbnail", () => {
  it("shrinks a photo to the tile it is going into, and keeps its shape", async () => {
    const original = await noise(1600, 900).png().toBuffer();

    const thumb = await thumbnail(original, "image/png");

    expect(thumb).not.toBeNull();
    expect(thumb?.mediaType).toBe("image/webp");
    expect(thumb?.width).toBe(THUMB_MAX_EDGE);
    expect(thumb?.height).toBe(Math.round((THUMB_MAX_EDGE * 900) / 1600));
    expect(thumb?.bytes.byteLength).toBeLessThan(original.byteLength);
    const decoded = await sharp(thumb?.bytes ?? Buffer.alloc(0)).metadata();
    expect(decoded.format).toBe("webp");
  });

  it("turns the variant the way the original is shown, not the way it is stored", async () => {
    // Orientation 6: stored landscape, displayed portrait.
    const original = await noise(1600, 900).withMetadata({ orientation: 6 }).jpeg().toBuffer();

    const thumb = await thumbnail(original, "image/jpeg");

    expect(thumb?.width).toBeLessThan(thumb?.height ?? 0);
    expect(thumb?.height).toBe(THUMB_MAX_EDGE);
  });

  it("leaves the camera, the timestamps and the location behind", async () => {
    const original = await noise(1200, 800)
      .withExif({ IFD0: { Copyright: "Someone", Artist: "Someone", Make: "A phone" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const thumb = await thumbnail(original, "image/jpeg");

    expect((await sharp(thumb?.bytes ?? Buffer.alloc(0)).metadata()).exif).toBeUndefined();
  });

  it("has nothing to make for a file that is not a raster image", async () => {
    expect(await thumbnail(Buffer.from("%PDF-1.7"), "application/pdf")).toBeNull();
    expect(await thumbnail(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml")).toBeNull();
    expect(await thumbnail(Buffer.from("id,total\n1,2\n"), "text/csv")).toBeNull();
  });

  it("leaves an image already smaller than its own copy alone", async () => {
    // Already under tile size and heavily compressed, so re-encoding at quality 80 would grow it.
    const compact = await noise(400, 300).webp({ quality: 20 }).toBuffer();

    expect(await thumbnail(compact, "image/webp")).toBeNull();
  });

  it("answers null rather than throwing when the bytes are not an image at all", async () => {
    expect(await thumbnail(Buffer.from("not a png, whatever the header claims"), "image/png")).toBeNull();
  });

  it("names the variant after what it actually is", () => {
    expect(thumbFilename("receipt.png", "image/webp")).toBe("receipt.webp");
    expect(thumbFilename("photo.jpeg", "image/jpeg")).toBe("photo.jpg");
    expect(thumbFilename("no-extension", "image/webp")).toBe("no-extension.webp");
  });
});
