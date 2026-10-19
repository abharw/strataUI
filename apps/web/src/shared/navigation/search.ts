/** One literal-query contract shared by Home and its private search route. */
export const MAX_OWNER_SEARCH_CHARS = 160;

export function normalizeOwnerSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** One scalar, code-point-bounded value from a Next searchParams record. */
export function initialOwnerSearch(value: string | string[] | undefined): string {
  return typeof value === "string"
    ? [...value].slice(0, MAX_OWNER_SEARCH_CHARS).join("")
    : "";
}
