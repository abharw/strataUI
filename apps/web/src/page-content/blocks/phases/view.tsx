"use client";

import { CheckIcon } from "@phosphor-icons/react/dist/ssr/Check";

import { AppIcon } from "@/shared/ui/app-icon";
import { FormattedValue, useViewerFormatting } from "@/shared/formatting/viewer";
import { surfaceCardPad, surfaceContained } from "@/page-content/surface";
import {
  daysUntil,
  remainingLabel,
  stageStates,
  viewerToday,
  type StageState,
} from "./current";

type Stage = {
  id: string;
  name: string;
  start: string;
  end: string;
  note?: string;
};

type PhasesProps = {
  stages: Stage[];
  target?: { label: string; at: string };
};

/**
 * Each state differs by more than shade: bar height, treatment (solid, muted, dashed) and a word
 * or glyph in the row, for forced colors and monochrome. `aria-current="step"` covers AT.
 */
const TRACK: Record<StageState, string> = {
  past: "h-1.5 rounded-full bg-muted-foreground/60",
  current: "h-2.5 rounded-full bg-foreground",
  ahead: "h-1.5 rounded-full border border-dashed border-border",
};

const NAME: Record<StageState, string> = {
  past: "text-muted-foreground",
  current: "font-medium text-foreground",
  ahead: "text-muted-foreground",
};

export function Phases({ stages, target }: PhasesProps) {
  const { format, state } = useViewerFormatting();
  const today = viewerToday(state.now, state.timeZone);
  const states = stageStates(stages, today);

  return (
    <div className={"min-w-0 " + surfaceContained + " " + surfaceCardPad + " font-inherit text-foreground"}>
      {/* The track scrolls rather than squeezing stage names, like the streak calendar. */}
      <ol
        className="flex min-w-0 gap-3 overflow-x-auto overscroll-x-contain pb-1"
        aria-label="Stages"
      >
        {stages.map((stage, index) => {
          const stageState = states[index];
          return (
            <li
              key={stage.id}
              data-stage={stageState}
              aria-current={stageState === "current" ? "step" : undefined}
              className="flex min-w-24 flex-1 shrink-0 flex-col gap-2"
            >
              <span aria-hidden="true" className={"block w-full " + TRACK[stageState]} />
              <span className={"flex min-w-0 items-center gap-1 text-meta leading-5 " + NAME[stageState]}>
                {stageState === "past" ? (
                  <AppIcon icon={CheckIcon} aria-hidden="true" className="size-3.5 shrink-0" />
                ) : null}
                <span className="min-w-0 break-words">{stage.name}</span>
              </span>
              {stageState === "current" ? (
                <span className="text-micro font-medium text-foreground">Now</span>
              ) : null}
              <span className="text-micro leading-4 tabular-nums text-muted-foreground">
                <FormattedValue value={stage.start} /> – <FormattedValue value={stage.end} />
              </span>
              {stage.note === undefined ? null : (
                <span className="text-micro leading-4 text-muted-foreground">{stage.note}</span>
              )}
            </li>
          );
        })}
      </ol>

      {target === undefined ? null : (
        <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-border pt-3 text-supporting">
          <span className="font-medium">{target.label}</span>
          <time dateTime={target.at} className="tabular-nums text-muted-foreground">
            {format.display(target.at)}
          </time>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums text-muted-foreground">
            {remainingLabel(daysUntil(target.at, today))}
          </span>
        </p>
      )}
    </div>
  );
}
