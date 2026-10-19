"use client";

import type { ComponentRenderProps } from "@json-render/react";

import { Button } from "@/shared/ui/primitives/button";

/**
 * Placeholder for a component this bundle does not have; the renderer would otherwise return
 * null. Covers the gap before the live path reloads on registry skew.
 */
export function UnknownComponent({ element }: ComponentRenderProps) {
  return (
    <div className="flex w-full flex-col items-start gap-3 rounded-lg border border-dashed border-muted-foreground/30 px-4 py-3 text-supporting text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        This part of the page needs a newer version of Strata to show.
      </span>
      <Button
        type="button"
        variant="outline"
        onClick={() => window.location.reload()}
        className="shrink-0 border-muted-foreground/30 bg-background px-4 text-supporting shadow-none hover:border-muted-foreground/45"
      >
        Reload
      </Button>
      <span className="sr-only"> Unsupported component: {element.type}.</span>
    </div>
  );
}
