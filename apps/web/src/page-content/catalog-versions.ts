/**
 * Catalog version numbers, kept separate so client bundles can read them without importing the
 * Zod schemas in `catalog.ts`.
 */

/** Reported in every response; the live poll compares it with the page's written version. */
export const REGISTRY_VERSION = 15;

/** Written by hand so the `meta.since` check is not tautological. */
export const SINCE: Readonly<Record<string, number>> = {
  accordion: 8,
  approval: 7,
  "attachment-list": 2,
  breakdown: 15,
  callout: 14,
  card: 15,
  carousel: 15,
  chart: 1,
  checklist: 1,
  "code-block": 4,
  comparison: 15,
  decision: 5,
  facts: 15,
  grid: 15,
  "item-list": 15,
  "link-button": 1,
  metric: 15,
  phases: 15,
  progress: 1,
  prose: 6,
  quote: 8,
  "reference-list": 4,
  section: 1,
  "status-list": 1,
  "streak-grid": 1,
  table: 1,
  timeline: 1,
};
