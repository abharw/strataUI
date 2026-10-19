/**
 * Host-side formatting for JSON Render's `$format` directive. Documents store semantic values; the
 * host supplies locale, timezone and clock. Resolved locally to memoize Intl formatters and to
 * localize relative times with `Intl.RelativeTimeFormat`.
 */
import {
  createDirectiveRegistry,
  defineDirective,
  resolvePropValue,
  type PropResolutionContext,
} from "@json-render/core";
import { formatDirective } from "@json-render/directives";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Past a month a relative label stops locating the fact; a date still does. */
const RELATIVE_LIMIT_MS = 30 * DAY_MS;

/** Intl formatters are costly to construct. Pages use few shapes; the cap guards odd specs. */
const FORMATTER_LIMIT = 64;

function memoized<T>(cache: Map<string, T>, key: string, create: () => T): T {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (cache.size >= FORMATTER_LIMIT) cache.clear();
  const created = create();
  cache.set(key, created);
  return created;
}

const numberFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function numberFormatter(
  locale: string | undefined,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  return memoized(
    numberFormatters,
    `${locale ?? ""} ${JSON.stringify(options)}`,
    () => new Intl.NumberFormat(locale, options),
  );
}

function dateFormatter(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return memoized(
    dateFormatters,
    `${locale ?? ""} ${JSON.stringify(options)}`,
    () => new Intl.DateTimeFormat(locale, options),
  );
}

function relativeFormatter(locale: string | undefined): Intl.RelativeTimeFormat {
  return memoized(
    relativeFormatters,
    locale ?? "",
    () => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
  );
}

/** The largest unit that still holds the whole distance, in the viewer's locale. */
function relativeLabel(
  date: Date,
  locale: string | undefined,
  now: number,
  fallbackOptions: Intl.DateTimeFormatOptions,
): string {
  const offset = date.getTime() - now;
  const distance = Math.abs(offset);
  if (distance >= RELATIVE_LIMIT_MS) return dateFormatter(locale, fallbackOptions).format(date);

  const formatter = relativeFormatter(locale);
  if (distance < MINUTE_MS) return formatter.format(Math.trunc(offset / 1_000), "second");
  if (distance < HOUR_MS) return formatter.format(Math.trunc(offset / MINUTE_MS), "minute");
  if (distance < DAY_MS) return formatter.format(Math.trunc(offset / HOUR_MS), "hour");
  return formatter.format(Math.trunc(offset / DAY_MS), "day");
}

/** Upstream's `$format` request shape, resolved against Strata's cached formatters. */
const strataFormatDirective = defineDirective({
  name: formatDirective.name,
  description: formatDirective.description,
  schema: formatDirective.schema,
  resolve(raw, ctx) {
    const value = resolvePropValue(raw.value, ctx);
    const locale = raw.locale;
    const extra = raw.options ?? {};

    switch (raw.$format) {
      case "date": {
        const date = value instanceof Date ? value : new Date(value as string | number);
        const options = extra as Intl.DateTimeFormatOptions;
        return raw.style === "relative"
          ? relativeLabel(date, locale, raw.now ?? Date.now(), options)
          : dateFormatter(locale, options).format(date);
      }
      case "currency":
        return numberFormatter(locale, {
          style: "currency",
          currency: raw.currency ?? "USD",
          ...(extra as Intl.NumberFormatOptions),
        }).format(value as number);
      case "number":
        return numberFormatter(locale, {
          ...(raw.notation === undefined
            ? {}
            : { notation: raw.notation as Intl.NumberFormatOptions["notation"] }),
          ...(extra as Intl.NumberFormatOptions),
        }).format(value as number);
      case "percent":
        return numberFormatter(locale, {
          style: "percent",
          ...(extra as Intl.NumberFormatOptions),
        }).format(value as number);
      default:
        return value;
    }
  },
});

export const STRATA_DIRECTIVES = [strataFormatDirective];

const FORMAT_CONTEXT: PropResolutionContext = {
  stateModel: Object.freeze({}),
  directives: createDirectiveRegistry(STRATA_DIRECTIVES),
};

export const DEFAULT_FORMAT_LOCALE = "en-US";
export const DEFAULT_FORMAT_TIME_ZONE = "UTC";

export interface FormatEnvironment {
  locale: string;
  timeZone: string;
  /** Unix milliseconds supplied by the host so relative labels share one clock. */
  now: number;
}

export type FormatEnvironmentInput = Partial<Omit<FormatEnvironment, "now">> & {
  now?: number | Date;
};

export function isIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(value);
}

export function isIsoDateTime(value: string): boolean {
  return ISO_DATETIME_RE.test(value);
}

const ISO_YEAR_RE = /^\d{4}$/;
const ISO_YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A partial publication date: a bare year or a year-month. */
export function isPartialIsoDate(value: string): boolean {
  return ISO_YEAR_RE.test(value) || ISO_YEAR_MONTH_RE.test(value);
}

