"use client";

import { useMemo, useState } from "react";

import { Button } from "@/shared/ui/primitives/button";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/primitives/popover";
import { Item, ItemActions, ItemContent, ItemDescription } from "@/shared/ui/primitives/item";
import type { RecentChange } from "@/server/pages/read/assemble";
import { useViewerFormatting } from "@/shared/formatting/viewer";
import { productTextMuted } from "@/shared/ui/styles";

function newChangesLabel(count: number): string {
  return count === 1 ? "1 new change" : `${count} new changes`;
}

/** The store keeps changes oldest-last; history reads newest first. */
export function newestFirst(changes: readonly RecentChange[]): readonly RecentChange[] {
  return [...changes].reverse();
}

/**
 * The Updated timestamp as a trigger for recent changes, with a dot marking unseen ones. With
 * nothing unseen the caller renders the plain timestamp.
 */
export function PageChangesPopover({
  announcementVersion,
  changes,
  updatedAt,
}: {
  /** A version that landed after first paint; remounts the announcement. Null until then. */
  announcementVersion: number | null;
  changes: readonly RecentChange[];
  updatedAt: string;
}) {
  const [open, setOpen] = useState(false);
  const { format } = useViewerFormatting();
  const ordered = useMemo(() => newestFirst(changes), [changes]);
  const updated = format.display(updatedAt);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {announcementVersion === null ? null : (
        <p
          key={announcementVersion}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-slot="page-update-announcement"
          className="sr-only"
        >
          New update available.
        </p>
      )}
      <PopoverTrigger asChild>
        {/* Keyed to the announced update so its CSS entrance replays; the popover stays mounted. */}
        <Button
          variant="ghost"
          key={announcementVersion ?? "seeded"}
          type="button"
          data-slot="page-changes-trigger"
          title={format.absoluteDateTime(updatedAt)}
          aria-label={`Updated ${updated}. ${newChangesLabel(changes.length)}.`}
          // The negative margin cancels the padding so "Updated" starts on the hero's left edge.
          className={`${announcementVersion === null ? "" : "strata-strip-in "}-ml-1.5 h-auto shrink-0 gap-1.5 rounded-sm px-1.5 text-micro font-medium leading-5 tracking-meta ${productTextMuted} tabular-nums`}
        >
          Updated {updated}
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="max-w-[calc(100vw-1.5rem)] p-1"
      >
        <p className={`px-3 pb-1 pt-2 text-meta font-medium leading-4 ${productTextMuted}`}>
          Recent changes
        </p>
        <div role="list" data-slot="page-changes-list">
          {ordered.map((change) => (
            <Item
              key={`${change.version}-${change.at}`}
              role="listitem"
              className="min-h-0 flex-nowrap rounded-none border-0 px-3 py-2.5 not-last:border-b not-last:border-product-divider"
            >
              <ItemContent className="min-w-0">
                <ItemDescription className="line-clamp-none break-words text-supporting leading-5 text-foreground">
                  {change.summary}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="shrink-0 self-start pt-0.5">
                <time
                  dateTime={change.at}
                  title={format.absoluteDateTime(change.at)}
                  className={`text-meta leading-[18px] ${productTextMuted} tabular-nums`}
                >
                  {format.display(change.at)}
                </time>
              </ItemActions>
            </Item>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
