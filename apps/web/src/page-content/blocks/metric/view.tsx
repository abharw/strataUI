"use client";

import { ArrowDownIcon } from "@phosphor-icons/react/dist/ssr/ArrowDown";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/ssr/ArrowUp";
import { MinusIcon } from "@phosphor-icons/react/dist/ssr/Minus";

import { AppIcon, type AppIconData } from "@/shared/ui/app-icon";
import { cn } from "@/shared/ui/cn";
import { useViewerFormatting } from "@/shared/formatting/viewer";
import { surfaceContained, surfaceCardPadLg, surfaceMeasure, surfaceNestedReset } from "@/page-content/surface";
import { MetricTrend } from "./trend";

type Change = {
  value: number | string;
  direction: "up" | "down" | "flat";
  polarity?: "good" | "bad" | "neutral";
};

const DIRECTION_ICON: Record<Change["direction"], AppIconData> = {
  up: ArrowUpIcon,
  down: ArrowDownIcon,
  flat: MinusIcon,
};

/**
 * Colour by polarity, not direction. Neutral and absent polarity stay muted so an unscored move
 * never reads as good or bad news.
 */
const POLARITY_CLASS: Record<NonNullable<Change["polarity"]>, string> = {
  good: "text-status-success-foreground",
  bad: "text-status-danger-foreground",
  neutral: "text-muted-foreground",
};

function displayParts(
  value: unknown,
  display: (input: unknown) => string,
): { value: string; unit?: string } {
  if (value !== null && typeof value === "object") {
    const quantity = value as Record<string, unknown>;
    if (typeof quantity.value === "number" && typeof quantity.unit === "string") {
      return { value: display(quantity.value), unit: quantity.unit };
    }
  }
  return { value: display(value) };
}

function ChangeChip({ change, display }: { change: Change; display: (input: unknown) => string }) {
  const tone = POLARITY_CLASS[change.polarity ?? "neutral"];
  const Icon = DIRECTION_ICON[change.direction];
  return (
    <p className={cn("mt-1.5 flex min-w-0 items-center gap-1 text-meta font-medium leading-4 tabular-nums", tone)}>
      <AppIcon icon={Icon} className="size-3 shrink-0" />
      <span className="min-w-0 wrap-normal hyphens-none">{display(change.value)}</span>
    </p>
  );
}

export function Metric({
  label,
  value,
  change,
  trend,
}: {
  label: string;
  value: unknown;
  change?: Change;
  trend?: readonly number[];
}) {
  const { format } = useViewerFormatting();
  const parts = displayParts(value, format.display);

  return (
    <article className={"flex h-full min-h-36 min-w-0 flex-col justify-between " + surfaceContained + " " + surfaceCardPadLg + " " + surfaceNestedReset + " " + surfaceMeasure + " font-inherit text-foreground sm:min-h-40"}>
      <p className="min-w-0 wrap-normal hyphens-none line-clamp-2 text-supporting font-medium leading-5 text-muted-foreground @max-[150px]/cell:text-meta">
        {label}
      </p>
      <div className="mt-5 min-w-0 [[data-in-card]_&]:mt-0">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 tabular-nums">
            <span className="min-w-0 max-w-full whitespace-nowrap break-words text-title font-medium leading-none tracking-title sm:text-title-wide">
              {parts.value}
            </span>
            {parts.unit === undefined ? null : (
              <span className="min-w-0 max-w-full break-words whitespace-normal text-meta font-medium leading-4 text-muted-foreground sm:text-supporting">
                {parts.unit}
              </span>
            )}
          </p>
          {trend === undefined ? null : <MetricTrend label={label} values={trend} />}
        </div>
        {change === undefined ? null : <ChangeChip change={change} display={format.display} />}
      </div>
    </article>
  );
}
