"use client";

import type { ReactNode } from "react";

import { Progress as ShadcnProgress } from "@/shared/ui/primitives/progress";
import { Ring } from "@/shared/ui/primitives/ring";
import { numericAmount } from "@/shared/formatting/display";
import { FormattedValue, useViewerFormatting } from "@/shared/formatting/viewer";
import { surfaceContained, surfaceCardPad, surfaceMeasure, surfaceNestedReset } from "@/page-content/surface";

function RingProgress({
  label,
  pct,
  formattedPercent,
  caption,
}: {
  label: string;
  pct: number;
  formattedPercent: string;
  caption: ReactNode;
}) {
  return (
    <article className={"flex min-w-0 flex-col items-center text-center " + surfaceContained + " " + surfaceCardPad + " " + surfaceNestedReset + " " + surfaceMeasure + " font-inherit text-foreground"}>
      <div className="relative inline-flex">
        <Ring value={pct} label={`${label}: ${formattedPercent}`} className="size-20 sm:size-24" />
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
          <span className="text-title font-medium leading-none tracking-title tabular-nums">{formattedPercent}</span>
        </div>
      </div>
      <p className="mt-3 min-w-0 max-w-full wrap-normal hyphens-none text-ui font-medium leading-5 @max-[150px]/cell:text-supporting">{label}</p>
      {caption}
    </article>
  );
}

/**
 * Completion as 0-1. Higher-is-better is `current / target`; lower-is-better runs from `start`
 * down to `target`. Both clamp, and the caption keeps the exact figures.
 */
function completion(current: unknown, target: unknown, start: unknown, lower: boolean): number {
  const cur = numericAmount(current);
  const tgt = numericAmount(target);
  if (cur === null || tgt === null) return 0;
  if (!lower) return tgt === 0 ? 0 : clamp(cur / tgt);
  const from = numericAmount(start);
  if (from === null || from === tgt) return cur <= tgt ? 1 : 0;
  return clamp((from - cur) / (from - tgt));
}

function clamp(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(1, ratio));
}

export function Progress({
  label,
  current,
  target,
  target_at,
  direction,
  start,
  presentation,
}: {
  label: string;
  current: unknown;
  target: unknown;
  target_at?: string;
  direction?: "higher" | "lower" | null;
  start?: unknown;
  presentation?: "bar" | "ring" | null;
}) {
  const { format } = useViewerFormatting();
  const ratio = completion(current, target, start, direction === "lower");
  const pct = Math.round(ratio * 100);
  const formattedPercent = format.percent(ratio);
  const formattedCurrent = format.display(current);
  const formattedTarget = format.display(target);

  const caption = (
    <p className="mt-3 break-words text-meta leading-5 tabular-nums text-muted-foreground">
      {formattedCurrent} of {formattedTarget}
      {target_at === undefined ? null : <> · Target <FormattedValue value={target_at} /></>}
    </p>
  );

  if (presentation === "ring") {
    return (
      <RingProgress label={label} pct={pct} formattedPercent={formattedPercent} caption={caption} />
    );
  }

  return (
    <article className={"min-w-0 " + surfaceContained + " " + surfaceCardPad + " " + surfaceNestedReset + " " + surfaceMeasure + " font-inherit text-foreground"}>
      {/* Stacked by default so the label gets a full-width row; from 220px (the `facts`
          threshold) the figure fits beside it. */}
      <div className="flex min-w-0 flex-col gap-1 @min-[220px]/cell:flex-row @min-[220px]/cell:items-start @min-[220px]/cell:justify-between @min-[220px]/cell:gap-4">
        <p className="min-w-0 wrap-normal hyphens-none text-ui font-medium leading-5 @max-[150px]/cell:text-supporting @min-[220px]/cell:pt-1">
          {label}
        </p>
        <p className="shrink-0 text-title font-medium leading-none tracking-title tabular-nums">
          {formattedPercent}
        </p>
      </div>
      <ShadcnProgress
        value={pct}
        aria-label={label}
        aria-valuetext={`${formattedCurrent} of ${formattedTarget}`}
        className="mt-6 h-2 bg-border [&_[data-slot=progress-indicator]]:bg-foreground"
      />
      {caption}
    </article>
  );
}
