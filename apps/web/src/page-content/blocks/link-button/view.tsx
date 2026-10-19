import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import Link from "next/link";

import { AppIcon } from "@/shared/ui/app-icon";
import { Button } from "@/shared/ui/primitives/button";
import { NewContextHint } from "@/page-content/external-link";

export function LinkButton({
  label,
  url,
  page_id,
}: {
  label: string;
  url?: string;
  page_id?: string;
}) {
  if (url?.startsWith("/") === true) {
    return (
      <Button
        asChild
        size="lg"
        className="h-auto min-h-control w-fit max-w-full touch-manipulation rounded-full px-5 py-2.5 text-ui strata-press"
      >
        <Link href={url}>
          <span className="truncate">{label}</span>
          <AppIcon icon={ArrowRightIcon} data-icon="inline-end" aria-hidden="true" />
        </Link>
      </Button>
    );
  }

  if (url !== undefined) {
    return (
      <Button
        asChild
        size="lg"
        className="h-auto min-h-control w-fit max-w-full touch-manipulation rounded-full px-5 py-2.5 text-ui strata-press"
      >
        <a href={url} rel="noopener noreferrer" target="_blank">
          {/* The arrow is decorative; the words carry the new context, once. */}
          <span className="truncate">{label}</span>
          <NewContextHint />
          <AppIcon icon={ArrowSquareOutIcon} data-icon="inline-end" aria-hidden="true" />
        </a>
      </Button>
    );
  }

  // No URL for this viewer: render plain text explaining why, not a dead button.
  return (
    <span
      className="inline-flex w-fit max-w-full items-baseline gap-1.5 font-inherit text-ui text-muted-foreground"
      data-page-id={page_id}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-meta text-muted-foreground">not shared with you</span>
    </span>
  );
}
