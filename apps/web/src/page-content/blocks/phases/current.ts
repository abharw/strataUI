/**
 * The current stage, derived from the viewer clock (`now`/`timeZone` from the formatting
 * context), never `Date.now()`, so it stays pure. Stages are ISO days compared as strings.
 */
export type StageState = "past" | "current" | "ahead";

export interface Stage {
  readonly start: string;
  readonly end: string;
}

const DAY_MS = 86_400_000;

/** The reader's calendar day, as the ISO date the stages are written in. */
export function viewerToday(now: number, timeZone: string): string {
  const parts = new Map(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(now))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

/**
 * Index of the current stage, or -1. Stages are half-open, so a boundary day belongs to the stage
 * it opens; the last stage includes its end day so the plan is not finished on race morning.
 */
export function currentStageIndex(stages: readonly Stage[], today: string): number {
  if (stages.length === 0) return -1;
  if (today < stages[0].start) return -1;
  const open = stages.findIndex((stage) => today < stage.end);
  if (open !== -1) return open;
  return today === stages[stages.length - 1].end ? stages.length - 1 : -1;
}

/** One state per stage, in stage order. */
export function stageStates(stages: readonly Stage[], today: string): StageState[] {
  const current = currentStageIndex(stages, today);
  if (current === -1) {
    // Either the whole plan is still ahead, or all of it is behind.
    const ahead = stages.length > 0 && today < stages[0].start;
    return stages.map(() => (ahead ? "ahead" : "past"));
  }
  return stages.map((_stage, index) =>
    index < current ? "past" : index === current ? "current" : "ahead",
  );
}

/** Whole calendar days from `today` to `date`; negative once it has passed. */
export function daysUntil(date: string, today: string): number {
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / DAY_MS);
}

/** The target line's distance label, in words rather than colour. */
export function remainingLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1) return `${days} days left`;
  return `${-days} days ago`;
}
