"use client";

import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import { type RefObject, useEffect, useId, useRef, useState } from "react";

import { AppIcon } from "@/shared/ui/app-icon";
import { Button } from "@/shared/ui/primitives/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/shared/ui/primitives/item";
import { Separator } from "@/shared/ui/primitives/separator";
import { formatPartialIsoDate, isIsoDate, isPartialIsoDate } from "@/shared/formatting/display";
import { FormattedValue, LocalDateTime } from "@/shared/formatting/viewer";
import { cn } from "@/shared/ui/cn";
import { CollectionEmpty } from "@/page-content/collection-empty";
import { NewContextHint } from "@/page-content/external-link";
import { surfaceList, surfaceListRowDivider } from "@/page-content/surface";

type Reference = {
  id: string;
  title: string;
  url: string;
  source?: string;
  published_at?: string;
  note?: string;
};

function displaySource(item: Reference): string {
  if (item.source !== undefined) return item.source;
  try {
    return new URL(item.url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

/** Whether a clamped block is holding lines back. Exported so tests can read it. */
export function clamps({
  scrollHeight,
  clientHeight,
}: {
  scrollHeight: number;
  clientHeight: number;
}): boolean {
  return scrollHeight - clientHeight > 1;
}

/**
 * Whether the clamp is withholding text, measured rather than guessed from length. Measurement
 * pauses while expanded, or the control would disappear while in use.
 */
function useClamped<T extends HTMLElement>(expanded: boolean): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (node === null || expanded) return;
    const measure = () => setClamped(clamps(node));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [expanded]);

  return [ref, clamped];
}

/*
 * References are often bare URLs with no spaces, so they need an explicit break or they overflow
 * the icon column and get clipped by the card.
 */
function ReferenceRow({ item }: { item: Reference }) {
  const [expanded, setExpanded] = useState(false);
  const [titleRef, titleClamped] = useClamped<HTMLDivElement>(expanded);
  const [noteRef, noteClamped] = useClamped<HTMLParagraphElement>(expanded);
  const bodyId = useId();
  const clamp = expanded ? "line-clamp-none" : "line-clamp-2";

  return (
    <li className="relative last:[&_[data-reference-separator]]:hidden">
      <Item
        asChild
        className="min-h-16 flex-nowrap gap-3 rounded-none border-0 px-1 py-3.5 outline-offset-[-3px] transition-colors duration-100 active:bg-muted/60"
      >
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          <ItemContent id={bodyId} className="min-w-0 gap-1">
            <ItemTitle
              ref={titleRef}
              className={cn("w-full break-words text-body font-medium leading-5 tracking-row", clamp)}
            >
              {item.title}
            </ItemTitle>
            <ItemDescription className="line-clamp-none break-words text-meta text-muted-foreground">
              {displaySource(item)}
              {item.published_at === undefined ? null : (
                <>
                  <span aria-hidden="true"> · </span>
                  {isPartialIsoDate(item.published_at) ? (
                    formatPartialIsoDate(item.published_at)
                  ) : isIsoDate(item.published_at) ? (
                    <FormattedValue value={item.published_at} />
                  ) : (
                    <LocalDateTime value={item.published_at} />
                  )}
                </>
              )}
            </ItemDescription>
            {item.note !== undefined ? (
              <p
                ref={noteRef}
                className={cn("break-words text-supporting leading-5 text-muted-foreground", clamp)}
              >
                {item.note}
              </p>
            ) : null}
            {/* The row is the link, so the new-tab cue goes in its name, once. */}
            <NewContextHint />
          </ItemContent>
          <ItemActions className="ml-auto shrink-0 self-center">
            <AppIcon icon={ArrowSquareOutIcon} className="size-4 text-muted-foreground" />
          </ItemActions>
        </a>
      </Item>
      {/* Outside the anchor, since controls cannot nest in links. Shown only when a measurement
          finds withheld text; works by tap and keyboard. */}
      {titleClamped || noteClamped ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="mb-1 ml-1 px-3 text-meta font-medium text-muted-foreground"
        >
          {expanded ? "Less" : "More"}
          {/* Names its reference, since several rows can show this control. */}
          <span className="sr-only"> of {item.title}</span>
        </Button>
      ) : null}
      <Separator
        data-reference-separator
        className={surfaceListRowDivider}
      />
    </li>
  );
}

export function ReferenceList({ items, empty }: { items: Reference[]; empty?: string }) {
  if (items.length === 0) return <CollectionEmpty text={empty ?? ""} />;

  return (
    <ul className={surfaceList} aria-label="References">
      {items.map((item) => (
        <ReferenceRow key={item.id} item={item} />
      ))}
    </ul>
  );
}
