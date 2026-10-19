"use client";

/**
 * Server-side search of Page bodies, which never reach the client. Handles debounce, abort,
 * staleness and retry so the tree sees only matching ids and a status.
 */

import { useCallback, useEffect, useState } from "react";

import { normalizeOwnerSearch } from "@/shared/navigation/search";

import { NO_PAGE_IDS } from "./home-inventory";

export type BodySearchStatus = "loading" | "ready" | "error";

export type BodySearch = {
  /** Empty whenever the answer is not for the current query. */
  matchIds: ReadonlySet<string>;
  status: BodySearchStatus;
  retry: () => void;
};

export function useBodySearch({
  url: bodySearchUrl,
  query: normalizedSearch,
  initialQuery,
}: {
  url: string | undefined;
  /** Already normalized by the caller. */
  query: string;
  initialQuery: string;
}): BodySearch {
  // Retry re-runs the effect, so it shares the same abort and debounce path.
  const [retryToken, setRetryToken] = useState(0);
  const [documentSearch, setDocumentSearch] = useState<{
    query: string;
    pageIds: ReadonlySet<string>;
    status: BodySearchStatus;
  }>(() => ({
    query: normalizeOwnerSearch(initialQuery),
    pageIds: NO_PAGE_IDS,
    status: normalizeOwnerSearch(initialQuery) === "" || bodySearchUrl === undefined ? "ready" : "loading",
  }));

  /** Debounce coalesces typing; abort stops an old response from replacing a newer one. */
  useEffect(() => {
    if (normalizedSearch === "" || bodySearchUrl === undefined) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setDocumentSearch({ query: normalizedSearch, pageIds: NO_PAGE_IDS, status: "loading" });
      const url = new URL(bodySearchUrl, window.location.origin);
      url.searchParams.set("q", normalizedSearch);
      void fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }).then(async (result) => {
        if (!result.ok) throw new Error(`Search failed with ${result.status}`);
        const body: unknown = await result.json();
        if (
          typeof body !== "object"
          || body === null
          || !Array.isArray((body as { page_ids?: unknown }).page_ids)
          || !(body as { page_ids: unknown[] }).page_ids.every((id) => typeof id === "string")
        ) {
          throw new Error("Search returned an invalid response");
        }
        setDocumentSearch({
          query: normalizedSearch,
          pageIds: new Set((body as { page_ids: string[] }).page_ids),
          status: "ready",
        });
      }).catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setDocumentSearch({ query: normalizedSearch, pageIds: NO_PAGE_IDS, status: "error" });
      });
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [bodySearchUrl, normalizedSearch, retryToken]);

  const retry = useCallback(() => setRetryToken((token) => token + 1), []);

  const searching = normalizedSearch !== "";
  return {
    // A late answer for an older query is ignored.
    matchIds: documentSearch.query === normalizedSearch ? documentSearch.pageIds : NO_PAGE_IDS,
    status: !searching || bodySearchUrl === undefined
      ? "ready"
      : documentSearch.query === normalizedSearch
        ? documentSearch.status
        : "loading",
    retry,
  };
}
