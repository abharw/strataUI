/**
 * Device default when `presentation` is null: donut when `total_label` is set or parts <= 5,
 * bars otherwise, since many small slices on a phone become unlabelled slivers.
 */
export type BreakdownPresentation = "donut" | "pie" | "bars" | "radial";

export interface BreakdownShape {
  readonly presentation?: BreakdownPresentation | null;
  readonly parts: readonly { readonly value: number }[];
  readonly total_label?: string;
}

/** More slices than this stop being told apart by angle on a phone. */
export const DONUT_PARTS = 5;

export function breakdownPresentation(shape: BreakdownShape): BreakdownPresentation {
  if (shape.presentation !== undefined && shape.presentation !== null) return shape.presentation;
  if (shape.total_label !== undefined) return "donut";
  return shape.parts.length <= DONUT_PARTS ? "donut" : "bars";
}

/** The number the donut's centre and the data table both report. */
export function breakdownTotal(parts: readonly { readonly value: number }[]): number {
  return parts.reduce((sum, part) => sum + part.value, 0);
}
