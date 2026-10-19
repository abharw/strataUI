/**
 * Facts read from uploaded bytes rather than the reservation: the digest (used as the ETag) and
 * image dimensions (so galleries do not reflow). `image-size` reads headers only and never decodes
 * pixels; a malformed image just has no dimensions.
 */
import { imageSize } from "image-size";
import { createHash } from "node:crypto";

export interface AssetProbe {
  sha256: string;
  width: number | null;
  height: number | null;
}

export function probe(bytes: Buffer, mediaType: string): AssetProbe {
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...dimensions(bytes, mediaType),
  };
}

/** SVG is skipped: its viewBox scales freely, and measuring it means parsing untrusted XML. */
function dimensions(bytes: Buffer, mediaType: string): { width: number | null; height: number | null } {
  const type = mediaType.toLowerCase();
  if (!type.startsWith("image/") || type === "image/svg+xml") return { width: null, height: null };
  try {
    const size = imageSize(bytes);
    const width = size.width ?? null;
    const height = size.height ?? null;
    // EXIF orientation 5-8 is displayed a quarter turn from the stored dimensions.
    return size.orientation !== undefined && size.orientation >= 5 && size.orientation <= 8
      ? { width: height, height: width }
      : { width, height };
  } catch {
    return { width: null, height: null };
  }
}
