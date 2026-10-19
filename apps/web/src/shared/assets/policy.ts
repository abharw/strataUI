/**
 * Asset acceptance rules. Caps are small because pages hold receipts and screenshots, not large
 * media; the numbers live in `page-content/document/limits.ts` so every surface quotes the same.
 */
import { ALLOWED_MEDIA_TYPES } from "@/page-content/document/limits";

export const ALLOWED_MEDIA_SENTENCE = ALLOWED_MEDIA_TYPES.join(", ");

export function isAllowedMediaType(value: string): boolean {
  return (ALLOWED_MEDIA_TYPES as readonly string[]).includes(value.toLowerCase());
}

/**
 * Non-ASCII names like 領収書.pdf throw in a quoted header value, so this sends an ASCII fallback
 * plus the RFC 5987 UTF-8 `filename*`.
 */
export function contentDisposition(filename: string): string {
  const clean = filename.replace(/[\u0000-\u001f\u007f]/g, "").replace(/["\\]/g, "");
  const ascii = clean.replace(/[^\u0020-\u007e]/g, "_").trim();
  const fallback = ascii === "" ? "file" : ascii;
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}
