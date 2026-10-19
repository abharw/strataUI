/**
 * Strict RFC 6902 pointer tokens. @json-render/core parses indexes with parseInt, so "/items/1foo"
 * silently targets row 1 (vercel-labs/json-render#326). Any token that starts like a number must
 * be a canonical index; element ids and prop names never start with a digit.
 */

/** RFC 6902's array-index grammar: "0", or a non-zero digit followed by digits. */
const CANONICAL_INDEX = /^(0|[1-9][0-9]*)$/;

/** Encode raw path segments as one canonical RFC 6901 JSON Pointer. */
export function jsonPointer(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "";
  return `/${path
    .map((segment) => String(segment).replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("/")}`;
}

/** Decodes one RFC 6901 token. `~1` must be replaced before `~0`, or `~01` decodes to `/`. */
export function unescapePointerToken(raw: string): string {
  return raw.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Returns the first malformed token in a JSON Pointer, or null when it is clean. */
export function malformedIndexToken(pointer: string): string | null {
  for (const raw of pointer.split("/").slice(1)) {
    const token = unescapePointerToken(raw);
    if (token === "-") continue;
    if (!/^[0-9-]/.test(token)) continue;
    if (!CANONICAL_INDEX.test(token)) return token;
    if (Number(token) > Number.MAX_SAFE_INTEGER) return token;
  }
  return null;
}

/** Tokens that address an object's prototype rather than one of its own keys. */
const PROTOTYPE_TOKENS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/** Returns the first token that would reach an object prototype, or null when it is clean. */
export function prototypeToken(pointer: string): string | null {
  for (const raw of pointer.split("/").slice(1)) {
    const token = unescapePointerToken(raw);
    if (PROTOTYPE_TOKENS.has(token)) return token;
  }
  return null;
}
