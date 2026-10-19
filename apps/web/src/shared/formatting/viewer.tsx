"use client";

import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_FORMAT_LOCALE,
  DEFAULT_FORMAT_TIME_ZONE,
  formatAbsoluteDateTime,
  formatDisplayValue,
  formatPercent,
  isIsoDate,
  isIsoDateTime,
  type FormatEnvironment,
} from "./display";

export interface ViewerFormatting {
  state: FormatEnvironment;
  format: {
    display: (value: unknown) => string;
    absoluteDateTime: (iso: string) => string;
    percent: (ratio: number) => string;
  };
}

const ViewerFormattingContext = createContext<ViewerFormatting | null>(null);

function serverEnvironment(serverNow: string): FormatEnvironment {
  const now = Date.parse(serverNow);
  if (!Number.isFinite(now)) {
    throw new Error("ViewerFormattingProvider requires an ISO serverNow value");
  }
  return {
    locale: DEFAULT_FORMAT_LOCALE,
    timeZone: DEFAULT_FORMAT_TIME_ZONE,
    now,
  };
}

function browserEnvironment(): FormatEnvironment {
  const locale = navigator.languages.find((candidate) => candidate.length > 0)
    ?? navigator.language
    ?? DEFAULT_FORMAT_LOCALE;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    || DEFAULT_FORMAT_TIME_ZONE;
  return { locale, timeZone, now: Date.now() };
}

function FormattingValueProvider({
  children,
  environment,
}: {
  children: ReactNode;
  environment: FormatEnvironment;
}) {
  const value = useMemo<ViewerFormatting>(() => ({
    state: environment,
    format: {
      display: (input) => formatDisplayValue(input, environment),
      absoluteDateTime: (iso) => formatAbsoluteDateTime(iso, environment),
      percent: (ratio) => formatPercent(ratio, environment),
    },
  }), [environment]);

  return (
    <ViewerFormattingContext value={value}>
      {children}
    </ViewerFormattingContext>
  );
}

function BrowserFormattingProvider({
  children,
  serverNow,
}: {
  children: ReactNode;
  serverNow: string;
}) {
  const initial = useMemo(() => serverEnvironment(serverNow), [serverNow]);
  const [environment, setEnvironment] = useState(initial);

  useEffect(() => {
    // Every catalog component reads this context, so keep the value unless something changed.
    const refresh = () => setEnvironment((current) => {
      const next = browserEnvironment();
      return current.locale === next.locale
        && current.timeZone === next.timeZone
        && Math.floor(current.now / 60_000) === Math.floor(next.now / 60_000)
        ? current
        : next;
    });
    const refreshWhenVisible = () => {
      // Paused while hidden; resyncs on return.
      if (!document.hidden) refresh();
    };

    refresh();
    const timer = window.setInterval(refreshWhenVisible, 60_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return (
    <FormattingValueProvider environment={environment}>
      {children}
    </FormattingValueProvider>
  );
}

/**
 * Provides locale, timezone and clock. The server value keeps hydration deterministic; the browser
 * then supplies its own and refreshes relative labels each minute.
 */
export function ViewerFormattingProvider({
  children,
  serverNow,
}: {
  children: ReactNode;
  serverNow: string;
}) {
  const inherited = use(ViewerFormattingContext);
  if (inherited !== null) return children;
  return (
    <BrowserFormattingProvider serverNow={serverNow}>
      {children}
    </BrowserFormattingProvider>
  );
}

/** Deterministic injection point for tests and non-browser render targets. */
export function FixedViewerFormattingProvider({
  children,
  environment,
}: {
  children: ReactNode;
  environment: FormatEnvironment;
}) {
  return (
    <FormattingValueProvider environment={environment}>
      {children}
    </FormattingValueProvider>
  );
}

export function useViewerFormatting(): ViewerFormatting {
  const value = use(ViewerFormattingContext);
  if (value === null) {
    throw new Error("Formatted page content must be inside ViewerFormattingProvider");
  }
  return value;
}

/** A semantic display value; datetimes stay relative but expose local exact time. */
export function FormattedValue({ value }: { value: unknown }) {
  const { format } = useViewerFormatting();
  const text = format.display(value);

  if (typeof value === "string" && isIsoDateTime(value)) {
    return (
      <time dateTime={value} title={format.absoluteDateTime(value)}>
        {text}
      </time>
    );
  }
  if (typeof value === "string" && isIsoDate(value)) {
    return <time dateTime={value}>{text}</time>;
  }
  return text;
}

/** An exact instant rendered in the viewer's locale and timezone. */
export function LocalDateTime({ value }: { value: string }) {
  const { format } = useViewerFormatting();
  return <time dateTime={value}>{format.absoluteDateTime(value)}</time>;
}
