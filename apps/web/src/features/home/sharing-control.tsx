"use client";

/** The Space row's status line, which also opens the Space Drawer's sharing controls. */

import { ShareNetworkIcon } from "@phosphor-icons/react/dist/ssr/ShareNetwork";
import type { ReactNode } from "react";

import { AppIcon } from "@/shared/ui/app-icon";
import { Button } from "@/shared/ui/primitives/button";
import { productTextMuted } from "@/shared/ui/styles";
import type { InventorySpace, ListPage } from "@/server/spaces/read/lists";

import { SpaceDirectoryActions, SpaceMenuTrigger } from "@/features/spaces/space-menu";

/**
 * The line states who can see which Pages, so it is the way in. The accessible name keeps the
 * visible words, prefixed with the Space, so voice control still matches.
 */
export function HomeSpaceSharingControl({
  space,
  pages,
  summaryId,
  children,
}: {
  space: InventorySpace;
  pages: readonly ListPage[];
  summaryId: string;
  children: ReactNode;
}) {
  return (
    <SpaceDirectoryActions
      spaceId={space.id}
      name={space.name}
      initialShareUrl={space.shareUrl}
      activePageCount={space.activePageCount}
      sharedPageCount={space.sharedPageCount}
      selectionPages={pages.map(({ id, title, shared }) => ({ id, title, shared }))}
    >
      <SpaceMenuTrigger>
        <Button
          type="button"
          variant="ghost"
          data-strata-no-hover-motion=""
          data-space-sharing-control=""
          className="h-auto min-h-control w-full min-w-0 justify-start gap-1.5 rounded-control px-3 py-2 text-left font-normal shadow-none hover:bg-product-active-subtle focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-product-active"
        >
          <span className="sr-only">Sharing for {space.name}: </span>
          <span
            id={summaryId}
            className={`flex min-w-0 items-baseline gap-1.5 truncate text-supporting leading-5 ${productTextMuted}`}
          >
            {children}
          </span>
          {/* The sharing glyph, since a caret on this row already means "expand". */}
          <AppIcon
            icon={ShareNetworkIcon}
            aria-hidden
            className="ml-auto size-4 shrink-0 text-product-muted-foreground"
          />
        </Button>
      </SpaceMenuTrigger>
    </SpaceDirectoryActions>
  );
}
