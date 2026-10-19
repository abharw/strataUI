"use client";

import { Button } from "@/shared/ui/primitives/button";
import { ChromeTitle } from "@/features/navigation/chrome-title";
import { PageShell } from "@/features/navigation/page-shell";

/**
 * Error boundary for a page whose render throws (e.g. a spec the current registry cannot render).
 * Uses `retry`, which re-fetches; `reset` would replay the same broken payload.
 */
export function PageError({ retry }: { retry: () => void }) {
  return (
    <PageShell>
      <section className="flex w-full max-w-xl flex-col gap-4">
        <ChromeTitle>This page didn&rsquo;t open</ChromeTitle>
        <p className="text-ui leading-relaxed text-product-muted-foreground">
          Something went wrong while opening it. Try again will load it once more.
        </p>
        <div>
          <Button type="button" onClick={retry}>
            Try again
          </Button>
        </div>
      </section>
    </PageShell>
  );
}