/**
 * "2019" stays "2019"; "2019-06" renders as the locale's short month + year.
 * UTC-pinned like `formatCalendarDate`: a partial date is not an instant.
 */
export function formatPartialIsoDate(value: string, input: FormatEnvironmentInput = {}): string {
  if (ISO_YEAR_RE.test(value)) return value;
  const env = environment(input);
  return dateFormatter(env.locale, { timeZone: "UTC", month: "short", year: "numeric" })
    .format(new Date(`${value}-01T00:00:00Z`));
}

function environment(input: FormatEnvironmentInput = {}): FormatEnvironment {
  const now = input.now instanceof Date ? input.now.getTime() : input.now;
  return {
    locale: input.locale ?? DEFAULT_FORMAT_LOCALE,
    timeZone: input.timeZone ?? DEFAULT_FORMAT_TIME_ZONE,
    now: now !== undefined && Number.isFinite(now) ? now : Date.now(),
  };
}

function resolveFormat(value: Record<string, unknown>): string {
  const resolved = resolvePropValue(value, FORMAT_CONTEXT);
  if (typeof resolved === "string") return resolved;
  if (typeof resolved === "number" || typeof resolved === "boolean") return String(resolved);
  // An unresolved directive renders empty rather than "[object Object]".
  return "";
}

function formatCalendarDate(
  iso: string,
  env: FormatEnvironment,
  weekday: boolean,
): string {
  return resolveFormat({
    $format: "date",
    value: iso,
    locale: env.locale,
    options: {
      // A calendar date is not an instant; UTC keeps Sep 14 from rendering as Sep 13 in the west.
      timeZone: "UTC",
      ...(weekday ? { weekday: "short" } : {}),
      month: "short",
      day: "numeric",
      // Without a year, a loop open since last January reads as this January.
      ...(!/^\d{4}/.test(iso) || parseInt(iso.slice(0, 4), 10) === new Date(env.now).getUTCFullYear()
        ? {}
        : { year: "numeric" }),
    },
  });
}

/** Format an exact instant as a date in the timezone supplied by the host. */
export function formatAbsoluteDate(
  iso: string,
  input: FormatEnvironmentInput = {},
): string {
  const env = environment(input);
  return resolveFormat({
    $format: "date",
    value: iso,
    locale: env.locale,
    options: {
      timeZone: env.timeZone,
      dateStyle: "medium",
    },
  });
}

/** Format an exact instant with date and time in the host-supplied timezone. */
export function formatAbsoluteDateTime(
  iso: string,
  input: FormatEnvironmentInput = {},
): string {
  const env = environment(input);
  return resolveFormat({
    $format: "date",
    value: iso,
    locale: env.locale,
    options: {
      timeZone: env.timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    },
  });
}

/** Format a ratio (`0.75` → `75%`) through JSON Render's directive. */
export function formatPercent(
  ratio: number,
  input: FormatEnvironmentInput = {},
): string {
  if (!Number.isFinite(ratio)) return String(ratio);
  const env = environment(input);
  return resolveFormat({
    $format: "percent",
    value: ratio,
    locale: env.locale,
    options: { maximumFractionDigits: 0 },
  });
}

/** Format a canonical display value for the reader. */
export function formatDisplayValue(
  value: unknown,
  input: FormatEnvironmentInput = {},
): string {
  if (value === null || value === undefined) return "";

  const env = environment(input);

  if (typeof value === "boolean") return String(value);

  if (typeof value === "number") {
    return resolveFormat({
      $format: "number",
      value,
      locale: env.locale,
    });
  }

  if (typeof value === "string") {
    if (isIsoDate(value)) return formatCalendarDate(value, env, true);
    if (isIsoDateTime(value)) {
      return resolveFormat({
        $format: "date",
        value,
        style: "relative",
        locale: env.locale,
        now: env.now,
        // Past the relative window the label falls back to this exact date.
        options: { timeZone: env.timeZone, dateStyle: "medium" },
      });
    }
    return value;
  }

  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (
      typeof object.value === "number" &&
      ("unit" in object || Object.keys(object).length === 1)
    ) {
      const number = resolveFormat({
        $format: "number",
        value: object.value,
        locale: env.locale,
      });
      return typeof object.unit === "string" ? `${number} ${object.unit}` : number;
    }
    if (typeof object.amount === "number" && typeof object.currency === "string") {
      const whole = Number.isInteger(object.amount);
      return resolveFormat({
        $format: "currency",
        value: object.amount,
        locale: env.locale,
        currency: object.currency,
        options: {
          maximumFractionDigits: whole ? 0 : 2,
          minimumFractionDigits: whole ? 0 : undefined,
        },
      });
    }
  }

  // Unsupported shapes (arrays, nested objects) render empty.
  return "";
}

/** Pull a bare number out of a NumericValue for arithmetic (progress). */
export function numericAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (typeof object.value === "number" && Number.isFinite(object.value)) return object.value;
    if (typeof object.amount === "number" && Number.isFinite(object.amount)) return object.amount;
  }
  return null;
}
