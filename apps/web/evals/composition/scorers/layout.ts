/**
 * Container choices the renderer cannot make: compact peers in a grid, coherent cards in a
 * carousel, mixed content in a section.
 */
import type { ComponentName } from "../../../src/page-content/catalog";
import type { StrataSpec } from "../../../src/page-content/schema";

import type { CompositionBrief, LayoutExpectation } from "../brief";
import type { ComponentRole } from "../taxonomy";
import type { LayoutCheckResult, LayoutSelectionScore } from "../scoring";
import { componentRole } from "../taxonomy";
import { round } from "../scoring";

/** A child's role, looking through one `card` wrapper, which has no role of its own. */
function elementRoles(spec: StrataSpec, id: string): ComponentRole[] {
  const type = spec.elements[id]?.type;
  if (type === undefined) return [];
  const role = componentRole(type);
  if (role !== null) return [role];
  if (type === "card") return childRoles(spec, id);
  return [];
}

function childRoles(spec: StrataSpec, id: string): ComponentRole[] {
  return (spec.elements[id]?.children ?? []).flatMap((child) =>
    elementRoles(spec, child),
  );
}

function checkLayout(
  expectation: LayoutExpectation,
  spec: StrataSpec,
): LayoutCheckResult {
  if (expectation.kind === "compact-peers-grid") {
    const passed = Object.entries(spec.elements).some(([id, element]) => {
      if (element.type !== "grid" || element.children.length !== expectation.child_count) {
        return false;
      }
      const roles = childRoles(spec, id);
      return roles.length === expectation.child_count
        && roles.every((role) => role === expectation.child_role);
    });
    return { id: expectation.id, kind: expectation.kind, passed };
  }

  if (expectation.kind === "browse-peers-carousel") {
    const passed = Object.entries(spec.elements).some(([id, element]) => {
      if (element.type !== "carousel") return false;
      const count = element.children.length;
      if (
        count < expectation.min_children
        || (expectation.max_children !== undefined && count > expectation.max_children)
      ) {
        return false;
      }
      // Coherent: every card wraps exactly one block of the same type.
      const contentTypes = element.children.map((cardId) =>
        (spec.elements[cardId]?.children ?? [])
          .map((grandchild) => spec.elements[grandchild]?.type)
          .filter((type): type is ComponentName => type !== undefined),
      );
      const roles = childRoles(spec, id);
      return contentTypes.every((types) => types.length === 1)
        && new Set(contentTypes.flat()).size === 1
        && roles.length === count
        && roles.every((role) => role === expectation.child_role);
    });
    return { id: expectation.id, kind: expectation.kind, passed };
  }

  const root = spec.elements[spec.root];
  const directIds = root?.children ?? [];
  const directTypes = directIds
    .map((child) => spec.elements[child]?.type)
    .filter((type): type is ComponentName => type !== undefined);
  const directRoles = directIds.flatMap((id) => {
    const type = spec.elements[id]?.type;
    if (type === undefined) return [];
    const role = componentRole(type);
    if (role !== null) return [role];
    // A peer container counts as one block, but its children's role is still checked.
    if (type === "grid" || type === "carousel") return childRoles(spec, id);
    return [];
  });
  const hasRoles = expectation.child_roles.every((role) => directRoles.includes(role));
  const allowedPeers = new Set(expectation.allowed_peer_containers ?? []);
  const usesOnlyAllowedPeerContainers = directTypes.every((type) =>
    (type !== "grid" && type !== "carousel") || allowedPeers.has(type),
  );
  return {
    id: expectation.id,
    kind: expectation.kind,
    passed: root?.type === "section" && hasRoles && usesOnlyAllowedPeerContainers,
  };
}

export function layoutSelection(
  brief: CompositionBrief,
  spec: StrataSpec | null,
): LayoutSelectionScore {
  if (brief.layout_expectations.length === 0) {
    return { score: 1, passed: true, checks: [] };
  }
  if (spec === null) {
    return {
      score: 0,
      passed: false,
      checks: brief.layout_expectations.map((expectation) => ({
        id: expectation.id,
        kind: expectation.kind,
        passed: false,
      })),
    };
  }
  const checks = brief.layout_expectations.map((expectation) =>
    checkLayout(expectation, spec),
  );
  const passed = checks.filter((check) => check.passed).length;
  return {
    score: round(passed / checks.length),
    passed: passed === checks.length,
    checks,
  };
}
