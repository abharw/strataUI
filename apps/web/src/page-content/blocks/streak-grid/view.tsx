import { FormattedValue, useViewerFormatting } from "@/shared/formatting/viewer";
import { Collection } from "@/page-content/collection";
import { CollectionEmpty } from "@/page-content/collection-empty";
import { surfaceCardPad, surfaceContained } from "@/page-content/surface";
// Shared with the schema via the zod-free module; a grid past the cap says so instead of
// rendering.
import { MAX_STREAK_SPAN_DAYS } from "./limits";

type Cell = {
  date: string;
  value: number;
};

const DAY_MS = 86_400_000;
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;

function todayIso(now: number, timeZone: string): string {
  const values = new Map(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(now)).map((part) => [part.type, part.value]),
  );
  return `${values.get("year")!}-${values.get("month")!}-${values.get("day")!}`;
}

function fromIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIso(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(iso: string, delta: number): string {
  return toIso(new Date(fromIso(iso).getTime() + delta * DAY_MS));
}

function weekday(iso: string): number {
  return fromIso(iso).getUTCDay();
}

function inclusiveDays(start: string, end: string): number {
  return Math.floor((fromIso(end).getTime() - fromIso(start).getTime()) / DAY_MS) + 1;
}

function level(
  value: number | undefined,
  max: number,
): "missing" | "zero" | "low" | "medium" | "high" {
  if (value === undefined) return "missing";
  if (value === 0) return "zero";
  const ratio = value / max;
  if (ratio < 0.34) return "low";
  if (ratio < 0.67) return "medium";
  return "high";
}

function levelClass(value: ReturnType<typeof level>): string {
  switch (value) {
    case "zero":
      return "border-transparent bg-intensity-zero";
    case "low":
      return "border-transparent bg-intensity-low";
    case "medium":
      return "border-transparent bg-intensity-medium";
    case "high":
      return "border-transparent bg-intensity-high";
    default:
      return "border-transparent bg-transparent";
  }
}

/**
 * The calendar range drawn: earliest to latest cell, or with `days`, the window ending at `end`
 * (default: the reader's today).
 */
function windowFor(
  sorted: Cell[],
  days: number | undefined,
  end: string | undefined,
  today: string,
): { start: string; last: string } {
  if (days === undefined) {
    return { start: sorted[0].date, last: sorted[sorted.length - 1].date };
  }
  const last = end ?? today;
  return { start: addDays(last, -(days - 1)), last };
}

export function StreakGrid({
  cells,
  days,
  end,
  empty,
}: {
  cells: Cell[];
  days?: number;
  end?: string;
  empty?: string;
}) {
  const { state } = useViewerFormatting();
  const today = todayIso(state.now, state.timeZone);
  // `empty` is the author's sentence, rendered where the calendar would be.
  if (cells.length === 0) {
    return empty === undefined ? null : <CollectionEmpty text={empty} />;
  }

  const ordered = [...cells].sort((left, right) => left.date.localeCompare(right.date));
  const { start, last } = windowFor(ordered, days, end, today);
  // A floating window resolves against the reader's clock, so drop cells that have since fallen
  // outside it.
  const sorted = days === undefined
    ? ordered
    : ordered.filter((cell) => cell.date >= start && cell.date <= last);
  const byDate = new Map(sorted.map((cell) => [cell.date, cell.value]));
  // Unique dates make the span the only bound that can fire; see `./limits`.
  if (inclusiveDays(start, last) > MAX_STREAK_SPAN_DAYS) {
    return (
      <div role="alert" className={surfaceContained + " " + surfaceCardPad + " text-supporting text-muted-foreground"}>
        This streak range is too large to display safely.
      </div>
    );
  }
  const visualStart = addDays(start, -weekday(start));
  const visualEnd = addDays(last, 6 - weekday(last));
  const max = Math.max(...sorted.map((cell) => cell.value), 1);
  const total = sorted.reduce((sum, cell) => sum + cell.value, 0);
  const activeDays = sorted.filter((cell) => cell.value > 0).length;

  const range: string[] = [];
  for (let current = visualStart; current <= visualEnd; current = addDays(current, 1)) {
    range.push(current);
  }
  // Per-week sums aligned with the grid give forced-colors readers what the fills carry.
  const weekSums: (number | undefined)[] = [];
  for (let week = 0; week * 7 < range.length; week += 1) {
    let sum = 0;
    let observed = false;
    for (const date of range.slice(week * 7, week * 7 + 7)) {
      const value = byDate.get(date);
      if (value !== undefined) {
        observed = true;
        sum += value;
      }
    }
    // A week with no observations prints nothing - a 0 there would invent it.
    weekSums.push(observed ? sum : undefined);
  }

  return (
    <figure className={surfaceContained + " " + surfaceCardPad + " font-inherit text-foreground"}>
      <figcaption className="mb-4">
        <span className="block text-ui font-medium leading-5">
          {activeDays} active {activeDays === 1 ? "day" : "days"}
        </span>
        <span className="mt-1 block text-meta text-muted-foreground">
          <FormattedValue value={start} /> to <FormattedValue value={last} /> ·{" "}
          <FormattedValue value={total} /> total
        </span>
      </figcaption>

      <div className="grid grid-cols-[12px_minmax(0,1fr)] gap-2">
        {/* Row labels share the cell grid's gap and height tokens. */}
        <div
          aria-hidden
          className="grid grid-rows-7 gap-(--collection-cell-gap) text-calendar text-muted-foreground/80"
        >
          {WEEKDAYS.map((day, index) => (
            <span key={`${day}-${index}`} className="h-(--collection-cell-size) text-center">
              {index % 2 === 1 ? day : ""}
            </span>
          ))}
        </div>
        <div
          className="overflow-x-auto overscroll-x-contain pb-1"
          tabIndex={0}
          aria-label="Scrollable streak calendar"
        >
          <Collection kind="cell" aria-hidden>
            {range.map((date) => {
              const value = byDate.get(date);
              const intensity = level(value, max);
              const isToday = date === today;
              return (
                <span
                  key={date}
                  title={`${date}: ${value === undefined ? "no observation" : value}`}
                  data-strata-streak-cell
                  data-level={intensity}
                  data-today={isToday ? "true" : undefined}
                  className={`relative rounded-data-cell border ${levelClass(intensity)} ${
                    isToday ? "ring-2 ring-primary ring-offset-1" : ""
                  }`}
                >
                  {isToday && value !== undefined ? (
                    // Forced colors strip fills, so today shows its number via the forced-colors
                    // media query. No observation stays blank; a printed 0 would invent one.
                    <span aria-hidden="true" className="strata-streak-cell-today-value">
                      {value > 99 ? "99+" : <FormattedValue value={value} />}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </Collection>
          <div
            aria-hidden
            className="strata-streak-week-sums mt-1 grid w-max grid-flow-col gap-(--collection-cell-gap)"
          >
            {weekSums.map((sum, week) => (
              <span
                key={`week-sum-${week}`}
                className="w-(--collection-cell-size) overflow-visible whitespace-nowrap text-center text-calendar tabular-nums text-muted-foreground"
              >
                {sum === undefined ? "" : sum > 99 ? "99+" : <FormattedValue value={sum} />}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div
        aria-hidden
        className="mt-3 flex items-center justify-end gap-1.5 text-overline text-muted-foreground"
      >
        <span>Less</span>
        {(["zero", "low", "medium", "high"] as const).map((intensity) => (
          <span
            key={intensity}
            data-strata-streak-cell
            data-level={intensity}
            className={`size-3 rounded-data-key border ${levelClass(intensity)}`}
          />
        ))}
        <span>More</span>
      </div>

      <div className="sr-only max-w-px overflow-hidden">
        <table>
          <caption>
            Daily streak values from <FormattedValue value={start} /> through{" "}
            <FormattedValue value={last} />. <FormattedValue value={activeDays} /> active days,{" "}
            <FormattedValue value={total} /> total.
          </caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((cell) => (
              <tr key={cell.date}>
                <th scope="row">{cell.date}</th>
                <td><FormattedValue value={cell.value} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
