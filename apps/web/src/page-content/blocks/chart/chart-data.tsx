"use client";

import { useViewerFormatting } from "@/shared/formatting/viewer";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/primitives/table";
import { ScrollCue, useHorizontalOverflow } from "@/page-content/overflow-cue";
import { surfaceContained } from "@/page-content/surface";
import type { ChartPresentation } from "./presentation";

export type ChartDataProps = {
  presentation?: ChartPresentation | null;
  labels: string[];
  series: Array<{ name: string; values: number[] }>;
  y_label?: string;
};

/**
 * Accessible data table for `chart`. It renders outside the deferred recharts chunk and its error
 * boundary, so the data survives a slow or failed load; the visual chart is aria-hidden.
 */
export function ChartData({ presentation, labels, series, y_label }: ChartDataProps) {
  const { format } = useViewerFormatting();
  // Wide series overflow on a phone, so use the same measured scroll cue as the table.
  const { ref: scroller, scroll, hintId, describedBy } = useHorizontalOverflow<HTMLDivElement>();
  const label = `${presentation ?? "line"} chart${y_label === undefined ? "" : ` of ${y_label}`}`;
  // No data is the `empty` case, which `./view` renders.
  if (labels.length === 0 || series.length === 0) return null;
  return (
    <section aria-label={label} className="min-w-0">
      <details className={surfaceContained + " text-foreground"}>
        <summary className="cursor-pointer px-4 py-3 text-supporting font-medium marker:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          View chart data
          <span className="sr-only">
            {": "}{series.length} series across {labels.length} {labels.length === 1 ? "label" : "labels"}.
          </span>
        </summary>
        <div className="relative border-t border-border">
          <div
            ref={scroller}
            role="region"
            aria-label="Chart data"
            aria-describedby={describedBy}
            tabIndex={0}
            className="overflow-x-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <table data-slot="chart-data" className="w-full min-w-max caption-bottom text-ui">
              <caption className="sr-only">{y_label === undefined ? "Chart data" : `Chart data in ${y_label}`}</caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col" className="px-4">Label</TableHead>
                  {series.map((item) => (
                    <TableHead key={item.name} scope="col" className="px-4 text-right">
                      {item.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {labels.map((label, index) => (
                  <TableRow key={`${label}-${index}`}>
                    <th scope="row" className="px-4 py-2 font-medium tabular-nums">{label}</th>
                    {series.map((item) => (
                      <TableCell key={item.name} className="px-4 py-2 text-right tabular-nums">
                        {format.display(item.values[index] ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
          <ScrollCue state={scroll} hint="Scroll horizontally for more columns" hintId={hintId} />
        </div>
      </details>
    </section>
  );
}
