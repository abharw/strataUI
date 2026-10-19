/** Digest and dimensions are read from the bytes, not the agent's declaration. */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { probe } from "./probe";

/** A PNG header, which is all `image-size` reads: signature, then IHDR. */
function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

describe("what the bytes turned out to be", () => {
  it("digests every file and measures the images", () => {
    const bytes = png(1200, 900);
    expect(probe(bytes, "image/png")).toEqual({
      sha256: createHash("sha256").update(bytes).digest("hex"),
      width: 1200,
      height: 900,
    });
  });

  it("leaves dimensions null for a file that has none", () => {
    const bytes = Buffer.from("date,total\n2026-08-29,12.40\n");
    expect(probe(bytes, "text/csv")).toMatchObject({ width: null, height: null });
  });

  it("does not parse an SVG for a viewBox the renderer does not need", () => {
    const bytes = Buffer.from('<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"/>');
    expect(probe(bytes, "image/svg+xml")).toMatchObject({ width: null, height: null });
  });

  it("still stores the digest when the image is malformed", () => {
    const bytes = Buffer.from("89504e470d0a1a0a", "hex");
    const probed = probe(bytes, "image/png");
    expect(probed.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(probed.width).toBeNull();
  });
});
