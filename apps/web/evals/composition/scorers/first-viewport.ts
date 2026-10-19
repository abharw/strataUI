/** Whether the first two content blocks have the roles the brief expects to lead. */
import type { ComponentName } from "../../../src/page-content/catalog";
import type { StrataSpec } from "../../../src/page-content/schema";

import type { CompositionBrief } from "../brief";
import type { ComponentRole } from "../taxonomy";
import type { FirstViewportScore } from "../scoring";
import {
  componentRole,
  GLANCEABLE_COMPONENTS,
  NARRATIVE_COMPONENTS,
  STRUCTURAL_COMPONENTS,
} from "../taxonomy";

/** First two content blocks, descending through layout-only containers. */
function openingElements(spec: StrataSpec, maximum = 2): string[] {
  const opening: string[] = [];
  const visit = (id: string): void => {
    if (opening.length >= maximum) return;
    const element = spec.elements[id];
    if (element === undefined) return;
    if (STRUCTURAL_COMPONENTS.has(element.type)) {
      for (const child of element.children) visit(child);
      return;
    }
    opening.push(id);
  };
  for (const child of spec.elements[spec.root]?.children ?? []) visit(child);
  return opening;
}

export function firstViewport(
  brief: CompositionBrief,
  spec: StrataSpec | null,
): FirstViewportScore {
  if (spec === null) {
    const passed = brief.disposition === "message";
    return {
      score: passed ? 1 : 0,
      passed,
      opening_element_ids: [],
      opening_types: [],
      opening_roles: [],
      expected_role_visible: passed,
      starts_with_narrative: false,
      has_glanceable_component: false,
    };
  }
  const ids = openingElements(spec);
  const types = ids
    .map((id) => spec.elements[id]?.type)
    .filter((type): type is ComponentName => type !== undefined);
  const roles = types
    .map(componentRole)
    .filter((role): role is ComponentRole => role !== null);
  const expected = brief.opening_roles
    ?? brief.expected_roles.map((expectation) => expectation.role);
  const expectedVisible = roles.some((role) => expected.includes(role));
  const startsWithNarrative = types[0] !== undefined
    && NARRATIVE_COMPONENTS.has(types[0])
    && !expected.includes("narrative");
  const hasGlanceable = types.some((type) => GLANCEABLE_COMPONENTS.has(type));
  const passed = expectedVisible && !startsWithNarrative;
  return {
    score: passed ? 1 : expectedVisible || hasGlanceable ? 0.5 : 0,
    passed,
    opening_element_ids: ids,
    opening_types: types,
    opening_roles: roles,
    expected_role_visible: expectedVisible,
    starts_with_narrative: startsWithNarrative,
    has_glanceable_component: hasGlanceable,
  };
}
