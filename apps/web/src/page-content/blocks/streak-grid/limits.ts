/**
 * Streak-grid limits shared by the schema and the renderer, in a zod-free module so the renderer
 * does not pull zod into the client bundle. Unique dates mean the span cap also bounds cell count.
 */

/** 53 whole week columns, inclusive: a 366-day span already spills into a 53rd column. */
export const MAX_STREAK_SPAN_DAYS = 371;

/** Below a week the grid cannot show which weekday a habit falls on. */
export const MIN_STREAK_WINDOW_DAYS = 7;
