"use client";

import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { ImageIcon } from "@phosphor-icons/react/dist/ssr/Image";
import { Fragment, use, useState } from "react";

import { AppIcon } from "@/shared/ui/app-icon";
import { Button } from "@/shared/ui/primitives/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/shared/ui/primitives/item";
import { cn } from "@/shared/ui/cn";
import type { AttachmentResources } from "@/page-content/attachments/resources";
import { AttachmentResolverContext } from "@/page-content/blocks/attachment-list/resolver";
import { BlockLink, type HydratedLink } from "@/page-content/block-link";
import { CollectionEmpty } from "@/page-content/collection-empty";
import { NewContextHint } from "@/page-content/external-link";
import { viewerToday } from "@/page-content/blocks/phases/current";
import { FormattedValue, useViewerFormatting } from "@/shared/formatting/viewer";

type RowMedia = {
  resource_id: string;
  alt: string;
};

type Row = {
  id: string;
  title: string;
  description?: string;
  value?: unknown;
  media?: RowMedia;
  on?: string;
  link?: HydratedLink;
};

/** The same `<img>` URL check `attachment-list` applies; kept local since that one is private. */
function safeThumbUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Leading thumbnail resolved through `AttachmentResolverContext`. An unresolved `resource_id`
 * (still uploading, or rendered before the provider) shows a placeholder square.
 */
function RowThumbnail({
  media,
  assets,
}: {
  media: RowMedia | undefined;
  assets: AttachmentResources;
}) {
  if (media === undefined) return null;
  const resource = assets[media.resource_id];
  const url = safeThumbUrl(resource?.thumb_url ?? resource?.href);
  return (
    <ItemMedia variant={url === undefined ? "icon" : "image"} className="bg-muted/50">
      {url === undefined ? (
        <AppIcon icon={ImageIcon} aria-hidden="true" />
      ) : (
        /* oxlint-disable-next-line nextjs/no-img-element --
           Asset URLs are host-minted and short-lived, so Next's optimizer
           cannot safely cache or configure them; same call attachment-list
           makes for its own tiles. */
        <img
          src={url}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      )}
    </ItemMedia>
  );
}

/** The trailing value, formatted through the same `FormattedValue` pipeline as `metric`. */
function RowValue({ value }: { value: unknown }) {
  if (value === undefined) return null;
  return (
    <span className="whitespace-nowrap text-ui font-medium leading-5 tabular-nums">
      <FormattedValue value={value} />
    </span>
  );
}

/**
 * Chevron only for a followable internal page link: an external `url` gets `BlockLink`'s new-tab
 * icon, and a `page` link without `href` is not shared with this reader.
 */
function RowChevron({ link }: { link: HydratedLink | undefined }) {
  if (link === undefined || link.url !== undefined || link.href === undefined) return null;
  return <AppIcon icon={CaretRightIcon} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

/**
 * Value, chevron and external icon share one trailing flex group so the icon wraps with the value
 * instead of falling to its own line. Chevron and external icon are mutually exclusive.
 */
function RowTrailing({ item, external }: { item: Row; external: boolean }) {
  const hasFigure = item.value !== undefined;
  if (!hasFigure && item.link === undefined) return null;
  return (
    <ItemActions className="shrink-0 gap-2">
      {hasFigure ? <RowValue value={item.value} /> : null}
      {external ? (
        <span data-icon="row-external" className="inline-flex shrink-0 items-center">
          <NewContextHint />
          <AppIcon
            icon={ArrowSquareOutIcon}
            data-icon="inline-end"
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </span>
      ) : (
        <RowChevron link={item.link} />
      )}
    </ItemActions>
  );
}

function RowBody({
  item,
  assets,
  external = false,
}: {
  item: Row;
  assets: AttachmentResources;
  external?: boolean;
}) {
  return (
    <>
      <RowThumbnail media={item.media} assets={assets} />
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full min-w-0 break-words whitespace-normal">{item.title}</ItemTitle>
        {item.description !== undefined ? (
          <ItemDescription className="line-clamp-none break-words">{item.description}</ItemDescription>
        ) : null}
      </ItemContent>
      <RowTrailing item={item} external={external} />
    </>
  );
}

/**
 * One row, wrapped by `BlockLink`, which picks a client `Link`, an external `<a>` or a plain
 * `<div>`. The hover wash applies only when the row is tappable.
 */
function Row({
  item,
  assets,
  presentation,
}: {
  item: Row;
  assets: AttachmentResources;
  presentation: "rows" | "cards";
}) {
  const itemClassName = presentation === "cards"
    ? "min-h-16 items-start gap-3 rounded-contained border-border p-4"
    : "min-h-16 rounded-none border-0 px-1 py-3";
  const body = <Item className={itemClassName}>{<RowBody item={item} assets={assets} />}</Item>;

  if (item.link === undefined) return body;

  const tappable = item.link.url !== undefined || item.link.href !== undefined;
  return (
    <BlockLink link={item.link} className={cn("block min-w-0", tappable && "group")}>
      {({ external }) => (
        <Item
          className={cn(
            itemClassName,
            tappable && "transition-colors duration-100 group-hover:bg-muted/50 group-active:bg-muted/60",
          )}
        >
          <RowBody item={item} assets={assets} external={external} />
        </Item>
      )}
    </BlockLink>
  );
}

/**
 * Groups rows by `on`, days ascending (ISO dates sort as strings). Returns null unless every row
 * has a day.
 */
export function groupByDay(items: Row[]): { day: string; items: Row[] }[] | null {
  if (items.length === 0 || !items.every((item) => item.on !== undefined)) return null;
  const groups = new Map<string, Row[]>();
  for (const item of items) {
    const day = item.on as string;
    const bucket = groups.get(day);
    if (bucket === undefined) groups.set(day, [item]);
    else bucket.push(item);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, dayItems]) => ({ day, items: dayItems }));
}

