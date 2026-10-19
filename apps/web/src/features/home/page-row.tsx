"use client";

/** One Page row in Home's inventory: `PageRow` opens the Page, `SelectablePageRow` toggles it. */

import Link from "next/link";

import {
  productCollectionContext,
  productTextMuted,
  productTimestamp,
} from "@/shared/ui/styles";
import { formatListTime, formatListTimeTitle } from "@/shared/formatting/list-time";
import type { ListPage } from "@/server/spaces/read/lists";
import { ownerRoutes } from "@/shared/navigation/owner-routes";

import { useSelectionOrThrow } from "./home-selection";
import { ExposureMark, PinnedMark } from "@/shared/ui/page-marks";
import { SelectionCheckbox } from "./selection-toolbar";
import { useViewerClock } from "@/shared/formatting/viewer-clock";
import { WriterMark } from "@/shared/ui/writer-mark";

const routes = ownerRoutes();

const rowClass = "group/page-row flex min-h-control min-w-0 items-center gap-3 rounded-control px-3 py-2.5 outline-none hover:bg-product-active-subtle focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-product-active";

/**
 * The link name is title plus pin and sharing state; the visible Space, summary and recency
 * nodes are the description, in the order the row draws them.
 */
function rowDescription(page: ListPage, context: string | undefined) {
  const detailId = `page-${page.id}-detail`;
  const timeId = `page-${page.id}-time`;
  const unseenId = `page-${page.id}-unseen`;
  const detailed = context !== undefined || page.answer !== null;
  const unseen = page.unseen === true;
  // The unseen dot's spoken half joins the description, last.
  const described = [detailed ? detailId : null, timeId, unseen ? unseenId : null];
  return {
    detailId,
    timeId,
    unseenId,
    detailed,
    unseen,
    describedBy: described.filter((id) => id !== null).join(" "),
  };
}

function PageRowBody({ page, context }: { page: ListPage; context?: string }) {
  const clock = useViewerClock();
  const updatedAt = page.updatedAt.toISOString();
  const { detailId, timeId, unseenId, detailed, unseen } = rowDescription(page, context);
  return (
    <>
      <span className="min-w-0 flex-1">
          {/* Unseen is weight plus a dot, not a tint, and is announced once via the description. */}
          <span className={`flex min-w-0 items-center gap-1.5 text-row leading-5 ${unseen ? "font-semibold" : "font-medium"}`}>
            {unseen ? (
              <>
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-foreground" />
                <span id={unseenId} className="sr-only">, updated since you last opened</span>
              </>
            ) : null}
            <span className="min-w-0 truncate">{page.title}</span>
          </span>
          {detailed ? (
            <span id={detailId} className={`mt-0.5 flex min-w-0 items-baseline gap-1.5 text-supporting leading-5 ${productTextMuted}`}>
              {context === undefined ? null : <span className={productCollectionContext}>{context}</span>}
              {context === undefined || page.answer === null ? null : (
                <><span aria-hidden>·</span><span className="sr-only">, </span></>
              )}
              {page.answer === null ? null : <span className="min-w-0 truncate">{page.answer}</span>}
            </span>
          ) : null}
        </span>
        {/* Pin, exposure, attribution, then the clock. Each state is a glyph with a word. The
            writer mark sits at 70% until hover or focus; an unknown writer draws nothing. */}
        <span className="flex shrink-0 items-center gap-2">
          {page.pinned ? <PinnedMark /> : null}
          <ExposureMark shared={page.shared} />
          {page.writer === null ? null : (
            <WriterMark
              writer={page.writer}
              at={updatedAt}
              summary={page.lastSummary}
              size="xs"
              className="opacity-70 transition-opacity duration-[120ms] ease-(--ease-out) group-hover/page-row:opacity-100 group-focus-visible/page-row:opacity-100 motion-reduce:transition-none"
            />
          )}
          <time
            id={timeId}
            dateTime={updatedAt}
            title={clock === null ? undefined : formatListTimeTitle(updatedAt, clock)}
            className={productTimestamp}
          >
            <span className="sr-only">, updated </span>
            {clock === null ? " " : formatListTime(updatedAt, clock.now, clock)}
          </time>
        </span>
    </>
  );
}

type PageRowProps = {
  page: ListPage;
  /** The Space to name in a flat list, where no parent row says it. */
  context?: string;
  /** The rail class from `tree-connector`; flat lists pass nothing. */
  connector?: string;
};

export function PageRow({ page, context, connector = "" }: PageRowProps) {
  const { describedBy } = rowDescription(page, context);
  return (
    <li className={`min-w-0 ${connector}`}>
      <Link
        href={routes.page(page.id)}
        className={rowClass}
        aria-label={`Open ${page.title}${page.pinned ? ", pinned" : ""}, ${page.shared ? "shared in Space link" : "not shared in Space link"}`}
        aria-describedby={describedBy}
      >
        <PageRowBody page={page} context={context} />
      </Link>
    </li>
  );
}

/** Selection-mode row: the label is the row, so a tap anywhere toggles it. */
export function SelectablePageRow({ page, context, connector = "" }: PageRowProps) {
  const { state, actions } = useSelectionOrThrow();
  const { describedBy } = rowDescription(page, context);
  return (
    <li className={`min-w-0 ${connector}`}>
      <label className={`${rowClass} cursor-pointer has-data-checked:bg-product-active-subtle`}>
        <SelectionCheckbox
          name={page.title}
          describedBy={describedBy}
          checked={state.pages.has(page.id)}
          onCheckedChange={(checked) => actions.setPageSelected(page.id, checked)}
        />
        <PageRowBody page={page} context={context} />
      </label>
    </li>
  );
}
