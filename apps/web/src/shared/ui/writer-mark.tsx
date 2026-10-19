/**
 * Attribution mark: agent avatar, optional name, and a "who · when · what" tooltip. Touch screens
 * get no tooltip, so the same sentence is the mark's `aria-label`.
 */
import type { ReactNode } from "react";

import { formatListTime, formatShortDay } from "@/shared/formatting/list-time";
import type { PageWriter } from "@/server/pages/read/provenance";
import { cn } from "./cn";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/primitives/tooltip";

import { AgentAvatar, type AgentAvatarSize } from "./agent-avatar";
import { productTextMuted } from "./styles";
import { useViewerClock, type ViewerClock } from "@/shared/formatting/viewer-clock";

/**
 * Mount once per surface that draws marks so siblings share the skip delay: the first tooltip
 * waits 400ms, the rest open instantly. Nesting is harmless.
 */
export function WriterMarkProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={300}>
      {children}
    </TooltipProvider>
  );
}

/** Keeps the tooltip on one line beside a name and a duration. */
const SUMMARY_LIMIT = 60;

function truncateSummary(summary: string): string {
  const clean = summary.trim().replace(/\s+/gu, " ");
  if (clean.length <= SUMMARY_LIMIT) return clean;
  return `${clean.slice(0, SUMMARY_LIMIT - 1).trimEnd()}…`;
}

/**
 * `Instinct · 2h ago · Added 15 shows, marked 3 sold out`. A revoked writer shows its disconnect
 * day instead of a duration; an empty summary drops its segment.
 */
export function writerTooltipText(
  writer: PageWriter | null,
  wrote?: { at?: string; summary?: string | null },
  clock?: ViewerClock | null,
): string {
  if (writer === null) return "Unknown agent";
  const zone = clock ?? undefined;
  const when = writer.revokedAt === null
    ? (wrote?.at === undefined ? null : formatListTime(wrote.at, clock?.now, zone))
    : `disconnected ${formatShortDay(writer.revokedAt, zone)}`;
  const what = wrote?.summary == null ? "" : truncateSummary(wrote.summary);
  return [writer.label, when, what === "" ? null : what]
    .filter((segment): segment is string => segment !== null && segment !== "")
    .join(" · ");
}

export function WriterMark({
  writer,
  at,
  summary = null,
  size = "sm",
  showLabel = false,
  className,
  open,
}: {
  writer: PageWriter | null;
  /** When the write landed. The tooltip's middle segment. */
  at?: string;
  /** The page's `last_summary`; the tooltip's third segment. */
  summary?: string | null;
  size?: Extract<AgentAvatarSize, "xs" | "sm">;
  showLabel?: boolean;
  className?: string;
  /** Fixtures only: pins the tooltip open. */
  open?: boolean;
}) {
  const clock = useViewerClock();
  const description = writerTooltipText(writer, { at, summary }, clock);
  const mark: ReactNode = (
    // The wrapper carries the label; the avatar inside is decorative.
    <span
      role="img"
      aria-label={description}
      className={cn("inline-flex min-w-0 items-center gap-1.5", className)}
    >
      <AgentAvatar writer={writer} size={size} className="translate-y-[0.5px]" />
      {showLabel && writer !== null ? (
        <span aria-hidden className={cn("min-w-0 truncate", productTextMuted)}>{writer.label}</span>
      ) : null}
    </span>
  );

  return (
    <Tooltip open={open}>
      {/* A span, not a button: tree rows are links and cannot contain buttons. */}
      <TooltipTrigger asChild>{mark}</TooltipTrigger>
      <TooltipContent
        data-strata-writer-tooltip=""
        sideOffset={6}
        className="max-w-none whitespace-nowrap"
      >
        {description}
      </TooltipContent>
    </Tooltip>
  );
}
