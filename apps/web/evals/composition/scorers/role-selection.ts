/** Whether the page uses the component roles the brief calls for, independent of names. */
import type { StrataSpec } from "../../../src/page-content/schema";

import type { CompositionBrief } from "../brief";
import type { ComponentRole } from "../taxonomy";
import type { RoleSelectionScore } from "../scoring";
import { componentRole } from "../taxonomy";
import { round } from "../scoring";

function componentRoleCounts(spec: StrataSpec): Map<ComponentRole, number> {
  const counts = new Map<ComponentRole, number>();
  for (const element of Object.values(spec.elements)) {
    const role = componentRole(element.type);
    if (role === null) continue;
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return counts;
}

export function roleSelection(
  brief: CompositionBrief,
  spec: StrataSpec | null,
): RoleSelectionScore {
  if (spec === null) {
    const passed = brief.disposition === "message";
    return {
      score: passed ? 1 : 0,
      passed,
      missing_roles: passed ? [] : brief.expected_roles.map((entry) => entry.role),
      forbidden_roles_present: [],
      excess_roles: [],
    };
  }
  const counts = componentRoleCounts(spec);
  const missing = brief.expected_roles
    .filter(({ role, min = 1 }) => (counts.get(role) ?? 0) < min)
    .map(({ role }) => role);
  const excess = brief.expected_roles
    .filter(({ role, max }) => max !== undefined && (counts.get(role) ?? 0) > max)
    .map(({ role }) => role);
  const forbidden = brief.forbidden_roles
    .filter((role) => (counts.get(role) ?? 0) > 0);
  const checks = brief.expected_roles.length + brief.forbidden_roles.length;
  const failures = missing.length + excess.length + forbidden.length;
  const score = checks === 0 ? 1 : Math.max(0, 1 - failures / checks);
  return {
    score: round(score),
    passed: failures === 0,
    missing_roles: missing,
    forbidden_roles_present: forbidden,
    excess_roles: excess,
  };
}
