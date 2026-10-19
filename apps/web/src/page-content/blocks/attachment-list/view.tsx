"use client";

import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import { FileIcon } from "@phosphor-icons/react/dist/ssr/File";
import { FileImageIcon } from "@phosphor-icons/react/dist/ssr/FileImage";
import { XIcon } from "@phosphor-icons/react/dist/ssr/X";
import { Fragment, use, useState } from "react";

import { AppIcon } from "@/shared/ui/app-icon";
import { Button } from "@/shared/ui/primitives/button";
import type { AttachmentResource } from "@/page-content/attachments/resources";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/shared/ui/primitives/drawer";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/shared/ui/primitives/item";
import { cn } from "@/shared/ui/cn";
import { collectionAttrs, collectionFrame } from "@/page-content/collection";
import { NEW_CONTEXT_HINT, NewContextHint } from "@/page-content/external-link";

import { AttachmentResolverContext } from "./resolver";

type Attachment = {
  id: string;
  resource_id: string;
  label: string;
  kind?: "document" | "image";
  media_type?: string;
  size_bytes?: number;
  detail?: string;
};

const ICONS = {
  document: FileIcon,
  image: FileImageIcon,
} as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

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
 * The host's thumbnail variant when one exists, else the original file. Dimensions follow
 * whichever image is loaded so the box matches the incoming bytes.
 */
function tileImage(
  resource: AttachmentResource | undefined,
  href: string | undefined,
): { src: string | undefined; width: number | undefined; height: number | undefined } {
  const thumb = safeResolvedUrl(resource?.thumb_url);
  if (thumb === undefined) {
    return { src: href, width: resource?.width ?? undefined, height: resource?.height ?? undefined };
  }
  return { src: thumb, width: resource?.thumb_width ?? undefined, height: resource?.thumb_height ?? undefined };
}

/**
 * `source_url` is agent-typed attribution: displayed only as an https link to another origin,
 * never fetched by the host.
 */
