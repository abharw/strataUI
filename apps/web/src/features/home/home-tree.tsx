"use client";

/**
 * Home, composed. Owns the address-mirrored query and tab, which Spaces are expanded, and which
 * view is drawn; the visible parts are separate modules.
 */

import { useCallback, useDeferredValue, useMemo, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/primitives/tabs";
import type { OwnerSessionSummary } from "@/server/auth/owner-session";
import type { AgentRoster } from "@/server/credentials/agents";
import type { InventorySpace, ListPage } from "@/server/spaces/read/lists";
import { normalizeOwnerSearch } from "@/shared/navigation/search";

import { EmptyState } from "@/shared/ui/empty-state";
import { HomeFirstRun } from "./first-run";
import { filterHomeTree } from "./home-inventory";
import { HomeHeader } from "./home-header";
import { HomeSearch } from "./home-search";
import { HomeSelectionProvider } from "./home-selection";
import { ChromeNoticeRegion } from "@/shared/ui/overflow-menu";
import { groupRecentPages, RecentGroups } from "./recent-groups";
import { HomeSpaceRow } from "./space-row";
import { useBodySearch } from "./use-body-search";
import { useViewerClock } from "@/shared/formatting/viewer-clock";
import { WriterMarkProvider } from "@/shared/ui/writer-mark";

// Re-exported so callers keep importing from this module.
export { filterHomeTree, type HomeTreeSpace } from "./home-inventory";
export { groupRecentPages, type RecentPageGroup } from "./recent-groups";
export { HomeSpaceRow } from "./space-row";

export type HomeTreeTab = "spaces" | "recent";

/** Spaces open on arrival: the most recently active one and the one the address named. */
function initiallyExpanded(
  spaces: readonly InventorySpace[],
  initialSpaceId: string | undefined,
): string[] {
  const first = spaces[0]?.id;
  return [
    ...(first === undefined ? [] : [first]),
    ...(initialSpaceId === undefined ? [] : [initialSpaceId]),
  ];
}

export function HomeTree({
  spaces,
  pages,
  agents,
  sessions,
  initialTab = "spaces",
  initialQuery = "",
  bodySearch,
  initialSpaceId,
  personName = null,
  selecting = false,
}: {
  spaces: InventorySpace[];
  pages: ListPage[];
  /** Undefined on fixtures that model no roster. */
  agents?: AgentRoster[];
  sessions?: OwnerSessionSummary[];
  initialTab?: HomeTreeTab;
  initialQuery?: string;
  bodySearch?: Readonly<{ url: string }>;
  initialSpaceId?: string;
  /** Null is the normal case: no surface invents a name. */
  personName?: string | null;
  selecting?: boolean;
}) {
  const clock = useViewerClock();
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<HomeTreeTab>(initialTab);
  // Deferred so typing never waits on regrouping up to 250 Pages.
  const search = useDeferredValue(query);
  const normalizedSearch = normalizeOwnerSearch(search);
  const documentSearch = useBodySearch({
    url: bodySearch?.url,
    query: normalizedSearch,
    initialQuery,
  });
  // Seeded once from the unfiltered list so open state survives a search that unmounts rows.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(initiallyExpanded(spaces, initialSpaceId)),
  );

  const filteredSpaces = useMemo(
    () => filterHomeTree(spaces, pages, search, documentSearch.matchIds),
    [documentSearch.matchIds, pages, search, spaces],
  );
  const filteredPages = useMemo(() => filteredSpaces.flatMap((entry) => entry.pages), [filteredSpaces]);
  const searching = normalizedSearch !== "";
  // `groupRecentPages` sorts by activity before grouping, so Recent is in last-written order.
  const recentGroups = useMemo(
    () => groupRecentPages(filteredPages, clock ?? undefined),
    [filteredPages, clock],
  );

  const setSpaceOpen = useCallback((spaceId: string, open: boolean) => {
    setExpanded((held) => {
      const next = new Set(held);
      if (open) next.add(spaceId);
      else next.delete(spaceId);
      return next;
    });
  }, []);

  // An empty Strata gets first-run guidance instead of a search field and empty tabs.
  const empty = spaces.length === 0 && pages.length === 0;

  /** Mirrors the tab with `replaceState`, so it survives reloads without adding history. */
  function selectTab(value: string) {
    const nextTab: HomeTreeTab = value === "recent" ? "recent" : "spaces";
    setTab(nextTab);

    const url = new URL(window.location.href);
    if (nextTab === "recent") url.searchParams.set("tab", "recent");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  /** Mirrors the query into `?q=` without adding a history entry per key. */
  function changeQuery(value: string) {
    setQuery(value);
    const url = new URL(window.location.href);
    if (normalizeOwnerSearch(value) === "") url.searchParams.delete("q");
    else url.searchParams.set("q", value);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  const searchStatus = documentSearch.status === "loading"
    ? "Searching Page text…"
    : documentSearch.status === "error"
      ? "Page text couldn’t be searched. Titles and summaries still work."
      : searching
        ? `${filteredSpaces.length} Space${filteredSpaces.length === 1 ? "" : "s"} and ${filteredPages.length} Page${filteredPages.length === 1 ? "" : "s"} shown.`
        : "";

  return (
    <WriterMarkProvider>
      <HomeSelectionProvider spaces={spaces} pages={pages} initialSelecting={selecting}>
        <section className="flex min-w-0 flex-col gap-6 sm:gap-7">
          {/* Only owner chrome toasts, so the live region mounts here, not in the root layout. */}
          <ChromeNoticeRegion />
          <HomeHeader
            personName={personName}
            spaceCount={spaces.length}
            pageCount={pages.length}
            agents={agents}
            sessions={sessions}
          >
            {empty ? null : (
              <HomeSearch
                query={query}
                onQueryChange={changeQuery}
                status={documentSearch.status}
                message={searchStatus}
                onRetry={documentSearch.retry}
              />
            )}
          </HomeHeader>

          {empty ? <HomeFirstRun agents={agents} /> : (
            <Tabs value={tab} onValueChange={selectTab} className="gap-5">
              {/* `min-h` clamps the primitive's `h-8` up to 44px without an important override. */}
              <TabsList
                aria-label="Home views"
                variant="line"
                className="grid min-h-control w-full grid-cols-2"
              >
                <TabsTrigger value="spaces" className="text-ui font-medium">Spaces</TabsTrigger>
                <TabsTrigger value="recent" className="text-ui font-medium">Recent Pages</TabsTrigger>
              </TabsList>
              <TabsContent value="spaces" className="mt-0">
                {filteredSpaces.length === 0 ? (
                  <EmptyState
                    size="row"
                    title={documentSearch.status === "loading"
                      ? "Searching Page text…"
                      : !searching && spaces.length === 0
                        ? "No Spaces yet."
                        : "No Spaces or Pages match your search."}
                  />
                ) : (
                  <ul className="flex flex-col gap-1">
                    {filteredSpaces.map((entry) => (
                      <HomeSpaceRow
                        key={entry.space.id}
                        entry={entry}
                        open={expanded.has(entry.space.id)}
                        onOpenChange={(open) => setSpaceOpen(entry.space.id, open)}
                        forceOpen={searching}
                      />
                    ))}
                  </ul>
                )}
              </TabsContent>
              <TabsContent value="recent" className="mt-0">
                {recentGroups.length === 0 ? (
                  <EmptyState
                    size="row"
                    title={documentSearch.status === "loading"
                      ? "Searching Page text…"
                      : !searching && pages.length === 0
                        ? "No Pages yet."
                        : "No Pages match your search."}
                  />
                ) : (
                  <RecentGroups groups={recentGroups} />
                )}
              </TabsContent>
            </Tabs>
          )}

        </section>
      </HomeSelectionProvider>
    </WriterMarkProvider>
  );
}
