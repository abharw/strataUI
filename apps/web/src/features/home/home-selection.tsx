"use client";

/**
 * Home's selection mode as a context: the header, Space rows and Page rows each read only what
 * they need instead of threading props through the tree.
 */

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { InventorySpace, ListPage } from "@/server/spaces/read/lists";

import { NO_PAGE_IDS } from "./home-inventory";

function toggleId(held: ReadonlySet<string>, id: string, checked: boolean): ReadonlySet<string> {
  const next = new Set(held);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
}

export type HomeSelectionState = {
  selecting: boolean;
  pages: ReadonlySet<string>;
  spaces: ReadonlySet<string>;
};

export type HomeSelectionActions = {
  enter: () => void;
  exit: () => void;
  setPageSelected: (pageId: string, checked: boolean) => void;
  setSpaceSelected: (spaceId: string, checked: boolean) => void;
};

export type HomeSelectionMeta = {
  selectedPageIds: string[];
  selectedSpaceIds: string[];
  selectedCount: number;
  allSelectedPagesPinned: boolean;
};

export type HomeSelectionValue = {
  state: HomeSelectionState;
  actions: HomeSelectionActions;
  meta: HomeSelectionMeta;
};

/** Null means browse-only; fixtures and tests render `HomeSpaceRow` without a provider. */
const HomeSelectionContext = createContext<HomeSelectionValue | null>(null);

export function useHomeSelection(): HomeSelectionValue | null {
  return use(HomeSelectionContext);
}

export function useSelecting(): boolean {
  return use(HomeSelectionContext)?.state.selecting ?? false;
}

/** Rows that draw a checkbox are only rendered in selection mode, so a missing provider is a bug. */
export function useSelectionOrThrow(): HomeSelectionValue {
  const value = use(HomeSelectionContext);
  if (value === null) {
    throw new Error("Selectable Home rows must be inside HomeSelectionProvider");
  }
  return value;
}

export function HomeSelectionProvider({
  spaces,
  pages,
  initialSelecting = false,
  children,
}: {
  spaces: readonly InventorySpace[];
  pages: readonly ListPage[];
  /** Seeded from `?select=1`. */
  initialSelecting?: boolean;
  children: ReactNode;
}) {
  const [selectedPages, setSelectedPages] = useState<ReadonlySet<string>>(NO_PAGE_IDS);
  const [selectedSpaces, setSelectedSpaces] = useState<ReadonlySet<string>>(NO_PAGE_IDS);
  // Local state mirrored to the address with `replaceState`, so entering or leaving never
  // refetches Home.
  const [selecting, setSelecting] = useState(initialSelecting);

  const setPageSelected = useCallback((pageId: string, checked: boolean) => {
    setSelectedPages((held) => toggleId(held, pageId, checked));
  }, []);
  const setSpaceSelected = useCallback((spaceId: string, checked: boolean) => {
    setSelectedSpaces((held) => toggleId(held, spaceId, checked));
  }, []);

  /** Uses `replaceState` so leaving leaves no history entry, keeping any query or tab in the URL. */
  const exitSelection = useCallback(() => {
    setSelecting(false);
    setSelectedPages(NO_PAGE_IDS);
    setSelectedSpaces(NO_PAGE_IDS);
    const url = new URL(window.location.href);
    url.searchParams.delete("select");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const enterSelection = useCallback(() => {
    setSelecting(true);
    const url = new URL(window.location.href);
    url.searchParams.set("select", "1");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  // On the window, since focus may be anywhere (or nowhere) when the reader is done.
  useEffect(() => {
    if (!selecting) return;
    function leaveOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") exitSelection();
    }
    window.addEventListener("keydown", leaveOnEscape);
    return () => window.removeEventListener("keydown", leaveOnEscape);
  }, [exitSelection, selecting]);

  // Derived from the server's lists so a revalidation that removes a row also drops it here.
  const selectedPageList = useMemo(
    () => pages.filter((page) => selectedPages.has(page.id)),
    [pages, selectedPages],
  );
  const selectedPageIds = useMemo(
    () => selectedPageList.map((page) => page.id),
    [selectedPageList],
  );
  const selectedSpaceIds = useMemo(
    () => spaces.filter((space) => selectedSpaces.has(space.id)).map((space) => space.id),
    [spaces, selectedSpaces],
  );

  const value = useMemo<HomeSelectionValue>(() => ({
    state: { selecting, pages: selectedPages, spaces: selectedSpaces },
    actions: {
      enter: enterSelection,
      exit: exitSelection,
      setPageSelected,
      setSpaceSelected,
    },
    meta: {
      selectedPageIds,
      selectedSpaceIds,
      selectedCount: selectedPageIds.length + selectedSpaceIds.length,
      allSelectedPagesPinned: selectedPageList.length > 0
        && selectedPageList.every((page) => page.pinned),
    },
  }), [
    enterSelection,
    exitSelection,
    selectedPageIds,
    selectedPageList,
    selectedPages,
    selectedSpaceIds,
    selectedSpaces,
    selecting,
    setPageSelected,
    setSpaceSelected,
  ]);

  return <HomeSelectionContext value={value}>{children}</HomeSelectionContext>;
}
