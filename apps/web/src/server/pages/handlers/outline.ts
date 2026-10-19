/** Pure spec walks for the cheap reads: the `summary` outline and `find`'s counts and text. */
import type { StrataSpec } from "@/page-content/schema";
import { MAX_DEPTH } from "@/page-content/document/limits";

/**
 * The spec outline, with a visited set and depth cap. Stored documents are not revalidated on
 * read, so a malformed page degrades to a truncated outline instead of a 500.
 */
export function outlineOf(spec: StrataSpec): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number): void => {
    const element = spec.elements[id];
    if (element === undefined || seen.has(id) || depth >= MAX_DEPTH) return;
    seen.add(id);
    const items = countItems(element.props);
    lines.push(`${"  ".repeat(depth)}${id} (${element.type}${items === null ? "" : `, ${items} item${items === 1 ? "" : "s"}`})`);
    for (const child of element.children) walk(child, depth + 1);
  };
  walk(spec.root, 0);
  return lines.join("\n");
}

export function countItems(props: Record<string, unknown>): number | null {
  let total: number | null = null;
  for (const value of Object.values(props)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    if (value.every((item) => typeof item === "object" && item !== null && !Array.isArray(item) && typeof (item as { id?: unknown }).id === "string")) {
      total = (total ?? 0) + value.length;
    }
  }
  return total;
}

export function textOf(value: unknown): string {
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(textOf).join(" ");
  if (typeof value === "object" && value !== null) return Object.values(value as Record<string, unknown>).map(textOf).join(" ");
  return "";
}
