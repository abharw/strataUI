import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppIcon } from "@/shared/ui/app-icon";
import { cn } from "@/shared/ui/cn";

import { productBackLink, productTextMuted } from "@/shared/ui/styles";

// `ChromeTitle` lives in `chrome-title.tsx` and is not re-exported here, so error boundaries can
// import it without pulling in Phosphor and `next/link`.

/** Capability-preserving previous navigation; callers only choose its density. */
export function ChromeBackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        // Named properties, because `transition-colors` does not cover the opacity press.
        "inline-flex min-h-control min-w-0 max-w-full items-center gap-1 rounded-control px-1.5 py-2 outline-offset-2 transition-[color,background-color,opacity] hover:bg-product-active-subtle hover:text-foreground active:opacity-55",
        productBackLink,
        className,
      )}
    >
      <AppIcon icon={CaretLeftIcon} aria-hidden className="size-4 shrink-0" weight="bold" />
      {/* A long Space name ellipsizes rather than wrapping the crumb row. */}
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}

/** Shared top chrome: navigation on the left, quiet document activity on the right. */
export function ChromeTopRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-1.5 mb-1 flex min-h-control min-w-0 items-center justify-between gap-2">
      {children}
    </div>
  );
}

export function ChromeTopRowStart({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-1 items-center">{children}</div>;
}

/**
 * Crumb row end: metadata, then the 44px trigger. `min-w-0` (not `shrink-0`) lets the writer
 * label truncate so a 40-char label cannot push the trigger off screen at 320px.
 */
export function ChromeTopRowEnd({ children }: { children: ReactNode }) {
  return <div className="ml-auto flex min-w-0 items-center gap-0.5">{children}</div>;
}

export function ChromeTimestamp({
  dateTime,
  title,
  children,
  className,
}: {
  dateTime: string;
  title?: string;
  children: ReactNode;
  /** Only for callers that place something beside it and own the gutter. */
  className?: string;
}) {
  return (
    <time
      dateTime={dateTime}
      title={title}
      className={cn(
        `shrink-0 whitespace-nowrap px-1.5 text-micro font-medium leading-5 tracking-meta ${productTextMuted} tabular-nums`,
        className,
      )}
    >
      {children}
    </time>
  );
}
