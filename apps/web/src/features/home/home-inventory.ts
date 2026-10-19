/** Home's data shaping (Spaces, Pages, search), free of React so tree and tests share it. */

import type { InventorySpace, ListPage } from "@/server/spaces/read/lists";
import { normalizeOwnerSearch } from "@/shared/navigation/search";

/** Shared empty set, so an unfiltered render allocates nothing. */
export const NO_PAGE_IDS: ReadonlySet<string> = new Set<string>();

export type HomeTreeSpace = {
  space: InventorySpace;
  /** Complete active membership, even while search filters the visible rows. */
  allPages: ListPage[];
  pages: ListPage[];
  matchesSpace: boolean;
};

function searchText(value: string | null | undefined): string {
  return value?.toLocaleLowerCase() ?? "";
}

/** Searches the full inventory, keeping a matched Page's parent Space. */
export function filterHomeTree(
  spaces: readonly InventorySpace[],
  pages: readonly ListPage[],
  query: string,
  documentMatchIds: ReadonlySet<string> = NO_PAGE_IDS,
): HomeTreeSpace[] {
  const needle = normalizeOwnerSearch(query);
  const pagesBySpace = new Map<string, ListPage[]>();
  for (const page of pages) {
    const members = pagesBySpace.get(page.spaceId) ?? [];
    members.push(page);
    pagesBySpace.set(page.spaceId, members);
  }

  return spaces.flatMap<HomeTreeSpace>((space) => {
    const members = pagesBySpace.get(space.id) ?? [];
    const matchesSpace = needle !== "" && searchText(`${space.name} ${space.slug}`).includes(needle);
    const matchingPages = needle === "" || matchesSpace
      ? members
      : members.filter((page) => documentMatchIds.has(page.id)
        || searchText(`${page.title} ${page.answer ?? ""} ${page.shared ? "shared visible" : "not shared private"}`).includes(needle));
    if (needle !== "" && !matchesSpace && matchingPages.length === 0) return [];
    return [{ space, allPages: members, pages: matchingPages, matchesSpace }];
  });
}
