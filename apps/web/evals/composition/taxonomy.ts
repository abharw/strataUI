/**
 * Maps components to the roles briefs are written in, so scoring survives catalog changes. The
 * component sets below are checked by concrete shape.
 */
import type { ComponentName } from "../../src/page-content/catalog";

export type ComponentRole =
  | "action"
  | "approval"
  | "attachment"
  | "before-after"
  | "chronology"
  | "code"
  | "composition"
  | "consistency"
  | "decision"
  | "evidence"
  | "exact-comparison"
  | "facts"
  | "narrative"
  | "optional-detail"
  | "queue"
  | "quotation"
  | "scalar-metric"
  | "target-progress"
  | "tasks"
  | "trend"
  | "values";

/** Layout-only components do not count as semantic widgets. */
export const STRUCTURAL_COMPONENTS = new Set<ComponentName>([
  "card",
  "carousel",
  "grid",
  "section",
]);

const COMPONENT_ROLES: Partial<Record<ComponentName, ComponentRole>> = {
  accordion: "optional-detail",
  approval: "approval",
  "attachment-list": "attachment",
  breakdown: "composition",
  chart: "trend",
  comparison: "before-after",
  checklist: "tasks",
  "code-block": "code",
  decision: "decision",
  facts: "facts",
  "item-list": "values",
  "link-button": "action",
  metric: "scalar-metric",
  phases: "chronology",
  progress: "target-progress",
  prose: "narrative",
  quote: "quotation",
  "reference-list": "evidence",
  callout: "narrative",
  "status-list": "queue",
  "streak-grid": "consistency",
  table: "exact-comparison",
  timeline: "chronology",
};

export const GLANCEABLE_COMPONENTS = new Set<ComponentName>([
  "approval",
  "comparison",
  "decision",
  "item-list",
  "metric",
  "progress",
  "status-list",
  "table",
]);

/** Components whose primary payload is read as prose, even when card-shaped. */
export const NARRATIVE_COMPONENTS = new Set<ComponentName>([
  "accordion",
  "facts",
  "prose",
  "quote",
  "callout",
]);

/** Data-bearing visual forms whose values must be present in the source. */
export const GRAPHIC_COMPONENTS = new Set<ComponentName>([
  "breakdown",
  "chart",
  "metric",
  "progress",
  "streak-grid",
]);

export const GRAPHIC_ROLES = new Set<ComponentRole>([
  "composition",
  "consistency",
  "scalar-metric",
  "target-progress",
  "trend",
]);

export function componentRole(type: ComponentName): ComponentRole | null {
  return COMPONENT_ROLES[type] ?? null;
}
