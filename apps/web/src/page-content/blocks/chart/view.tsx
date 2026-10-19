"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
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
import { surfaceContained, surfaceCardPad } from "@/page-content/surface";
import type { ChartDataProps } from "./chart-data";
import { chartPresentation, chartStack, type ChartStack } from "./presentation";
import { seriesDash } from "./series";
import { timeTickFormatter } from "./time-axis";

type ChartProps = ChartDataProps & {
  y_min?: number;
  y_max?: number;
  x?: { kind: "category" | "time" } | null;
  stack?: ChartStack | null;
  show_values?: boolean;
  empty?: string;
};

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/** One stack id: `stacked` and `percent` both mean "these sum to the whole". */
const STACK_ID = "series";

/** Above this many points, per-point dots are dropped. */
const DOTTED_TO = 12;

function dataKey(index: number): string {
  return `series_${index}`;
}

function seriesColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

function domain(minimum?: number, maximum?: number): [number | "auto", number | "auto"] {
  return [minimum ?? "auto", maximum ?? "auto"];
}

export function Chart({
  presentation,
  labels,
  series,
  y_label,
  y_min,
  y_max,
  x,
  stack,
  show_values,
  empty,
}: ChartProps) {
  const { format, state } = useViewerFormatting();
  // Gradient ids are document-global, so make them unique per chart. Non-alphanumerics are
  // stripped because some SVG `url(#…)` parsers reject colons.
  const gradient = useId().replaceAll(/[^a-zA-Z0-9_-]/g, "");

  if (labels.length === 0 || series.length === 0) {
    return empty === undefined ? null : <CollectionEmpty text={empty} />;
  }

  const kind = chartPresentation({ presentation, labels, series, x, stack });
  const stacking = chartStack(series.length, stack);
  const horizontal = kind === "bar-horizontal";
  const bars = kind === "bar" || horizontal;
  const percent = stacking === "percent";

  const data = labels.map((label, labelIndex) => {
    const point: Record<string, string | number> = { label };
    series.forEach((item, seriesIndex) => {
      const value = item.values[labelIndex];
      if (value !== undefined) point[dataKey(seriesIndex)] = value;
    });
    return point;
  });
  const config = Object.fromEntries(
    series.map((item, index) => [dataKey(index), { label: item.name }]),
  ) satisfies ChartConfig;
  const showLegend = series.length > 1;
  const stackId = stacking === "none" ? undefined : STACK_ID;
  // Recharts' expand offset normalizes to 0..1, so percent is only a tick format; the tooltip and
  // table keep the measured values.
  const stackOffset = percent ? ("expand" as const) : undefined;

  // Bars anchor at zero but floor at the lowest value so negatives still plot. `y_min` is ignored
  // because bar length encodes value.
  const barFloor = Math.min(0, ...series.flatMap((item) => item.values));
  const valueDomain: [number | "auto", number | "auto"] = percent
    ? [0, 1]
    : domain(bars ? barFloor : y_min, y_max);
  const formatValue = (value: number) => (percent ? format.percent(value) : format.display(value));

  const tickFormatter = x?.kind === "time" ? timeTickFormatter(labels, state) : undefined;

  const categoryAxis = (
    <XAxis
      dataKey="label"
      tickLine={false}
      axisLine={false}
      tickMargin={10}
      minTickGap={24}
      tickFormatter={tickFormatter}
    />
  );
  const valueAxis = (
    <YAxis
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      width={percent ? 44 : 38}
      domain={valueDomain}
      tickFormatter={formatValue}
    />
  );
  const horizontalAxes = (
    <>
      <XAxis type="number" domain={valueDomain} tickLine={false} axisLine={false} tickMargin={8} tickFormatter={formatValue} />
      <YAxis
        type="category"
        dataKey="label"
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        width={104}
        tickFormatter={tickFormatter}
      />
    </>
  );

  const shared = (
    <>
      <CartesianGrid vertical={horizontal} horizontal={!horizontal} />
      {horizontal ? horizontalAxes : (
        <>
          {categoryAxis}
          {valueAxis}
        </>
      )}
      <ChartTooltip
        cursor={false}
        content={<ChartTooltipContent indicator="dot" valueFormatter={format.display} />}
      />
      {showLegend ? <ChartLegend content={<ChartLegendContent />} /> : null}
    </>
  );

  const values = (index: number, position: "top" | "right" | "center") =>
    show_values === true ? (
      <LabelList
        dataKey={dataKey(index)}
        position={position}
        offset={position === "center" ? 0 : 8}
        className="fill-foreground text-micro"
        formatter={(value: unknown) => format.display(value)}
      />
    ) : null;

  return (
    <figure
      className={surfaceContained + " " + surfaceCardPad + " text-foreground"}
      aria-hidden
    >
      {y_label === undefined ? null : (
        <figcaption className="mb-4 text-supporting font-medium text-muted-foreground">{y_label}</figcaption>
      )}
      <ChartContainer config={config} className="h-60 w-full aspect-auto">
        {bars ? (
          <BarChart
            data={data}
            accessibilityLayer
            layout={horizontal ? "vertical" : "horizontal"}
            stackOffset={stackOffset}
            margin={{ left: 0, right: horizontal ? 24 : 6 }}
          >
            {shared}
            {series.map((item, index) => (
              <Bar
                key={item.name}
                dataKey={dataKey(index)}
                stackId={stackId}
                fill={seriesColor(index)}
                radius={horizontal ? [2, 6, 6, 2] : [6, 6, 2, 2]}
              >
                {values(index, horizontal ? "right" : stackId === undefined ? "top" : "center")}
              </Bar>
            ))}
          </BarChart>
        ) : kind === "area" ? (
          <AreaChart data={data} accessibilityLayer stackOffset={stackOffset} margin={{ left: 0, right: 6 }}>
            <defs>
              {series.map((item, index) => (
                <linearGradient key={item.name} id={`${gradient}-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={seriesColor(index)} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={seriesColor(index)} stopOpacity={0.1} />
                </linearGradient>
              ))}
            </defs>
            {shared}
            {series.map((item, index) => (
              <Area
                key={item.name}
                type="monotone"
                dataKey={dataKey(index)}
                stackId={stackId}
                stroke={seriesColor(index)}
                strokeDasharray={seriesDash(index, series.length)}
                fill={`url(#${gradient}-${index})`}
                fillOpacity={0.4}
                strokeWidth={2.25}
              >
                {values(index, "top")}
              </Area>
            ))}
          </AreaChart>
        ) : (
          <LineChart data={data} accessibilityLayer margin={{ left: 0, right: 6 }}>
            {shared}
            {series.map((item, index) => (
              <Line
                key={item.name}
                type="monotone"
                dataKey={dataKey(index)}
                stroke={seriesColor(index)}
                strokeWidth={2.5}
                strokeDasharray={seriesDash(index, series.length)}
                // A dot per point while countable, a bare line beyond `DOTTED_TO`.
                dot={labels.length <= DOTTED_TO ? { r: 3 } : false}
                activeDot={{ r: 4 }}
              >
                {values(index, "top")}
              </Line>
            ))}
          </LineChart>
        )}
      </ChartContainer>
    </figure>
  );
}
