"use client";

/** Home's search field and its live status region. The query is owned by the tree. */

import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";

import { AppIcon } from "@/shared/ui/app-icon";
import { productRowAction, productTextMuted } from "@/shared/ui/styles";
import { Button } from "@/shared/ui/primitives/button";
import { Input } from "@/shared/ui/primitives/input";
import { MAX_OWNER_SEARCH_CHARS } from "@/shared/navigation/search";

import type { BodySearchStatus } from "./use-body-search";

export function HomeSearch({
  query,
  onQueryChange,
  status,
  message,
  onRetry,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  /** Status of the body search; title filtering never fails. */
  status: BodySearchStatus;
  /** Live-region text, or "" when there is nothing to announce. */
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mt-5">
      {/* The label wraps only the name; counts are a description so the name never changes. */}
      <label htmlFor="home-search" className="sr-only">Search Spaces and Pages</label>
      <div className="relative">
        <AppIcon
          icon={MagnifyingGlassIcon}
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-product-muted-foreground"
        />
        <Input
          id="home-search"
          type="search"
          name="q"
          autoComplete="off"
          maxLength={MAX_OWNER_SEARCH_CHARS}
          value={query}
          aria-busy={status === "loading"}
          aria-describedby="home-search-status"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search Spaces and Pages"
          className="pl-11"
        />
      </div>
      <div className={status === "error"
        ? "mt-2 flex flex-wrap items-center gap-2 px-1"
        : ""}>
        <span
          id="home-search-status"
          role="status"
          aria-live="polite"
          className={status === "error"
            ? `text-supporting leading-5 ${productTextMuted}`
            : "sr-only"}
        >
          {message}
        </span>
        {status === "error" ? (
          // Retry in place keeps the query and the open tab.
          <Button
            type="button"
            variant="outline"
            className={productRowAction}
            onClick={onRetry}
          >
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}
