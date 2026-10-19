/** Route-level presentation chosen without changing the page-key authority. */
export type DirectPageVariant = "direct" | "embed";

export function directPageVariant(embed: string | undefined): DirectPageVariant {
  return embed === "1" ? "embed" : "direct";
}