function externalUrl(value: string | null | undefined): URL | undefined {
  if (value === null || value === undefined) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function isImageResource(resource: AttachmentResource | undefined): boolean {
  return resource?.media_type.toLowerCase().startsWith("image/") === true;
}

/**
 * The host's asset record decides. `kind` is read only for an asset the host cannot resolve yet;
 * with neither, the item renders as a document row.
 */
function rendersAsImage(
  attachment: Attachment,
  resource: AttachmentResource | undefined,
): boolean {
  if (resource !== undefined) return isImageResource(resource);
  return attachment.kind === "image";
}

/** Attribution line under the file, outside the tile link because anchors cannot nest. */
function AttachmentAttribution({ resource }: { resource: AttachmentResource | undefined }) {
  const credit = resource?.credit ?? undefined;
  const source = externalUrl(resource?.source_url);
  if (credit === undefined && source === undefined) return null;
  return (
    <p className="mt-1 px-1 text-meta leading-5 text-muted-foreground">
      {credit}
      {credit !== undefined && source !== undefined ? " · " : null}
      {source === undefined ? null : (
        <a
          href={source.toString()}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="underline underline-offset-2"
        >
          {source.hostname.replace(/^www\./, "")}
          <NewContextHint />
        </a>
      )}
    </p>
  );
}

/** The caption on a document row: what the file is, and whether it is here yet. */
function attachmentMetadata(
  attachment: Attachment,
  resource: AttachmentResource | undefined,
  unavailable: boolean,
): string[] {
  return [
    attachment.detail,
    resource?.media_type ?? attachment.media_type,
    resource?.size_bytes === undefined
      ? attachment.size_bytes === undefined ? undefined : formatBytes(attachment.size_bytes)
      : formatBytes(resource.size_bytes),
    unavailable ? "Not available yet" : undefined,
  ].filter((value): value is string => value !== undefined);
}

/** The preview viewer is a fixed 4:3 frame, not sized to the image. */
function AttachmentImagePreviewFrame({
  label,
  href,
  width,
  height,
}: {
  label: string;
  href: string;
  width?: number;
  height?: number;
}) {
  return (
    <div
      data-slot="attachment-preview-frame"
      className="flex aspect-[4/3] max-h-[65vh] w-full items-center justify-center overflow-hidden rounded-contained bg-muted/50"
    >
      {/* oxlint-disable-next-line nextjs/no-img-element -- see gallery preview above. */}
      <img
        src={href}
        alt={label}
        width={width}
        height={height}
        decoding="async"
        className="size-full object-contain"
      />
    </div>
  );
}

function AttachmentImagePreview({
  attachment,
  resource,
  href,
}: {
  attachment: Attachment;
  resource: AttachmentResource;
  href: string;
}) {
  return (
    <>
      <DrawerHeader className="relative pr-16 text-left">
        <DrawerTitle>{attachment.label}</DrawerTitle>
        <DrawerDescription>
          {[attachment.detail, resource.media_type, formatBytes(resource.size_bytes)]
            .filter((value): value is string => value !== undefined)
            .join(" · ") || "Image attachment"}
        </DrawerDescription>
        <AttachmentAttribution resource={resource} />
        <DrawerClose
          render={(
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-3 top-2.5"
              aria-label="Close attachment preview"
            />
          )}
        >
          <AppIcon icon={XIcon} aria-hidden className="size-5" />
        </DrawerClose>
      </DrawerHeader>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-4">
        <AttachmentImagePreviewFrame
          label={attachment.label}
          href={href}
          width={resource.width ?? undefined}
          height={resource.height ?? undefined}
        />
      </div>
      <DrawerFooter>
        <Button asChild className="w-full" size="action">
          <a href={href} target="_blank" rel="noopener noreferrer">
            <AppIcon icon={ArrowSquareOutIcon} aria-hidden data-icon="inline-start" />
            Open original
            <NewContextHint />
          </a>
        </Button>
      </DrawerFooter>
    </>
  );
}

export function AttachmentList({ items }: { items: Attachment[] }) {
  const assets = use(AttachmentResolverContext);
  const [focusedImage, setFocusedImage] = useState<Attachment | null>(null);
  // An empty list is nothing, not an empty gallery: `every` is vacuously true.
  if (items.length === 0) return null;

  const isImageGallery = items.every((item) => rendersAsImage(item, assets[item.resource_id]));

  if (isImageGallery) {
    const focusedResource = focusedImage === null ? undefined : assets[focusedImage.resource_id];
    const focusedUrl = safeResolvedUrl(focusedResource?.href);
    return (
      <Drawer
        showSwipeHandle
        open={focusedImage !== null}
        triggerId={focusedImage === null ? null : `attachment-trigger-${focusedImage.id}`}
        onOpenChange={(open) => {
          if (!open) setFocusedImage(null);
        }}
      >
        <ItemGroup
          /* The `tile` collection reads the count and owns columns, gap and aspect. */
          {...collectionAttrs("tile", items.length)}
          aria-label="Attachments"
        >
          {items.map((item) => {
            const resource = assets[item.resource_id];
            const url = safeResolvedUrl(resource?.href);
            // The tile shows the variant; the tap still opens the file.
            const tile = tileImage(resource, url);
            const headerClassName = cn(
              "w-full overflow-hidden rounded-contained bg-muted/50",
              collectionFrame,
            );
            const content = (
              <>
                <ItemHeader className={headerClassName}>
                  {url === undefined ? (
                    <div className="flex size-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                      <AppIcon icon={FileImageIcon} aria-hidden="true" />
                      <span className="text-meta leading-5">Not available yet</span>
                    </div>
                  ) : (
                    /* oxlint-disable-next-line nextjs/no-img-element --
                       Asset URLs are host-minted and short lived, so Next's
                       optimizer cannot safely cache or configure them. */
                    <img
                      src={tile.src}
                      alt=""
                      /* Measured dimensions reserve the frame so the gallery does not reflow. */
                      width={tile.width}
                      height={tile.height}
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover"
                    />
                  )}
                </ItemHeader>
                {/* Type and size stay on document rows and in the preview, not on gallery tiles. */}
                <ItemContent className="min-w-0 basis-full">
                  <ItemTitle className="line-clamp-2 w-full min-w-0 break-words whitespace-normal">
                    {item.label}
                  </ItemTitle>
                </ItemContent>
              </>
            );
            return (
              <div key={item.id} role="listitem">
                {url === undefined ? (
                  <Item variant="outline" className="items-start">
                    {content}
                  </Item>
                ) : (
                  <Item asChild variant="outline" className="items-start text-left">
                    <DrawerTrigger
                      id={`attachment-trigger-${item.id}`}
                      nativeButton={false}
                      render={<a href={url} target="_blank" rel="noopener noreferrer" />}
                      onClick={(event) => {
                        if (
                          event.defaultPrevented
                          || event.button !== 0
                          || event.metaKey
                          || event.ctrlKey
                          || event.shiftKey
                          || event.altKey
                        ) {
                          event.preventBaseUIHandler();
                          return;
                        }
                        event.preventDefault();
                        setFocusedImage(item);
                      }}
                      aria-label={`View ${item.label}`}
                    >
                      {content}
                    </DrawerTrigger>
                  </Item>
                )}
                <AttachmentAttribution resource={resource} />
              </div>
            );
          })}
        </ItemGroup>
        <DrawerContent className="mx-auto w-full max-w-2xl bg-background [--drawer-height:min(46rem,82dvh)] [--drawer-max-height:calc(100dvh-0.5rem)]">
          {focusedImage !== null && focusedResource !== undefined && focusedUrl !== undefined
            ? <AttachmentImagePreview attachment={focusedImage} resource={focusedResource} href={focusedUrl} />
            : null}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <ItemGroup className="gap-0" aria-label="Attachments">
      {items.map((item, index) => {
        const resource = assets[item.resource_id];
        const url = safeResolvedUrl(resource?.href);
        const showsAsImage = rendersAsImage(item, resource);
        // An unopenable row has to say so, or it reads as a broken link.
        const metadata = attachmentMetadata(item, resource, url === undefined);
        const preview = showsAsImage && url !== undefined;
        const content = (
          <>
            <ItemMedia
              variant={preview ? "image" : "icon"}
              className="bg-muted/50"
            >
              {preview ? (
                /* oxlint-disable-next-line nextjs/no-img-element --
                   next/image wants a stable src it can cache; ours is minted
                   per render and expires in minutes, and the bytes are our
                   own origin already. */
                <img
                  src={tileImage(resource, url).src}
                  alt=""
                  /* A fixed 40px slot regardless of the file's dimensions. */
                  width={40}
                  height={40}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              ) : (
                <AppIcon icon={showsAsImage ? ICONS.image : ICONS.document} aria-hidden="true" />
              )}
            </ItemMedia>
            <ItemContent className="min-w-0">
              {/* Filenames cannot be shortened by the reader, so wrap at word and separator
                  boundaries and clamp at two lines rather than clipping mid-word. */}
              <ItemTitle className="line-clamp-2 w-full min-w-0 break-words whitespace-normal">
                {item.label}
              </ItemTitle>
              {metadata.length > 0 ? (
                <ItemDescription className="text-pretty">
                  {metadata.join(" · ")}
                </ItemDescription>
              ) : null}
            </ItemContent>
            {url === undefined ? null : (
              <ItemActions>
                <AppIcon
                  icon={ArrowSquareOutIcon}
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
              </ItemActions>
            )}
          </>
        );

        return (
          <Fragment key={item.id}>
            <div role="listitem" className="min-w-0">
              {url === undefined ? (
                <Item className="min-h-16 rounded-none border-0 px-1 py-3">
                  {content}
                </Item>
              ) : (
                <Item asChild className="min-h-16 rounded-none border-0 px-1 py-3">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    // aria-label replaces the contents, so the new-tab cue goes in the label.
                    aria-label={`Open ${item.label} ${NEW_CONTEXT_HINT}`}
                  >
                    {content}
                  </a>
                </Item>
              )}
              <AttachmentAttribution resource={resource} />
            </div>
            {index < items.length - 1 ? <ItemSeparator className="my-0" /> : null}
          </Fragment>
        );
      })}
    </ItemGroup>
  );
}
