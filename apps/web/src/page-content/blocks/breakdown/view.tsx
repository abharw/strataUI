"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  Label,
  LabelList,
  Pie,
  PieChart,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/ui/primitives/chart";
import { useViewerFormatting } from "@/shared/formatting/viewer";
import { CollectionEmpty } from "@/page-content/collection-empty";
import { surfaceCardPad, surfaceContained } from "@/page-content/surface";
import { breakdownPresentation, breakdownTotal, type BreakdownPresentation } from "./presentation";

type Part = { id: string; label: string; value: number };

type BreakdownProps = {
  presentation?: BreakdownPresentation | null;
  parts: Part[];
  unit?: string;
  total_label?: string;
  empty?: string;
};

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

function partColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/** A radial stack is one row with one column per part, so each part is a key. */
function radialKey(index: number): string {
  return `part_${index}`;
}

/**
 * Centre label for a donut or radial stack: the total and its label, drawn as `tspan`s on the
 * sector's viewBox so it stays centred through resizes.
 */
function centreTotal({ total, label }: { total: string; label: string }) {
  return function render({ viewBox }: { viewBox?: unknown }) {
    if (viewBox === null || typeof viewBox !== "object" || !("cx" in viewBox)) return null;
    const { cx, cy } = viewBox as { cx?: number; cy?: number };
    if (cx === undefined || cy === undefined) return null;
    return (
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
        <tspan x={cx} y={cy - 6} className="fill-foreground text-heading font-medium tabular-nums">
          {total}
        </tspan>
        <tspan x={cx} y={cy + 16} className="fill-muted-foreground text-micro">
          {label}
        </tspan>
      </text>
    );
  };
}

export function Breakdown({ presentation, parts, unit, total_label, empty }: BreakdownProps) {
  const { format } = useViewerFormatting();

  if (parts.length === 0) {
    return empty === undefined ? null : <CollectionEmpty text={empty} />;
  }

  const kind = breakdownPresentation({ presentation, parts, total_label });
  const total = breakdownTotal(parts);
  const totalText = unit === undefined ? format.display(total) : `${format.display(total)} ${unit}`;
  const formatValue = (value: unknown) =>
    unit === undefined ? format.display(value) : `${format.display(value)} ${unit}`;

  // Each row carries its own `fill`; recharts reads it per datum for Pie sectors and Bar rects.
  const rows = parts.map((part, index) => ({
    ...part,
    fill: partColor(index),
  }));
  // Keyed by label so tooltip and legend resolve sectors via `nameKey="label"`.
  const byLabel = Object.fromEntries(
    parts.map((part) => [part.label, { label: part.label }]),
  ) satisfies ChartConfig;
  const byKey = Object.fromEntries(
    parts.map((part, index) => [radialKey(index), { label: part.label }]),
  ) satisfies ChartConfig;

  const tooltip = (
    <ChartTooltip
      cursor={false}
      content={<ChartTooltipContent hideLabel nameKey="label" valueFormatter={formatValue} />}
    />
  );

  if (kind === "bars") {
    return (
      <Frame>
        <ChartContainer config={byLabel} className="h-60 w-full aspect-auto">
          <BarChart data={rows} accessibilityLayer layout="vertical" margin={{ left: 0, right: 32 }}>
            <XAxis type="number" dataKey="value" hide />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={104}
            />
            {tooltip}
            <Bar dataKey="value" radius={[2, 6, 6, 2]}>
              <LabelList
                dataKey="value"
                position="right"
                offset={8}
                className="fill-foreground text-micro"
                formatter={formatValue}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </Frame>
    );
  }

  if (kind === "radial") {
    const stacked = [Object.fromEntries(parts.map((part, index) => [radialKey(index), part.value]))];
    return (
      <Frame>
        <ChartContainer config={byKey} className="mx-auto aspect-square w-full max-h-64">
          <RadialBarChart data={stacked} startAngle={90} endAngle={-270} innerRadius={54} outerRadius={110}>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel valueFormatter={formatValue} />}
            />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              {total_label === undefined ? null : (
                <Label content={centreTotal({ total: totalText, label: total_label })} />
              )}
            </PolarRadiusAxis>
            {parts.map((part, index) => (
              <RadialBar
                key={part.id}
                dataKey={radialKey(index)}
                stackId="parts"
                fill={partColor(index)}
                cornerRadius={4}
                className="stroke-background stroke-2"
              />
            ))}
            <ChartLegend content={<ChartLegendContent />} />
          </RadialBarChart>
        </ChartContainer>
      </Frame>
    );
  }

  const donut = kind === "donut";
  return (
    <Frame>
      <ChartContainer config={byLabel} className="mx-auto aspect-square w-full max-h-64">
        <PieChart>
          {tooltip}
          <Pie
            data={rows}
            dataKey="value"
            nameKey="label"
            innerRadius={donut ? 56 : 0}
            strokeWidth={donut ? 5 : 1}
            stroke="var(--background)"
          >
            {donut && total_label !== undefined ? (
              <Label content={centreTotal({ total: totalText, label: total_label })} />
            ) : null}
          </Pie>
          <ChartLegend content={<ChartLegendContent nameKey="label" />} />
        </PieChart>
      </ChartContainer>
    </Frame>
  );
}

/** The chart's contained surface, aria-hidden because `./breakdown-data` is the readable copy. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <figure className={surfaceContained + " " + surfaceCardPad + " text-foreground"} aria-hidden>
      {children}
    </figure>
  );
}
