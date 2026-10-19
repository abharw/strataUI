"use client";

/**
 * One Space row: disclosure, status line and its Pages, in browse or selection mode. Sharing,
 * rail geometry and Page rows live in `sharing-control`, `tree-connector` and `page-row`.
 */

import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr/CaretRight";

import { AppIcon } from "@/shared/ui/app-icon";
import { cn } from "@/shared/ui/cn";
import { productTextMuted } from "@/shared/ui/styles";
import { Button } from "@/shared/ui/primitives/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/primitives/collapsible";
import { formatListTime, formatListTimeTitle } from "@/shared/formatting/list-time";
import type { InventorySpace } from "@/server/spaces/read/lists";

import { EmptyState } from "@/shared/ui/empty-state";
import type { HomeTreeSpace } from "./home-inventory";
import { useSelecting, useSelectionOrThrow } from "./home-selection";
import { PageRow, SelectablePageRow } from "./page-row";
import { SelectionCheckbox } from "./selection-toolbar";
import { HomeSpaceSharingControl } from "./sharing-control";
import {
  pageConnector,
  pageConnectorSelecting,
  pageListRail,
  pageListRailSelecting,
  spaceStatusRail,
} from "./tree-connector";
import { useViewerClock } from "@/shared/formatting/viewer-clock";

/**
 * Count of unseen Pages, so a collapsed Space still shows that something changed. Null when
 * there is nothing to report.
 */
function spaceUnseenLabel(space: InventorySpace): string | null {
  const count = space.unseenPageCount ?? 0;
  return count === 0 ? null : `${count} updated`;
}

/** The Page count and what this Space's shared link exposes. */
function spaceExposureLabel(space: InventorySpace): string {
  const pages = `${space.activePageCount} Page${space.activePageCount === 1 ? "" : "s"}`;
  const unseen = spaceUnseenLabel(space);
  const segments = space.shareUrl === null
    ? [pages, unseen, "Not shared"]
    // "1 of 3 Pages shared" is one clause, so the unseen count follows it.
    : [`${space.sharedPageCount} of ${pages} shared`, unseen];
  return segments.filter((segment) => segment !== null).join(" · ");
}

function SpaceStatus({ space }: { space: InventorySpace }) {
  const clock = useViewerClock();
  const updatedAt = space.updatedAt.toISOString();
  return (
    <>
      <span className="truncate">{spaceExposureLabel(space)}</span>
      <span aria-hidden>·</span>
      <span className="sr-only">, updated </span>
      <time dateTime={updatedAt} title={clock === null ? undefined : formatListTimeTitle(updatedAt, clock)}>
        {clock === null ? " " : formatListTime(updatedAt, clock.now, clock)}
      </time>
    </>
  );
}

const caret = (
  <AppIcon
    icon={CaretRightIcon}
    data-icon="inline-end"
    aria-hidden
    className="shrink-0 text-product-muted-foreground transition-transform duration-150 ease-out motion-reduce:transition-none group-data-[state=open]:rotate-90"
  />
);

type SpaceHeadProps = {
  entry: HomeTreeSpace;
  summaryId: string;
  disclosureLabel: string;
  forceOpen: boolean;
};

/** Browsing: the whole row is the disclosure. */
function SpaceDisclosureHead({ entry, summaryId, disclosureLabel, forceOpen }: SpaceHeadProps) {
  return (
    <CollapsibleTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        data-strata-no-hover-motion=""
        // `aria-disabled`, not `disabled`, so the Space stays in the tab order while searching.
        // It is inert because the Collapsible is controlled open with no `onOpenChange`.
        aria-disabled={forceOpen}
        className="group h-auto min-h-control min-w-0 flex-1 justify-start gap-3 rounded-control px-2 py-2.5 text-left shadow-none hover:bg-product-active-subtle aria-expanded:bg-transparent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-product-active"
        aria-label={disclosureLabel}
        aria-describedby={summaryId}
      >
        <span aria-hidden className="grid size-7 shrink-0 place-items-center text-heading leading-none">{entry.space.emoji}</span>
        <span className="min-w-0 flex-1 truncate text-row font-medium leading-5">{entry.space.name}</span>
        {caret}
      </Button>
    </CollapsibleTrigger>
  );
}

