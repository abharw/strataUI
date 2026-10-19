/**
 * Container child allow-lists, enforced by the spec schema and published in the authoring rules.
 * Kept apart from the schema so the prompt can import them without the validator.
 */

/** A card stands alone in a carousel or grid cell, so no containers nest inside it. */
export const CARD_CHILD_TYPES = [
  "attachment-list",
  "breakdown",
  "callout",
  "chart",
  "checklist",
  "comparison",
  "facts",
  "item-list",
  "metric",
  "progress",
  "prose",
  "quote",
  "timeline",
] as const;

/** A grid cell is about 134px wide on the narrowest supported phone. */
export const GRID_CHILD_TYPES = ["metric", "progress", "card"] as const;

/** Cards give the swipe gesture a boundary to snap to. */
export const CAROUSEL_CHILD_TYPES = ["card"] as const;
