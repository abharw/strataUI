"use client";

/**
 * "View steps": the page's write trail, newest first, opt-in per page (`live_steps`). Chrome built
 * on the shared timeline primitives, not a registry component.
 */

import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { use, useMemo, useState } from "react";

import { AppIcon } from "@/shared/ui/app-icon";
import { useViewerFormatting } from "@/shared/formatting/viewer";
import { productTextMuted } from "@/shared/ui/styles";
import { Button } from "@/shared/ui/primitives/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/primitives/collapsible";
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
} from "@/shared/ui/primitives/timeline";
import type { AttachmentResource } from "@/page-content/attachments/resources";
import type { RecentChange } from "@/server/pages/read/assemble";
import { AttachmentResolverContext } from "@/page-content/blocks/attachment-list/resolver";

import { newestFirst } from "./page-changes";

function stepCountLabel(count: number): string {
  return count === 1 ? "1 step" : `${count} steps`;
}

/** Serving URLs are host-minted and relative; anything else is not followed. */
function safeHref(value: string | undefined): string | undefined {
  return value !== undefined && value.startsWith("/") && !value.startsWith("//") ? value : undefined;
}

/** Date gutter: stacked above the line on a phone, a right-aligned column from `sm` up. */
const GUTTER_ITEM = "sm:group-data-[orientation=vertical]/timeline:ms-32";
const GUTTER_DATE =
  "sm:group-data-[orientation=vertical]/timeline:absolute sm:group-data-[orientation=vertical]/timeline:-left-32 sm:group-data-[orientation=vertical]/timeline:w-20 sm:group-data-[orientation=vertical]/timeline:text-right";

export function PageSteps({
  steps,
  defaultOpen = false,
}: {
  /** Oldest last, as the store keeps it. */
  steps: readonly RecentChange[];
  defaultOpen?: boolean;
}) {
  // Stays mounted for the page's life, so a poll replacing the rows keeps the fold as it was.
  const [open, setOpen] = useState(defaultOpen);
  const ordered = useMemo(() => newestFirst(steps), [steps]);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-slot="page-steps"
      className="-mt-2 border-t border-product-divider pt-1"
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          data-strata-no-hover-motion=""
          // The ghost variant fills an expanded trigger; here the open state is caret and ink only.
          className={`group -ml-1.5 h-auto min-h-control gap-1.5 rounded-sm px-1.5 py-2 text-supporting font-medium ${productTextMuted} hover:bg-product-active-subtle hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-foreground`}
          aria-label={`View steps. ${stepCountLabel(steps.length)}.`}
        >
          View steps
          <span aria-hidden className="font-normal tabular-nums">{steps.length}</span>
          <AppIcon
            icon={CaretDownIcon}
            aria-hidden
            className="size-3.5 shrink-0 transition-transform duration-150 ease-out motion-reduce:transition-none group-data-[state=open]:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="strata-unfold">
        {/* `value={0}`: no step is "completed", so the rail stays gray. */}
        <Timeline
          aria-label="Steps"
          role="list"
          value={0}
          className="min-w-0 px-1 pb-2 pt-4"
        >
          {ordered.map((step, index) => <Step key={step.version} step={step} index={index} />)}
        </Timeline>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Step({ step, index }: { step: RecentChange; index: number }) {
  const { format } = useViewerFormatting();
  const refs = step.assetRefs ?? [];
  return (
    <TimelineItem role="listitem" step={index + 1} className={`min-w-0 ${GUTTER_ITEM}`}>
      <TimelineHeader className="min-w-0">
        <TimelineSeparator className="bg-muted-foreground" />
        <TimelineDate
          className={`text-micro leading-5 tabular-nums ${GUTTER_DATE}`}
          dateTime={step.at}
          // The version is the `base_version` an agent echoes back.
          title={`v${step.version} · ${format.absoluteDateTime(step.at)}`}
        >
          {format.display(step.at)}
        </TimelineDate>
        <p className="break-words text-ui font-medium leading-5 tracking-row sm:-mt-0.5">
          <span className="sr-only">Version {step.version}: </span>
          {step.summary}
        </p>
        <TimelineIndicator className="border-muted-foreground bg-background" />
      </TimelineHeader>
      {refs.length === 0 ? null : (
        <TimelineContent className="mt-2 min-w-0">
          <StepFiles refs={refs} />
        </TimelineContent>
      )}
    </TimelineItem>
  );
}

/**
 * Files a step attached, via the page's attachment resolver. An unresolved ref renders a
 * placeholder so an agent can see the upload has not landed.
 */
function StepFiles({ refs }: { refs: readonly string[] }) {
  const assets = use(AttachmentResolverContext);
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Files attached to this step">
      {refs.map((ref) => <StepFile key={ref} resource={assets[ref]} />)}
    </ul>
  );
}

function StepFile({ resource }: { resource: AttachmentResource | undefined }) {
  const href = safeHref(resource?.href);
  const frame = "flex h-24 max-w-full items-center justify-center overflow-hidden rounded-contained border border-product-divider bg-muted/50";
  if (resource === undefined || href === undefined) {
    return (
      <li className={`${frame} w-32 px-3 text-center text-meta leading-5 ${productTextMuted}`}>
        Not available yet
      </li>
    );
  }
  if (!resource.media_type.toLowerCase().startsWith("image/")) {
    return (
      <li className={`${frame} w-32 px-3 text-center text-meta leading-5`}>
        <a href={href} target="_blank" rel="noopener noreferrer" className="line-clamp-2 break-all underline underline-offset-2">
          {resource.filename}
        </a>
      </li>
    );
  }
  // The tile shows the thumbnail when there is one; the tap opens the full file.
  const thumb = safeHref(resource.thumb_url);
  return (
    <li className={frame}>
      <a href={href} target="_blank" rel="noopener noreferrer" className="block h-full" aria-label={`Open ${resource.filename}`}>
        {/* oxlint-disable-next-line nextjs/no-img-element --
            Asset URLs are host-minted and short lived, so Next's optimizer
            cannot safely cache or configure them. */}
        <img
          src={thumb ?? href}
          alt=""
          width={thumb === undefined ? resource.width ?? undefined : resource.thumb_width ?? undefined}
          height={thumb === undefined ? resource.height ?? undefined : resource.thumb_height ?? undefined}
          loading="lazy"
          decoding="async"
          className="h-full w-auto max-w-full object-contain"
        />
      </a>
    </li>
  );
}
