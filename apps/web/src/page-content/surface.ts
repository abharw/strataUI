/**
 * Surface tiers for generated pages: plain flow, hairline rows, contained data, and the
 * actionable approval surface, which differs by border weight rather than radius.
 */
export const surfacePlain = "min-w-0";
export const surfaceContained = "rounded-contained border border-border bg-background";
export const surfaceAction = "rounded-contained border border-foreground/15 bg-background";

export const surfaceCardPad = "p-4 sm:p-5";
export const surfaceCardPadLg = "p-5 sm:p-6";

/**
 * Inside a `data-in-card` ancestor, a leaf drops its own box and fill-height layout, since the
 * card already draws the border and equalises height. A variant avoids threading a prop.
 */
export const surfaceNestedReset =
  "[[data-in-card]_&]:border-0 [[data-in-card]_&]:p-0 [[data-in-card]_&]:shadow-none "
  + "[[data-in-card]_&]:h-auto [[data-in-card]_&]:min-h-0 [[data-in-card]_&]:justify-start [[data-in-card]_&]:gap-2";

/** Container query context on the leaf itself, so labels can adapt with or without a card. */
export const surfaceMeasure = "@container/cell";

export const surfaceList = "border-t border-border px-1";
export const surfaceListRow = "border-b border-border";
/** reference-list draws its row hairline as an element, not a border. */
export const surfaceListRowDivider =
  "pointer-events-none absolute inset-x-0 bottom-0 ml-1 h-px bg-border data-horizontal:w-auto";
