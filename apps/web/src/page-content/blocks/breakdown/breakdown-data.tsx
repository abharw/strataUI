"use client";

import { useViewerFormatting } from "@/shared/formatting/viewer";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/primitives/table";
import { surfaceContained } from "@/page-content/surface";
import { breakdownPresentation, breakdownTotal, type BreakdownPresentation } from "./presentation";

export type BreakdownDataProps = {
  presentation?: BreakdownPresentation | null;
  parts: Array<{ id: string; label: string; value: number }>;
  unit?: string;
  total_label?: string;
};

/**
 * Accessible data table for `breakdown`, like `chart/chart-data.tsx`: it renders outside the lazy
 * recharts boundary so the numbers survive a slow or failed chunk, and the visual is aria-hidden.
 */
export function BreakdownData({ presentation, parts, unit, total_label }: BreakdownDataProps) {
  const { format } = useViewerFormatting();
  // No parts is the `empty` case, which `./view` renders.
  if (parts.length === 0) return null;

  const kind = breakdownPresentation({ presentation, parts, total_label });
  const total = breakdownTotal(parts);
  const measured = unit === undefined ? "" : ` in ${unit}`;
  const share = (value: number) => (total === 0 ? "" : format.percent(value / total));

  return (
    <section aria-label={`${kind} breakdown${measured}`} className="min-w-0">
      <details className={surfaceContained + " text-foreground"}>
        <summary className="cursor-pointer px-4 py-3 text-supporting font-medium marker:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          View breakdown data
          <span className="sr-only">
            {": "}{parts.length} {parts.length === 1 ? "part" : "parts"} of {format.display(total)}
            {unit === undefined ? "" : ` ${unit}`}.
          </span>
        </summary>
        <div className="border-t border-border">
          <table data-slot="breakdown-data" className="w-full caption-bottom text-ui">
            <caption className="sr-only">{`Breakdown data${measured}`}</caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col" className="px-4">Part</TableHead>
                <TableHead scope="col" className="px-4 text-right">
                  {unit ?? "Value"}
                </TableHead>
                <TableHead scope="col" className="px-4 text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parts.map((part) => (
                <TableRow key={part.id}>
                  <th scope="row" className="px-4 py-2 font-medium">{part.label}</th>
                  <TableCell className="px-4 py-2 text-right tabular-nums">
                    {format.display(part.value)}
                  </TableCell>
                  <TableCell className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {share(part.value)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="hover:bg-transparent">
                <th scope="row" className="px-4 py-2 font-medium">{total_label ?? "Total"}</th>
                <TableCell className="px-4 py-2 text-right font-medium tabular-nums">
                  {format.display(total)}
                </TableCell>
                <TableCell className="px-4 py-2" />
              </TableRow>
            </TableBody>
          </table>
        </div>
      </details>
    </section>
  );
}
