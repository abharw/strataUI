"use client";

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/primitives/table";
import { cn } from "@/shared/ui/cn";
import { CollectionEmpty } from "@/page-content/collection-empty";
import { CopyButton } from "@/page-content/copy-button";
import { FormattedValue, useViewerFormatting } from "@/shared/formatting/viewer";
import { ScrollCue, useHorizontalOverflow } from "@/page-content/overflow-cue";
import { surfaceContained, surfaceList, surfaceListRow } from "@/page-content/surface";

type Row = {
  id: string;
  cells: unknown[];
};

/** A number, a `{value, unit}` quantity, or a `{amount, currency}` sum. */
function isNumeric(value: unknown): boolean {
  if (typeof value === "number") return true;
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.amount === "number" || typeof record.value === "number";
}

/**
 * Which columns right-align as figures. The first column is the row label and copyable columns
 * keep their copy control, so both stay left. Exported for tests.
 */
export function numericColumns(
  columns: string[],
  rows: Row[],
  copyable: ReadonlySet<number>,
): boolean[] {
  return columns.map((_, index) => {
    if (index === 0 || copyable.has(index)) return false;
    let seen = false;
    for (const row of rows) {
      const cell = row.cells[index];
      if (cell === undefined || cell === "") continue;
      if (!isNumeric(cell)) return false;
      seen = true;
    }
    return seen;
  });
}

/** Device default: grid up to three columns, records beyond. */
export function defaultTablePresentation(columnCount: number): "grid" | "records" {
  return columnCount <= 3 ? "grid" : "records";
}

/** A cell's rendered content: the copy control for a marked column, else the formatted value. */
function CellContent({
  raw,
  copyable,
  format,
}: {
  raw: unknown;
  copyable: boolean;
  format: (value: unknown) => string;
}) {
  if (raw === undefined) return null;
  const formatted = format(raw);
  if (copyable && formatted !== "") return <CopyButton text={formatted} />;
  return <FormattedValue value={raw} />;
}

/** Responsive, read-only data table backed by the local shadcn primitives. */
function GridTable({
  columns,
  rows,
  highlight_column,
  copyable,
  format,
}: {
  columns: string[];
  rows: Row[];
  highlight_column?: number;
  copyable: ReadonlySet<number>;
  format: (value: unknown) => string;
}) {
  const numeric = numericColumns(columns, rows, copyable);
  // Wide tables scroll inside their card, with shared cues driven by the real scroll position.
  const { ref: scroller, scroll, hintId, describedBy } = useHorizontalOverflow<HTMLDivElement>();

  return (
    <div className={"relative overflow-hidden " + surfaceContained + " text-foreground"}>
      <div
        ref={scroller}
        role="region"
        aria-label="Data table"
        aria-describedby={describedBy}
        tabIndex={0}
        className="relative w-full overflow-x-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <table data-slot="table" className="w-full min-w-max caption-bottom text-ui">
          {/* No sticky header or pinned column: the scroller is horizontal only and the whole
              table scrolls as one. */}
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column, index) => (
                <TableHead
                  key={`${column}-${index}`}
                  scope="col"
                  className={cn(
                    "px-4",
                    numeric[index] && "text-right",
                    highlight_column === index && "bg-muted/50",
                  )}
                >
                  {column}
                  {highlight_column === index ? <span className="sr-only"> (highlighted column)</span> : null}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {columns.map((_, index) => {
                  const raw = row.cells[index];
                  const className = cn(
                    "px-4 py-2 tabular-nums",
                    numeric[index] && "text-right",
                    index === 0 && "font-medium",
                    highlight_column === index && "bg-muted/50 font-medium",
                  );
                  const content = <CellContent raw={raw} copyable={copyable.has(index)} format={format} />;
                  if (index === 0) {
                    return (
                      <th key={index} scope="row" className={className}>
                        {content}
                      </th>
                    );
                  }
                  return (
                    <TableCell key={index} className={className}>
                      {content}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
      <ScrollCue state={scroll} hint="Scroll horizontally for more columns" hintId={hintId} />
    </div>
  );
}

/**
 * The column records are headed by: `key_column` when it resolves, else the first column (often
 * the `""` empty corner of a comparison matrix).
 */
export function recordKeyIndex(columns: string[], keyColumn: string | undefined): number {
  if (keyColumn === undefined) return 0;
  const index = columns.indexOf(keyColumn);
  return index === -1 ? 0 : index;
}

/** Each row as a stacked facts block headed by its key column, for narrow screens. */
function RecordsTable({
  columns,
  rows,
  key_column,
  highlight_column,
  copyable,
  format,
}: {
  columns: string[];
  rows: Row[];
  key_column?: string;
  highlight_column?: number;
  copyable: ReadonlySet<number>;
  format: (value: unknown) => string;
}) {
  const keyIndex = recordKeyIndex(columns, key_column);
  const fieldIndices = columns.map((_, index) => index).filter((index) => index !== keyIndex);

  return (
    <div className="flex min-w-0 flex-col gap-3 text-foreground">
      {rows.map((row) => (
        <div
          key={row.id}
          className={cn(
            "min-w-0 rounded-contained border border-border bg-background p-4",
            highlight_column === keyIndex && "border-foreground/25",
          )}
        >
          <p className="min-w-0 break-words text-ui font-medium leading-5">
            <FormattedValue value={row.cells[keyIndex]} />
            {highlight_column === keyIndex ? <span className="sr-only"> (highlighted)</span> : null}
          </p>
          <dl className={"mt-2 min-w-0 " + surfaceList}>
            {fieldIndices.map((index, position) => (
              <div
                key={index}
                className={cn(
                  "flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2",
                  position < fieldIndices.length - 1 && surfaceListRow,
                  highlight_column === index && "bg-muted/50",
                )}
              >
                <dt className="min-w-0 break-words text-meta leading-5 text-muted-foreground">
                  {columns[index]}
                  {highlight_column === index ? <span className="sr-only"> (highlighted column)</span> : null}
                </dt>
                <dd className="min-w-0 break-words text-right text-ui font-medium leading-5 tabular-nums">
                  <CellContent raw={row.cells[index]} copyable={copyable.has(index)} format={format} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

export function Table({
  columns,
  rows,
  highlight_column,
  copyable_columns,
  key_column,
  presentation,
  empty,
}: {
  columns: string[];
  rows: Row[];
  highlight_column?: number;
  copyable_columns?: number[];
  key_column?: string;
  presentation?: "grid" | "records" | null;
  empty?: string;
}) {
  const { format } = useViewerFormatting();
  if (rows.length === 0) return <CollectionEmpty text={empty ?? ""} />;

  const copyable = new Set(copyable_columns ?? []);
  const resolved = presentation ?? defaultTablePresentation(columns.length);

  return resolved === "records" ? (
    <RecordsTable
      columns={columns}
      rows={rows}
      key_column={key_column}
      highlight_column={highlight_column}
      copyable={copyable}
      format={format.display}
    />
  ) : (
    <GridTable
      columns={columns}
      rows={rows}
      highlight_column={highlight_column}
      copyable={copyable}
      format={format.display}
    />
  );
}