function RowRun({
  items,
  assets,
  presentation,
}: {
  items: Row[];
  assets: AttachmentResources;
  presentation: "rows" | "cards";
}) {
  return (
    <ItemGroup className={presentation === "cards" ? "gap-3" : "gap-0"}>
      {items.map((item, index) => (
        <Fragment key={item.id}>
          <Row item={item} assets={assets} presentation={presentation} />
          {presentation === "rows" && index < items.length - 1 ? <ItemSeparator className="my-0" /> : null}
        </Fragment>
      ))}
    </ItemGroup>
  );
}

/**
 * The day a `by-day` list opens on: today if present, else the next upcoming day, else the last
 * day. The same rule serves plans and logs.
 */
export function initialDay(days: readonly string[], today: string): string {
  if (days.includes(today)) return today;
  return days.find((day) => day > today) ?? days[days.length - 1];
}

/**
 * One day's rows with previous/next controls, like the carousel. The server renders the day the
 * viewer clock picks; a reader in another zone gets the formatting provider's re-render.
 */
function DayPager({
  groups,
  assets,
}: {
  groups: { day: string; items: Row[] }[];
  assets: AttachmentResources;
}) {
  const { state } = useViewerFormatting();
  const days = groups.map((group) => group.day);
  const today = viewerToday(state.now, state.timeZone);
  const [selected, setSelected] = useState<string | null>(null);
  // Keep the reader's chosen day across live updates unless the update removed it.
  const day = selected !== null && days.includes(selected) ? selected : initialDay(days, today);
  const index = days.indexOf(day);
  const group = groups[index];

  return (
    <div className="min-w-0" data-day={day}>
      <div className="mb-1 flex min-h-control items-center justify-between gap-2 px-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="size-control shrink-0 rounded-full text-muted-foreground strata-press"
          onClick={() => setSelected(days[index - 1])}
          disabled={index === 0}
          aria-label="Previous day"
        >
          <AppIcon icon={CaretLeftIcon} aria-hidden="true" />
        </Button>

        <div className="flex min-w-0 flex-1 flex-col items-center">
          <p className="truncate text-ui font-medium" aria-live="polite">
            <FormattedValue value={day} />
          </p>
          <p className="text-micro font-medium tabular-nums text-muted-foreground">
            {index + 1} / {days.length}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="size-control shrink-0 rounded-full text-muted-foreground strata-press"
          onClick={() => setSelected(days[index + 1])}
          disabled={index === days.length - 1}
          aria-label="Next day"
        >
          <AppIcon icon={CaretRightIcon} aria-hidden="true" />
        </Button>
      </div>
      <RowRun items={group.items} assets={assets} presentation="rows" />
    </div>
  );
}

export function ItemList({
  items,
  presentation,
  empty,
}: {
  items: Row[];
  presentation?: "rows" | "cards" | "by-day" | null;
  empty?: string;
}) {
  // Read above the early return so it runs on every render.
  const assets = use(AttachmentResolverContext);
  if (items.length === 0) return <CollectionEmpty text={empty ?? ""} />;

  const resolvedPresentation = presentation === "cards" ? "cards" : "rows";
  const groups = groupByDay(items);

  // The schema rejects by-day with undated rows; anything else falls through to flat rows.
  if (presentation === "by-day" && groups !== null) {
    return (
      <div className="min-w-0 font-inherit text-foreground">
        <DayPager groups={groups} assets={assets} />
      </div>
    );
  }

  return (
    <div className="min-w-0 font-inherit text-foreground">
      {groups === null ? (
        <RowRun items={items} assets={assets} presentation={resolvedPresentation} />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.day} className="min-w-0">
              <p className="mb-2 px-1 text-meta font-medium text-muted-foreground">
                <FormattedValue value={group.day} />
              </p>
              <RowRun items={group.items} assets={assets} presentation={resolvedPresentation} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
