"use client";

/** Recent Pages: the whole inventory in last-written order, grouped by the viewer's day. */

import {
  calendarDay,
  formatLongDay,
  type ViewerZone,
} from "@/shared/formatting/list-time";
import type { ListPage } from "@/server/spaces/read/lists";
import { productTextMuted } from "@/shared/ui/styles";

import { useSelecting } from "./home-selection";
import { PageRow, SelectablePageRow } from "./page-row";

export type RecentPageGroup = { day: string; label: string; pages: ListPage[] };

/**
 * Groups by calendar day in `zone` (the viewer's, once known), or UTC for a deterministic server
 * render. Rows say "3h ago", so UTC headings would misplace evening writes.
 */
export function groupRecentPages(
  pages: readonly ListPage[],
  zone?: ViewerZone,
): RecentPageGroup[] {
  const groups = new Map<string, ListPage[]>();
  for (const page of [...pages].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())) {
    const day = calendarDay(page.updatedAt.toISOString(), zone);
    const members = groups.get(day) ?? [];
    members.push(page);
    groups.set(day, members);
  }
  return [...groups.entries()].map(([day, groupedPages]) => ({
    day,
    // Format the instant, not a synthetic midnight, so the label matches the viewer's day.
    label: formatLongDay(groupedPages[0].updatedAt.toISOString(), zone),
    pages: groupedPages,
  }));
}

export function RecentGroups({ groups }: { groups: readonly RecentPageGroup[] }) {
  const selecting = useSelecting();
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.day} aria-labelledby={`recent-${group.day}`}>
          <h2 id={`recent-${group.day}`} className={`mb-2 px-3 text-overline font-bold ${productTextMuted}`}>
            {group.label}
          </h2>
          <ul className="flex flex-col gap-1">
            {group.pages.map((page) => (
              selecting
                ? <SelectablePageRow key={page.id} page={page} context={page.spaceName} />
                : <PageRow key={page.id} page={page} context={page.spaceName} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
