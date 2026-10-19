import type { ComponentProps } from "react";

/**
 * Shared layout for repeated peers (metrics, tiles, choices, cells). Components set a
 * `data-collection` attribute and `app/globals.css` resolves the layout per kind and width.
 */
export type CollectionKind = "metric" | "tile" | "choice" | "cell";

/** Count buckets for count-driven kinds; past two the layout no longer changes. */
export type CollectionCount = "1" | "2" | "many";

/** Only tiles emit `data-count`; other kinds lay out the same at any count. */
const COUNT_DRIVEN: Record<CollectionKind, boolean> = {
  metric: false,
  tile: true,
  choice: false,
  cell: false,
};

/** Custom properties per kind; `collection.test.ts` checks each is declared in `globals.css`. */
export const COLLECTION_TOKENS: Record<CollectionKind, readonly string[]> = {
  metric: [
    "--collection-metric-gap",
    "--collection-metric-min",
    "--collection-metric-max",
    "--collection-metric-item-min-height",
  ],
  tile: [
    "--collection-tile-gap",
    "--collection-tile-solo-width",
    "--collection-tile-aspect-wide",
    "--collection-tile-aspect-sheet",
  ],
  choice: ["--collection-choice-gap"],
  cell: ["--collection-cell-gap", "--collection-cell-size", "--collection-cell-rows"],
};

export function collectionCount(items: number): CollectionCount {
  if (items === 1) return "1";
  if (items === 2) return "2";
  return "many";
}

export interface CollectionAttributes {
  "data-collection": CollectionKind;
  "data-count"?: CollectionCount;
}

/** Spreadable attributes, so existing containers such as `ItemGroup` can opt in. */
export function collectionAttrs(kind: CollectionKind, items?: number): CollectionAttributes {
  if (!COUNT_DRIVEN[kind] || items === undefined) return { "data-collection": kind };
  return { "data-collection": kind, "data-count": collectionCount(items) };
}

/** Tile frame class; it takes its aspect ratio from the container's `--collection-aspect`. */
export const collectionFrame = "strata-collection-frame";

type CollectionElement = "div" | "ul" | "ol";

/** A plain collection container; other components spread `collectionAttrs` instead. */
export function Collection<T extends CollectionElement = "div">({
  as,
  kind,
  items,
  ...rest
}: { as?: T; kind: CollectionKind; items?: number } & Omit<ComponentProps<T>, "as">) {
  // Narrowed to one tag so the props spread stays typed.
  const Tag = (as ?? "div") as "div";
  return <Tag {...(rest as ComponentProps<"div">)} {...collectionAttrs(kind, items)} />;
}
