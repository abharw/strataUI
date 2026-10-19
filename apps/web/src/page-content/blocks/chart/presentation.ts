/**
 * Device default when `presentation` is null: a time axis draws a line (area when stacked); a
 * category axis draws bars, horizontal for one series with labels over 12 characters.
 */
export type ChartPresentation = "line" | "bar" | "area" | "bar-horizontal";
export type ChartStack = "none" | "stacked" | "percent";

export interface ChartSeries {
  readonly name: string;
  readonly values: readonly number[];
}

export interface ChartShape {
  readonly presentation?: ChartPresentation | null;
  readonly labels: readonly string[];
  readonly series: readonly ChartSeries[];
  readonly x?: { readonly kind: "category" | "time" } | null;
  readonly stack?: ChartStack | null;
}

/** Longer category labels do not fit under a vertical bar on a phone, so bars go horizontal. */
export const LONG_LABEL_CHARS = 12;

export function chartPresentation(shape: ChartShape): ChartPresentation {
  if (shape.presentation !== undefined && shape.presentation !== null) return shape.presentation;

  // A stacked time series is an area, since a stacked line hides the sum.
  if (shape.x?.kind === "time") {
    return (shape.stack ?? "none") === "none" ? "line" : "area";
  }

  const longest = shape.labels.reduce((max, label) => Math.max(max, label.length), 0);
  if (shape.series.length === 1 && longest > LONG_LABEL_CHARS) return "bar-horizontal";
  return "bar";
}

/**
 * The stacking actually applied: one series has nothing to stack against. The declared value still
 * reaches `chartPresentation`, so a stacked single series draws as an area.
 */
export function chartStack(seriesCount: number, stack: ChartStack | null | undefined): ChartStack {
  if (seriesCount < 2) return "none";
  return stack ?? "none";
}

/** Several unstacked bars over one label sit side by side; that is "grouped". */
export function barsAreGrouped(shape: ChartShape): boolean {
  const presentation = chartPresentation(shape);
  if (presentation !== "bar" && presentation !== "bar-horizontal") return false;
  return chartStack(shape.series.length, shape.stack) === "none" && shape.series.length > 1;
}
