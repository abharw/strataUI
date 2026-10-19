/** Counts components whose role the brief does not allow, e.g. progress without a target. */
import type { StrataSpec } from "../../../src/page-content/schema";

import type { CompositionBrief, RoleExpectation } from "../brief";
import type { ComponentRole } from "../taxonomy";
import type { UnnecessaryWidgetScore } from "../scoring";
import { componentRole, STRUCTURAL_COMPONENTS } from "../taxonomy";
import { round } from "../scoring";

export function unnecessaryWidgets(
  brief: CompositionBrief,
  spec: StrataSpec | null,
): UnnecessaryWidgetScore {
  const maximum = brief.max_unnecessary_widgets ?? 0;
  if (spec === null) {
    const passed = brief.disposition === "message";
    return {
      score: passed ? 1 : 0,
      passed,
      semantic_widgets: 0,
      unnecessary_count: 0,
      unnecessary_element_ids: [],
      maximum,
    };
  }
  const unnecessary: string[] = [];
  let semanticWidgets = 0;
  const expectedMax = new Map(
    brief.expected_roles
      .filter((entry): entry is RoleExpectation & { max: number } => entry.max !== undefined)
      .map((entry) => [entry.role, entry.max]),
  );
  const seen = new Map<ComponentRole, number>();
  for (const [id, element] of Object.entries(spec.elements)) {
    if (STRUCTURAL_COMPONENTS.has(element.type)) continue;
    semanticWidgets += 1;
    const role = componentRole(element.type);
    if (role === null || !brief.allowed_roles.includes(role)) {
      unnecessary.push(id);
      continue;
    }
    const count = (seen.get(role) ?? 0) + 1;
    seen.set(role, count);
    const max = expectedMax.get(role);
    if (max !== undefined && count > max) unnecessary.push(id);
  }
  const passed = unnecessary.length <= maximum;
  return {
    score: semanticWidgets === 0
      ? passed ? 1 : 0
      : round(Math.max(0, 1 - unnecessary.length / semanticWidgets)),
    passed,
    semantic_widgets: semanticWidgets,
    unnecessary_count: unnecessary.length,
    unnecessary_element_ids: unnecessary,
    maximum,
  };
}
