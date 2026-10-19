"use client";

import { CollectionEmpty } from "@/page-content/collection-empty";
import { CopyButton } from "@/page-content/copy-button";
import { FormattedValue, useViewerFormatting } from "@/shared/formatting/viewer";
import { surfaceList, surfaceListRow } from "@/page-content/surface";

type Fact = {
  id: string;
  label: string;
  value: unknown;
  copyable?: boolean;
};

const STACKED_VALUE_THRESHOLD = 40;

/**
 * Device default when `presentation` is null: stacked if any value exceeds the threshold, else
 * inline. Measured on the formatted text, since that is what has to fit.
 */
export function defaultFactsPresentation(
  items: readonly Fact[],
  display: (value: unknown) => string,
): "stacked" | "inline" {
  return items.some((item) => display(item.value).length > STACKED_VALUE_THRESHOLD) ? "stacked" : "inline";
}

/** The value, with tap-to-copy when `copyable`, else plain formatted text. */
function FactValue({
  value,
  copyable,
  label,
  formatted,
}: {
  value: unknown;
  copyable: boolean | undefined;
  label: string;
  formatted: string;
}) {
  if (copyable === true) return <CopyButton text={formatted} label={`Copy ${label}`} />;
  return <FormattedValue value={value} />;
}

function InlineFacts({ items, display }: { items: readonly Fact[]; display: (value: unknown) => string }) {
  return (
    <dl className={"min-w-0 " + surfaceList + " font-inherit text-foreground"}>
      {items.map((item, index) => (
        <div
          key={item.id}
          // Label and value as two proportional flex tracks (grid columns belong to
          // `collection.tsx`). `@max-[220px]/card:` stacks the row in a narrow card so
          // short labels like "Check-in" do not break mid-word.
          className={`flex min-h-14 min-w-0 items-center gap-3 py-3 @max-[220px]/card:flex-col @max-[220px]/card:items-start @max-[220px]/card:gap-1 ${
            index < items.length - 1 ? surfaceListRow : ""
          }`}
        >
          <dt className="min-w-0 flex-[0.85] break-words text-ui font-medium leading-5 text-foreground @max-[220px]/card:flex-none @max-[220px]/card:w-full">{item.label}</dt>
          <dd className="min-w-0 flex-[1.15] break-words text-right text-supporting font-normal leading-5 text-foreground tabular-nums [&_button]:min-w-0 [&_button]:max-w-full [&_button]:justify-end [&_button_span]:break-all @max-[220px]/card:w-full @max-[220px]/card:flex-none @max-[220px]/card:text-left @max-[220px]/card:[&_button]:justify-start">
            <FactValue value={item.value} copyable={item.copyable} label={item.label} formatted={display(item.value)} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function StackedFacts({ items, display }: { items: readonly Fact[]; display: (value: unknown) => string }) {
  return (
    <dl className={"min-w-0 " + surfaceList + " font-inherit text-foreground"}>
      {items.map((item, index) => (
        <div key={item.id} className={`min-w-0 py-3 ${index < items.length - 1 ? surfaceListRow : ""}`}>
          <dt className="min-w-0 break-words text-ui font-medium leading-5 text-foreground">{item.label}</dt>
          <dd className="mt-1 min-w-0 break-words text-ui font-normal leading-5 text-foreground tabular-nums [&_button]:min-w-0 [&_button]:max-w-full [&_button]:justify-start [&_button_span]:break-all">
            <FactValue value={item.value} copyable={item.copyable} label={item.label} formatted={display(item.value)} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Facts({
  items,
  presentation,
  empty,
}: {
  items: Fact[];
  presentation?: "stacked" | "inline" | null;
  empty?: string;
}) {
  const { format } = useViewerFormatting();
  if (items.length === 0) return <CollectionEmpty text={empty ?? ""} />;

  const resolved = presentation ?? defaultFactsPresentation(items, format.display);
  return resolved === "stacked"
    ? <StackedFacts items={items} display={format.display} />
    : <InlineFacts items={items} display={format.display} />;
}
