import Link from "next/link";

import { ChromeTitle } from "@/features/navigation/chrome-title";
import { PageShell } from "@/features/navigation/page-shell";
import { Button } from "@/shared/ui/primitives/button";
import { ownerRoutes } from "@/shared/navigation/owner-routes";

/**
 * Shown when a link no longer resolves: rotated key, deleted page or mangled URL. All share one
 * remedy (ask the sender), so there is no retry. The markup is identical in every case.
 */
export function PageMissing() {
  return (
    <PageShell>
      <section className="flex w-full max-w-xl flex-col gap-4">
        <ChromeTitle>This link doesn&rsquo;t open anything</ChromeTitle>
        <p className="text-ui leading-relaxed text-product-muted-foreground">
          The address is either no longer in use or was copied incompletely. Links
          here are replaced rather than repaired. Ask whoever sent it for the
          current one; it will work straight away.
        </p>
        <div>
          <Button asChild variant="link" className="min-h-control px-0">
            <Link href={ownerRoutes().home}>Open Strata</Link>
          </Button>
        </div>
      </section>
    </PageShell>
  );
}
