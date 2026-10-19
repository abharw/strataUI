/**
 * One small display copy of an image, made at push time (`acceptBytes`) since assets are immutable.
 * `server-only` because `sharp` is native; it is imported lazily so page renders never load it.
 */
import "server-only";

import type { Sharp } from "sharp";

/** Longest side of the variant: twice a 320px tile, so it stays sharp on high-DPI screens. */
export const THUMB_MAX_EDGE = 640;

/** WebP quality: visually clean at a fraction of the bytes. */
const THUMB_QUALITY = 80;

/**
 * Decode ceiling. A 4 MB PNG can decompress to hundreds of megapixels; above 40 MP the asset gets
 * no thumbnail and serves its original.
 */
const MAX_DECODED_PIXELS = 40_000_000;

export interface AssetThumbnail {
  bytes: Buffer;
  mediaType: string;
  width: number;
  height: number;
}

/** SVG is untrusted XML that scales freely, so there is nothing to shrink. */
function isThumbnailable(mediaType: string): boolean {
  const type = mediaType.toLowerCase();
  return type.startsWith("image/") && type !== "image/svg+xml";
}

/**
 * The variant, or null (PDF, SVG, undecodable, or already smaller than a thumbnail); null means
 * serve the original and is never an error.
 */
export async function thumbnail(bytes: Buffer, mediaType: string): Promise<AssetThumbnail | null> {
  if (!isThumbnailable(mediaType)) return null;

  // Decoder failures yield no thumbnail, never a failed upload.
  try {
    // `failOn: "error"`, not "warning", so slightly truncated photos that browsers render still shrink.
    const { default: sharp } = await import("sharp");
    const source = sharp(bytes, { limitInputPixels: MAX_DECODED_PIXELS, failOn: "error" })
      // `rotate()` bakes in EXIF orientation. sharp drops all other metadata (including GPS) by default.
      .rotate()
      .resize({ width: THUMB_MAX_EDGE, height: THUMB_MAX_EDGE, fit: "inside", withoutEnlargement: true });

    const encoded = await encode(source, mediaType);
    if (encoded === null) return null;
    // Small icons and screenshots can be smaller than their WebP; then the original is better.
    if (encoded.bytes.byteLength >= bytes.byteLength) return null;
    return encoded;
  } catch {
    return null;
  }
}

async function encode(source: Sharp, mediaType: string): Promise<AssetThumbnail | null> {
  try {
    return await render(source.clone().webp({ quality: THUMB_QUALITY }), "image/webp");
  } catch {
    // JPEG fallback only for JPEG sources, the one format certain to encode where it decoded.
    if (mediaType.toLowerCase() !== "image/jpeg") return null;
    return render(source.clone().jpeg({ quality: THUMB_QUALITY }), "image/jpeg");
  }
}

async function render(pipeline: Sharp, mediaType: string): Promise<AssetThumbnail> {
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { bytes: data, mediaType, width: info.width, height: info.height };
}

/** Filename matching the variant's format, so a saved WebP is not named `.png`. */
export function thumbFilename(filename: string, mediaType: string): string {
  const extension = mediaType.toLowerCase() === "image/jpeg" ? "jpg" : "webp";
  const stem = filename.replace(/\.[^./\\]{1,10}$/, "");
  return `${stem === "" ? "thumbnail" : stem}.${extension}`;
}
