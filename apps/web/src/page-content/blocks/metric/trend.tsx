"use client";

import { useViewerFormatting } from "@/shared/formatting/viewer";

const SPARKLINE_WIDTH = 56;
const SPARKLINE_HEIGHT = 20;

/** Points for a polyline through `values`, normalized into the sparkline's own box. */
function sparklinePoints(values: readonly number[]): string {
  if (values.length === 1) {
    const y = SPARKLINE_HEIGHT / 2;
    return `0,${y} ${SPARKLINE_WIDTH},${y}`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * SPARKLINE_WIDTH;
      const y = span === 0 ? SPARKLINE_HEIGHT / 2 : SPARKLINE_HEIGHT - ((value - min) / span) * SPARKLINE_HEIGHT;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

/**
 * Sparkline beside a metric's value. The polyline is aria-hidden; the exact values are disclosed
 * in a collapsed list, the single-series counterpart of `chart-data.tsx`.
 */
export function MetricTrend({ label, values }: { label: string; values: readonly number[] }) {
  const { format } = useViewerFormatting();

  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-1">
      <svg
        viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
        width={SPARKLINE_WIDTH}
        height={SPARKLINE_HEIGHT}
        aria-hidden="true"
        className="text-muted-foreground"
      >
        <polyline
          points={sparklinePoints(values)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <details className="text-right">
        <summary className="cursor-pointer text-micro text-muted-foreground marker:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          Trend
          <span className="sr-only">{` for ${label}, ${values.length} ${values.length === 1 ? "point" : "points"}`}</span>
        </summary>
        <ol className="mt-1 min-w-20 text-micro tabular-nums text-muted-foreground">
          {values.map((value, index) => (
            <li key={index}>{format.display(value)}</li>
          ))}
        </ol>
      </details>
    </span>
  );
}
