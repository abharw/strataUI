/**
 * Dash patterns for the grayscale chart palette, so series stay distinguishable in monochrome print
 * and forced-colors mode. Index-stable to match legend and table order.
 */
const SERIES_DASHES = ["6 4", "1 5", "10 4 2 4", "3 3"] as const;

/** Below this, strokes stay solid: shade separates two series, and dashes read as projected. */
const DASHED_FROM = 3;

export function seriesDash(index: number, total: number): string | undefined {
  if (total < DASHED_FROM || index === 0) return undefined;
  return SERIES_DASHES[(index - 1) % SERIES_DASHES.length];
}
