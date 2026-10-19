/**
 * Named class combinations for product chrome (Home, Space, Page). Raw values live in globals.css;
 * agent-authored document surfaces are styled elsewhere.
 */
export const productTextMuted = "text-product-muted-foreground";
export const productHairline = "bg-product-divider";
export const productHairlineStrong = "border-product-divider-strong";
export const productPress = "active:bg-product-active";
export const productPressSubtle = "active:bg-product-active-subtle";

export const productBackLink =
  "text-ui font-medium leading-5 tracking-[-0.005em] text-product-muted-foreground";
export const productCollectionRow =
  "min-h-collection-row flex-nowrap rounded-none border-0 px-0.5";
export const productCollectionTitle =
  "w-full min-w-0 text-row font-medium leading-6 tracking-[-0.012em]";
export const productCollectionDetails =
  "flex min-w-0 items-baseline gap-2 text-supporting leading-5 text-product-muted-foreground";
export const productCollectionPreview =
  "flex min-w-0 flex-1 items-baseline overflow-hidden";
/** The row's Space name does not shrink, so the summary absorbs narrow widths; capped at 60%. */
export const productCollectionContext =
  "max-w-[60%] shrink-0 truncate font-medium";
export const productCollectionSummary =
  "min-w-0 flex-1 truncate";
export const productTimestamp =
  "shrink-0 text-micro font-medium leading-5 text-product-muted-foreground tabular-nums";

export const productRowAction =
  "h-control px-3 text-supporting font-medium shadow-none strata-press";
