/**
 * Time-axis ticks at the resolution of the label span (hour, day, month, year). Date-only labels
 * are calendar dates formatted in UTC; offset-bearing datetimes use the viewer's zone.
 */
import { isIsoDate } from "@/shared/formatting/display";

export type TimeAxisUnit = "hour" | "day" | "month" | "year";

const DAY_MS = 86_400_000;

/** Two days of readings are a clock; four months are a calendar. */
const HOUR_SPAN_DAYS = 2;
const DAY_SPAN_DAYS = 120;
const MONTH_SPAN_DAYS = 3 * 365;

/** `Date.parse` reads "Week 1" as a January, so only ISO-leading labels count as dates. */
const ISO_LEAD = /^\d{4}-\d{2}-\d{2}/;

function instant(label: string): number {
  // Date-only labels parse as UTC midnight, which UTC formatting reads back unchanged.
  return ISO_LEAD.test(label) ? Date.parse(label) : Number.NaN;
}

/** The coarsest unit that still tells the labels apart across their span. */
export function timeAxisUnit(labels: readonly string[]): TimeAxisUnit {
  const times = labels.map(instant).filter((value) => Number.isFinite(value));
  if (times.length < 2) return "day";
  const days = (Math.max(...times) - Math.min(...times)) / DAY_MS;
  if (days <= HOUR_SPAN_DAYS) return "hour";
  if (days <= DAY_SPAN_DAYS) return "day";
  if (days <= MONTH_SPAN_DAYS) return "month";
  return "year";
}

function sameYear(labels: readonly string[]): boolean {
  const years = new Set(labels.map((label) => label.slice(0, 4)));
  return years.size <= 1;
}

function options(unit: TimeAxisUnit, oneYear: boolean): Intl.DateTimeFormatOptions {
  switch (unit) {
    case "hour":
      return { hour: "numeric", minute: "2-digit" };
    case "day":
      return { month: "short", day: "numeric" };
    case "month":
      return oneYear ? { month: "short" } : { month: "short", year: "numeric" };
    default:
      return { year: "numeric" };
  }
}

export interface TimeAxisEnvironment {
  readonly locale: string;
  readonly timeZone: string;
}

/** Builds the `Intl` formatters once; recharts calls the formatter per tick on every resize. */
export function timeTickFormatter(
  labels: readonly string[],
  environment: TimeAxisEnvironment,
): (label: string) => string {
  const unit = timeAxisUnit(labels);
  const shape = options(unit, sameYear(labels));
  const calendar = new Intl.DateTimeFormat(environment.locale, { ...shape, timeZone: "UTC" });
  const clock = new Intl.DateTimeFormat(environment.locale, { ...shape, timeZone: environment.timeZone });

  return (label: string) => {
    const time = instant(label);
    if (!Number.isFinite(time)) return label;
    return (isIsoDate(label) ? calendar : clock).format(new Date(time));
  };
}
