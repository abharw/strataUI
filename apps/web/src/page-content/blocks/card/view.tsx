"use client";

import { use, type ReactNode } from "react";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { FileImageIcon } from "@phosphor-icons/react/dist/ssr/FileImage";

import { AppIcon } from "@/shared/ui/app-icon";
import { cn } from "@/shared/ui/cn";
import { surfaceCardPad, surfaceContained } from "@/page-content/surface";
import { BlockLink, type HydratedLink } from "@/page-content/block-link";
import { GeneratedHeading } from "@/page-content/blocks/section/view";
// The context module, not the gallery: importing `attachment-list/view` would pull that
// deferred leaf into first load.
import { AttachmentResolverContext } from "@/page-content/blocks/attachment-list/resolver";

type CardMedia = { resource_id: string; alt: string };

/**
 * Same URL guard as `attachment-list`: relative same-origin paths or `https:` only. Duplicated
 * so this module does not import the gallery.
 */
function safeResolvedUrl(value: string | undefined): string | undefined {
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
 * Fixed-shape cover frame: the host's thumbnail variant when available, else the original, and
 * a placeholder while the resource is unresolved.
 */
function CardCover({ media }: { media: CardMedia }) {
  const assets = use(AttachmentResolverContext);
  const resource = assets[media.resource_id];
  const src = safeResolvedUrl(resource?.thumb_url ?? resource?.href);

  return (
    <div className="aspect-video w-full shrink-0 overflow-hidden bg-muted/50">
      {src === undefined ? (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <AppIcon icon={FileImageIcon} aria-hidden="true" />
        </div>
      ) : (
        /* oxlint-disable-next-line nextjs/no-img-element -- host-minted,
           short-lived URL, same as every other attachment tile. */
        <img
          src={src}
          alt={media.alt}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      )}
    </div>
  );
}

/**
 * Draws the frame (cover, title block, child, footer) around whatever child arrives. Always an
 * `<article>`, which `globals.css` uses to stretch cards to the row height inside a `grid`.
 */
export function Card({
  title,
  emoji,
  description,
  media,
  link,
  footer,
  children,
}: {
  title?: string;
  emoji?: string;
  description?: string;
  media?: CardMedia;
  link?: HydratedLink;
  footer?: string;
  children?: ReactNode;
}) {
  // Show the chevron only for a resolved destination; `BlockLink` renders a page link this
  // reader cannot open as plain content.
  const isLinkActive = link !== undefined && (link.url !== undefined || link.href !== undefined);
  const hasHeader = title !== undefined || emoji !== undefined || description !== undefined;

  return (
    <article
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden font-inherit text-foreground",
        surfaceContained,
      )}
    >
      <BlockLink
        link={link}
        className={cn("flex h-full min-w-0 flex-col", isLinkActive && "strata-press")}
      >
        {media === undefined ? null : <CardCover media={media} />}
        {/* `data-in-card` lets nested leaves drop their own surface (`surfaceNestedReset`), and
            `@container/card` lets leaves like `facts` respond to this card's width. */}
        <div
          data-in-card=""
          className={cn("flex flex-1 flex-col gap-3 min-w-0 @container/card", surfaceCardPad)}
        >
          {hasHeader ? (
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {title === undefined ? (
                  /* Drawn even without a title, but hidden from screen readers
                     like a Space's marker. */
                  emoji === undefined ? null : (
                    <span aria-hidden className="block shrink-0 text-ui leading-5">{emoji}</span>
                  )
                ) : (
                  <GeneratedHeading className="flex min-w-0 items-baseline gap-1.5 break-words text-ui font-medium leading-5 tracking-row text-foreground">
                    {emoji === undefined ? null : (
                      <span aria-hidden className="shrink-0 font-normal leading-5">{emoji}</span>
                    )}
                    <span className="min-w-0 break-words">{title}</span>
                  </GeneratedHeading>
                )}
                {description === undefined ? null : (
                  <p className="mt-1 break-words text-supporting leading-5 text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
              {isLinkActive ? (
                <AppIcon
                  icon={CaretRightIcon}
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
              ) : null}
            </div>
          ) : null}

          {children === undefined ? null : <div className="min-w-0 flex-1">{children}</div>}

          {footer === undefined ? null : (
            <p className="mt-auto break-words pt-1 text-meta leading-5 text-muted-foreground">
              {footer}
            </p>
          )}
        </div>
      </BlockLink>
    </article>
  );
}
