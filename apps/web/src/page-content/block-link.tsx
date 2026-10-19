import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppIcon } from "@/shared/ui/app-icon";
import { NewContextHint } from "@/page-content/external-link";

/**
 * A `link` after `hydratePageLinks` resolved it for this reader. A `{ page }` without `href` is
 * not visible to the reader and renders as plain content.
 */
export interface HydratedLink {
  readonly page?: string;
  readonly url?: string;
  readonly href?: string;
}

/**
 * Wraps a card, row or event in its link: a client `Link` for a resolved page, a new tab for a
 * URL, or an inert wrapper. `className` applies in every case so the surface keeps its box.
 * Pass `children` as a function to place the external icon inside your own trailing group.
 */
export function BlockLink({
  link,
  className,
  children,
}: {
  link: HydratedLink | undefined;
  className?: string;
  children: ReactNode | ((slot: { external: boolean }) => ReactNode);
}) {
  const resolve = (external: boolean): ReactNode =>
    typeof children === "function" ? children({ external }) : children;

  if (link === undefined) return <div className={className}>{resolve(false)}</div>;

  if (link.url !== undefined) {
    return (
      <a href={link.url} rel="noopener noreferrer" target="_blank" className={className}>
        {typeof children === "function" ? (
          resolve(true)
        ) : (
          <>
            {children}
            <NewContextHint />
            <AppIcon icon={ArrowSquareOutIcon} data-icon="inline-end" aria-hidden="true" />
          </>
        )}
      </a>
    );
  }

  if (link.href !== undefined) {
    return (
      <Link href={link.href} className={className}>
        {resolve(false)}
      </Link>
    );
  }

  return <div className={className} data-page-id={link.page}>{resolve(false)}</div>;
}
