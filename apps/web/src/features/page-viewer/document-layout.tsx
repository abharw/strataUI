import type { ReactNode } from "react";
import Link from "next/link";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { CaretUpIcon } from "@phosphor-icons/react/dist/ssr/CaretUp";

import { AppIcon } from "@/shared/ui/app-icon";
// Type-only import, so this file stays server-safe.
import type { AssembledSequence, SequenceLink } from "@/server/pages/read/assemble";
import { NewContextHint } from "@/page-content/external-link";

import { ChromeTitle } from "@/features/navigation/chrome-title";
import { ChromeBackLink } from "@/features/navigation/layout";
import { productTextMuted } from "@/shared/ui/styles";

export {
  ChromeTopRow as DocumentTopRow,
  ChromeTopRowEnd as DocumentTopRowEnd,
  ChromeTopRowStart as DocumentTopRowStart,
} from "@/features/navigation/layout";

/** Server-safe document geometry. Formatting is added at the leaf that needs viewer state. */
export function DocumentArticle({ children }: { children: ReactNode }) {
  return <article className="flex min-w-0 flex-col gap-7">{children}</article>;
}

export function DocumentHeader({ children }: { children: ReactNode }) {
  return <header className="min-w-0 px-0.5 pb-1">{children}</header>;
}

/** A page parent is always a capability-preserving URL resolved by the server. */
export function DocumentBackLink({ href, children }: { href: string; children: ReactNode }) {
  return <ChromeBackLink href={href}>{children}</ChromeBackLink>;
}

export function DocumentTitle({
  as: Title = "h1",
  children,
}: {
  as?: "h1" | "h2";
  children: ReactNode;
}) {
  return <ChromeTitle as={Title}>{children}</ChromeTitle>;
}

export function DocumentOwnerProvenance({ children }: { children: ReactNode }) {
  return <p className={`mt-2 max-w-xl break-words text-ui leading-6 ${productTextMuted}`}>{children}</p>;
}

export function DocumentStatusRow({ children }: { children: ReactNode }) {
  return <div className="mt-2.5 flex flex-wrap items-center gap-2 text-overline">{children}</div>;
}

/** Internal hrefs (`/pages/:id`) open in place; external ones open a new tab and say so. */
function SequenceHrefLink({
  link,
  className,
  children,
}: {
  link: SequenceLink;
  className: string;
  children: ReactNode;
}) {
  if (link.href.startsWith("/")) {
    return (
      <Link href={link.href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <NewContextHint />
    </a>
  );
}

const SEQUENCE_LINK_CLASS =
  "inline-flex min-w-0 items-center gap-1 font-medium underline-offset-4 hover:underline";

/**
 * The spec's `sequence` under the title: `up` first, then previous/next. Entries the reader cannot
 * open were already dropped by `assembleSequence`.
 */
export function DocumentSequenceNav({ sequence }: { sequence: AssembledSequence | null }) {
  if (sequence === null) return null;
  const { previous, next, up } = sequence;
  if (previous === undefined && next === undefined && up === undefined) return null;

  return (
    <nav aria-label="Sequence" className="mt-2 flex min-w-0 flex-col gap-1.5 text-meta text-muted-foreground">
      {up === undefined ? null : (
        <SequenceHrefLink link={up} className={SEQUENCE_LINK_CLASS}>
          <AppIcon icon={CaretUpIcon} aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{up.title}</span>
        </SequenceHrefLink>
      )}
      {previous === undefined && next === undefined ? null : (
        <div className="flex min-w-0 items-center gap-3">
          {previous === undefined ? null : (
            <SequenceHrefLink link={previous} className={SEQUENCE_LINK_CLASS}>
              <AppIcon icon={CaretLeftIcon} aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{previous.title}</span>
            </SequenceHrefLink>
          )}
          {next === undefined ? null : (
            <SequenceHrefLink link={next} className={SEQUENCE_LINK_CLASS + " ml-auto"}>
              <span className="truncate">{next.title}</span>
              <AppIcon icon={CaretRightIcon} aria-hidden="true" className="size-3.5 shrink-0" />
            </SequenceHrefLink>
          )}
        </div>
      )}
    </nav>
  );
}
