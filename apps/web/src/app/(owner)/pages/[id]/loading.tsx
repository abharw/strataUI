/**
 * Header-only skeleton: the agent-authored body has no predictable shape. Geometry matches
 * `document-layout.tsx` so the title does not jump.
 */
import { PageShell } from "@/features/navigation/page-shell";

export default function PageLoading() {
  return (
    <PageShell>
      <article aria-hidden className="flex min-w-0 flex-col gap-7">
        <header className="min-w-0 px-0.5 pb-1">
          <div className="flex min-h-control items-center justify-between gap-3">
            <div className="h-4 w-28 rounded bg-product-active-subtle" />
            <div className="h-3 w-20 rounded bg-product-active-subtle" />
          </div>
          <div className="mt-1 flex flex-col gap-2">
            <div className="h-9 w-3/4 rounded-lg bg-product-active-subtle" />
            <div className="h-5 w-1/2 rounded bg-product-active-subtle" />
          </div>
        </header>
      </article>
      <p className="sr-only" role="status">Loading page</p>
    </PageShell>
  );
}