/** Selecting: the row is the toggle, so the disclosure becomes a separate 44px control. */
function SelectableSpaceHead({ entry, summaryId, disclosureLabel, forceOpen }: SpaceHeadProps) {
  const { state, actions } = useSelectionOrThrow();
  return (
    <>
      <label className="flex min-h-control min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-control px-2 py-2.5 hover:bg-product-active-subtle has-data-checked:bg-product-active-subtle">
        <SelectionCheckbox
          name={entry.space.name}
          describedBy={summaryId}
          checked={state.spaces.has(entry.space.id)}
          onCheckedChange={(checked) => actions.setSpaceSelected(entry.space.id, checked)}
        />
        <span aria-hidden className="grid size-7 shrink-0 place-items-center text-heading leading-none">{entry.space.emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-row font-medium leading-5">{entry.space.name}</span>
          <span id={summaryId} className={`flex min-w-0 items-baseline gap-1.5 text-supporting leading-5 ${productTextMuted}`}>
            <SpaceStatus space={entry.space} />
          </span>
        </span>
      </label>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-strata-no-hover-motion=""
          aria-disabled={forceOpen}
          aria-label={disclosureLabel}
          className="group size-control shrink-0 rounded-full shadow-none"
        >
          {caret}
        </Button>
      </CollapsibleTrigger>
    </>
  );
}

export function HomeSpaceRow({
  entry,
  open = true,
  onOpenChange,
  forceOpen = false,
}: {
  entry: HomeTreeSpace;
  /**
   * Owned by `HomeTree` so open state survives a search that unmounts non-matching rows.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  forceOpen?: boolean;
}) {
  const selecting = useSelecting();
  const isOpen = forceOpen ? true : open;
  // The name stays "Expand/Collapse <Space>"; the exposure summary is the description, so
  // closed Spaces can be compared without making every name a sentence.
  const summaryId = `space-${entry.space.id}-summary`;
  const disclosureLabel = forceOpen
    ? `${entry.space.name} Pages shown while searching`
    : `${isOpen ? "Collapse" : "Expand"} ${entry.space.name}`;

  return (
    <li className="min-w-0">
      <Collapsible open={isOpen} onOpenChange={forceOpen ? undefined : onOpenChange}>
        <div className="flex min-w-0 items-center gap-1">
          {selecting ? (
            <SelectableSpaceHead
              entry={entry}
              summaryId={summaryId}
              disclosureLabel={disclosureLabel}
              forceOpen={forceOpen}
            />
          ) : (
            <SpaceDisclosureHead
              entry={entry}
              summaryId={summaryId}
              disclosureLabel={disclosureLabel}
              forceOpen={forceOpen}
            />
          )}
        </div>
        {selecting ? null : (
          // While open, the rail runs down past the status line to the first Page.
          <div className={cn("relative pl-9", isOpen && entry.pages.length > 0 && spaceStatusRail)}>
            <HomeSpaceSharingControl space={entry.space} pages={entry.allPages} summaryId={summaryId}>
              <SpaceStatus space={entry.space} />
            </HomeSpaceSharingControl>
          </div>
        )}
        <CollapsibleContent className="strata-unfold mt-1">
          {entry.pages.length === 0 ? (
            <EmptyState size="row" title="No Pages in this Space yet." className="px-12" />
          ) : (
            <ul className={selecting ? pageListRailSelecting : pageListRail}>{entry.pages.map((page) => (
              selecting
                ? <SelectablePageRow key={page.id} page={page} connector={pageConnectorSelecting} />
                : <PageRow key={page.id} page={page} connector={pageConnector} />
            ))}</ul>
          )}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
