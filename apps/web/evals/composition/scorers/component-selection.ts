/** Role selection by concrete component name, for briefs where the exact form matters. */
import type { ComponentName } from "../../../src/page-content/catalog";
import type { StrataSpec } from "../../../src/page-content/schema";

import type { CompositionBrief } from "../brief";
import type { ComponentSelectionScore } from "../scoring";
import { round } from "../scoring";

export function componentSelection(
  brief: CompositionBrief,
  spec: StrataSpec | null,
): ComponentSelectionScore {
  if (spec === null) {
    const passed = brief.disposition === "message";
    return {
      score: passed ? 1 : 0,
      passed,
      missing_components: passed
        ? []
        : brief.expected_components.map((entry) => entry.component),
      forbidden_components_present: [],
      excess_components: [],
    };
  }
  const counts = new Map<ComponentName, number>();
  for (const element of Object.values(spec.elements)) {
    counts.set(element.type, (counts.get(element.type) ?? 0) + 1);
  }
  const missing = brief.expected_components
    .filter(({ component, min = 1 }) => (counts.get(component) ?? 0) < min)
    .map(({ component }) => component);
  const excess = brief.expected_components
    .filter(({ component, max }) =>
      max !== undefined && (counts.get(component) ?? 0) > max,
    )
    .map(({ component }) => component);
  const forbidden = brief.forbidden_components
    .filter((component) => (counts.get(component) ?? 0) > 0);
  const checks = brief.expected_components.length + brief.forbidden_components.length;
  const failures = missing.length + excess.length + forbidden.length;
  return {
    score: checks === 0 ? 1 : round(Math.max(0, 1 - failures / checks)),
    passed: failures === 0,
    missing_components: missing,
    forbidden_components_present: forbidden,
    excess_components: excess,
  };
}
