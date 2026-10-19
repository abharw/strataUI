/**
 * List timestamps without the JSON Render formatting stack. Recent values are elapsed durations;
 * older ones are calendar dates. Defaults to UTC/en-US so server renders are deterministic.
 */

export interface ViewerZone {
  locale: string;
  timeZone: string;
}

const SERVER_ZONE: ViewerZone = { locale: "en-US", timeZone: "UTC" };

// Intl formatters are costly to construct and Home formats one per row.
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(zone: ViewerZone, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${zone.locale}|${zone.timeZone}|${JSON.stringify(options)}`;
  const held = dayFormatters.get(key);
  if (held !== undefined) return held;
  const created = new Intl.DateTimeFormat(zone.locale, { timeZone: zone.timeZone, ...options });
  dayFormatters.set(key, created);
  return created;
}

export function formatListTime(
  iso: string,
  now: Date = new Date(),
  zone: ViewerZone = SERVER_ZONE,
): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const absMs = Math.abs(now.getTime() - then.getTime());
  if (absMs < 60_000) return "now";

  const minutes = Math.floor(absMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(absMs / 3_600_000);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(absMs / 86_400_000);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  return dayFormatter(zone, {
    month: "short",
    day: "numeric",
    ...(sameYear(then, now, zone) ? {} : { year: "numeric" }),
  }).format(then);
}

function sameYear(then: Date, now: Date, zone: ViewerZone): boolean {
  const year = dayFormatter(zone, { year: "numeric" });
  return year.format(then) === year.format(now);
}

/** A short calendar day in the reader's zone and locale: `Jul 2`. */
export function formatShortDay(iso: string, zone: ViewerZone = SERVER_ZONE): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return dayFormatter(zone, { month: "short", day: "numeric" }).format(at);
}

/**
 * The reader's calendar day as `YYYY-MM-DD`, for grouping only. Built from parts so it is
 * locale-independent, and computed in the reader's timezone rather than UTC.
 */
export function calendarDay(iso: string, zone: ViewerZone = SERVER_ZONE): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const parts = dayFormatter(
    { locale: "en-US", timeZone: zone.timeZone },
    { year: "numeric", month: "2-digit", day: "2-digit" },
  ).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** A full calendar day in the reader's zone and language: `August 29, 2026`. */
export function formatLongDay(iso: string, zone: ViewerZone = SERVER_ZONE): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return dayFormatter(zone, { month: "long", day: "numeric", year: "numeric" }).format(at);
}

/** Deterministic exact instant for the native title tooltip on list chrome. */
export function formatListTimeTitle(iso: string, zone?: ViewerZone): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const resolved = zone ?? SERVER_ZONE;
  const stamp = dayFormatter(resolved, { dateStyle: "medium", timeStyle: "short" }).format(then);
  return zone === undefined ? `${stamp} UTC` : stamp;
}
