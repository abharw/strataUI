/**
 * Loading state for Home and `/spaces/:id`, whose dynamic Neon reads can hit a cold start. Keyed
 * share routes have no loading file, since Suspense would flush a 200 before the key resolves.
 * Uses the tree's geometry so nothing jumps when rows arrive.
 */
export function TreeSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-6 sm:gap-7">
      <div aria-hidden className="flex flex-col gap-3 px-0.5 pt-1 sm:pt-3">
        <div className="h-9 w-40 rounded-lg bg-product-active-subtle" />
        <div className="h-4 w-28 rounded bg-product-active-subtle" />
        <div className="mt-2 h-control w-full rounded-full bg-product-active-subtle" />
      </div>
      <ul aria-hidden className="flex flex-col gap-1">
        {[0, 1, 2, 3].map((row) => (
          <li key={row} className="flex min-h-control items-center gap-3 px-2 py-2.5">
            <div className="size-7 shrink-0 rounded-lg bg-product-active-subtle" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="h-4 w-1/2 rounded bg-product-active-subtle" />
              <div className="h-3 w-1/3 rounded bg-product-active-subtle" />
            </div>
          </li>
        ))}
      </ul>
      <p className="sr-only" role="status">Loading Home</p>
    </div>
  );
}
