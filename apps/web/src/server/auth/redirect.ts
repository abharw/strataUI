/**
 * Sign-in redirect target, or null to land on Home. Only plain absolute paths pass: `//` and `/\`
 * are protocol-relative URLs to another host, which would make this an open redirect.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  return raw;
}
