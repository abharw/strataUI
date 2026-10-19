import type { ReactNode } from "react";
import Link from "next/link";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@/shared/ui/primitives/item";
import { Separator } from "@/shared/ui/primitives/separator";
import { formatListTimeTitle } from "@/shared/formatting/list-time";
import { cn } from "@/shared/ui/cn";

import {
  productCollectionContext,
  productCollectionDetails,
  productCollectionPreview,
  productCollectionRow,
  productCollectionSummary,
  productCollectionTitle,
  productHairline,
  productPress,
  productTimestamp,
} from "@/shared/ui/styles";

/** One product-owned inventory row; generated documents never select it. */
export function CollectionRow({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li className="strata-product-inventory-row relative last:[&_[data-row-separator]]:hidden">
      <Item
        className={cn(
          "relative gap-3 py-3.5 transition-colors duration-100 hover:bg-product-active-subtle",
          productCollectionRow,
          productPress,
        )}
      >
        <ItemContent className="min-w-0 gap-1">{children}</ItemContent>
        {action === undefined ? null : (
          <ItemActions className="relative z-10 ml-auto shrink-0 self-center">
            {action}
          </ItemActions>
        )}
      </Item>
      <Separator
        data-row-separator
        className={`pointer-events-none absolute inset-x-0.5 bottom-0 data-horizontal:w-auto ${productHairline}`}
      />
    </li>
  );
}

export function CollectionRowHeading({ children }: { children: ReactNode }) {
  return <ItemTitle className={cn(productCollectionTitle, "gap-2 text-foreground")}>{children}</ItemTitle>;
}

export function CollectionRowLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      data-slot="collection-row-link"
      className="min-w-0 flex-1 truncate outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
    >
      {children}
    </Link>
  );
}

export function CollectionRowState({ children }: { children: ReactNode }) {
  return <span data-slot="page-row-state" className="flex shrink-0 items-center gap-1.5">{children}</span>;
}

export function CollectionRowTime({
  dateTime,
  children,
}: {
  dateTime: string;
  children: ReactNode;
}) {
  return (
    <time dateTime={dateTime} title={formatListTimeTitle(dateTime)} className={productTimestamp}>
      <span className="sr-only">, updated </span>
      {children}
    </time>
  );
}

export function CollectionRowDetails({ children }: { children: ReactNode }) {
  return <div data-slot="collection-row-details" className={productCollectionDetails}>{children}</div>;
}

export function CollectionRowPreview({ children }: { children: ReactNode }) {
  return <div className={productCollectionPreview}>{children}</div>;
}

export function CollectionRowContext({ children }: { children: ReactNode }) {
  return <span className={productCollectionContext}>{children}</span>;
}

export function CollectionRowSeparator() {
  return (
    <>
      <span aria-hidden className="shrink-0 px-1">·</span>
      <span className="sr-only">, </span>
    </>
  );
}

export function CollectionRowSummary({ children }: { children: ReactNode }) {
  return <span className={productCollectionSummary}>{children}</span>;
}
