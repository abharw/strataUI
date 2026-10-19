import type { ReactNode } from "react";

import { Separator } from "@/shared/ui/primitives/separator";
import type { ListPage } from "@/server/spaces/read/lists";
import { formatListTime } from "@/shared/formatting/list-time";

import {
  CollectionRow,
  CollectionRowContext,
  CollectionRowDetails,
  CollectionRowHeading,
  CollectionRowLink,
  CollectionRowPreview,
  CollectionRowSeparator,
  CollectionRowState,
  CollectionRowSummary,
  CollectionRowTime,
} from "./collection-row";
import { PinnedMark } from "@/shared/ui/page-marks";
import { productTextMuted } from "@/shared/ui/styles";

function SectionLabel({
  emoji,
  children,
  actions,
}: {
  /** Drawn beside the name and hidden from its accessible name. */
  emoji?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-control items-center gap-2.5 px-0.5">
      {emoji === undefined ? null : (
        <span aria-hidden className="shrink-0 text-body leading-none">{emoji}</span>
      )}
      <h2 className={`min-w-0 shrink truncate text-overline font-bold ${productTextMuted}`}>
        {children}
      </h2>
      <Separator className="min-w-0 flex-1 bg-product-divider" />
      {actions !== undefined ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function Group({
  title,
  emoji,
  actions,
  children,
}: {
  title?: string;
  /** Drawn as an `aria-hidden` sibling so screen readers do not read the glyph as part of the name. */
  emoji?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3.5">
      {title !== undefined ? <SectionLabel emoji={emoji} actions={actions}>{title}</SectionLabel> : null}
      <ul>{children}</ul>
    </section>
  );
}


function PinnedPageState({ page }: { page: ListPage }) {
  if (!page.pinned) return null;
  return <CollectionRowState><PinnedMark /></CollectionRowState>;
}

function PageRowTimestamp({ page }: { page: ListPage }) {
  const dateTime = page.updatedAt.toISOString();
  return (
    <CollectionRowTime dateTime={dateTime}>{formatListTime(dateTime)}</CollectionRowTime>
  );
}

/** Shared page-row hierarchy; owner and shared surfaces fill the context and action slots. */
function PageCollectionRow({
  page,
  href,
  state,
  context,
  action,
}: {
  page: ListPage;
  href: string;
  state?: ReactNode;
  context?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <CollectionRow action={action}>
      <CollectionRowHeading>
        {state}
        <CollectionRowLink href={href} label={`Open ${page.title}`}>{page.title}</CollectionRowLink>
      </CollectionRowHeading>
      <CollectionRowDetails>
        {context === undefined && page.answer === null ? null : (
          <CollectionRowPreview>
            {context === undefined || page.answer === null ? null : (
              <><CollectionRowContext>{context}</CollectionRowContext><CollectionRowSeparator /></>
            )}
            <CollectionRowSummary>{page.answer ?? context}</CollectionRowSummary>
          </CollectionRowPreview>
        )}
        <PageRowTimestamp page={page} />
      </CollectionRowDetails>
    </CollectionRow>
  );
}

/** A page inside a bundle whose shared space name is already the page heading. */
export function BundlePageRow({ page, href }: { page: ListPage; href: string }) {
  return (
    <PageCollectionRow page={page} href={href} state={<PinnedPageState page={page} />} />
  );
}
