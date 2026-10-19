/**
 * Class strings for Home's tree rail. Space row, status line and Page rows each draw part of one
 * line, so the offsets (row padding, 36px indent) live together here.
 */

/**
 * Connector for a Page under its Space. The emoji column centre is 1px border + 8px padding + 14px
 * (half of 28px) = 23px from the row edge, so -13px from a Page row indented 36px. `before` is the
 * rail (ending at the last row's centre with a rounded elbow); `after` is each branch. Both reach
 * 17px, 4px into the row.
 */
export const pageConnector = [
  "relative",
  "before:pointer-events-none before:absolute before:top-0 before:-bottom-1 before:-left-[13px] before:w-0",
  "before:border-l before:border-product-divider",
  "last:before:bottom-1/2 last:before:w-[17px] last:before:rounded-bl-lg last:before:border-b",
  "forced-colors:before:border-[CanvasText]",
  "after:pointer-events-none after:absolute after:top-1/2 after:-left-[13px] after:h-0 after:w-[17px]",
  "after:border-t after:border-product-divider last:after:hidden",
  "forced-colors:after:border-[CanvasText]",
].join(" ");

/** While selecting, the rail hangs from the 44px checkbox column centre (30px in, so -6px). */
export const pageConnectorSelecting = [
  "relative",
  "before:pointer-events-none before:absolute before:top-0 before:-bottom-1 before:-left-[6px] before:w-0",
  "before:border-l before:border-product-divider",
  "last:before:bottom-1/2 last:before:w-[10px] last:before:rounded-bl-lg last:before:border-b",
  "forced-colors:before:border-[CanvasText]",
  "after:pointer-events-none after:absolute after:top-1/2 after:-left-[6px] after:h-0 after:w-[10px]",
  "after:border-t after:border-product-divider last:after:hidden",
  "forced-colors:after:border-[CanvasText]",
].join(" ");

/** The rail segment that passes the status line while the Space is open. */
export const spaceStatusRail =
  "before:pointer-events-none before:absolute before:-top-1 before:-bottom-1 before:left-[23px] before:w-0 before:border-l before:border-product-divider forced-colors:before:border-[CanvasText]";

/** The 8px of rail into the first Page of the list. */
export const pageListRail =
  "relative flex flex-col gap-1 pl-9 before:pointer-events-none before:absolute before:-top-2 before:left-[23px] before:h-2 before:w-0 before:border-l before:border-product-divider forced-colors:before:border-[CanvasText]";

export const pageListRailSelecting =
  "relative flex flex-col gap-1 pl-9 before:pointer-events-none before:absolute before:-top-2 before:left-[30px] before:h-2 before:w-0 before:border-l before:border-product-divider forced-colors:before:border-[CanvasText]";
