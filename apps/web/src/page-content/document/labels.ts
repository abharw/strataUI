/** An element's display name from its props, shared by summary and find reads. */

/** In precedence order. */
const LABEL_FIELDS = ["title", "label", "name"] as const;

export function labelOf(props: Record<string, unknown> | undefined): string | null {
  if (props === undefined || props === null || typeof props !== "object") return null;
  for (const field of LABEL_FIELDS) {
    const value = (props)[field];
    if (typeof value === "string" && value !== "") return value;
  }
  return null;
}
