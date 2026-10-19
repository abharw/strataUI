/**
 * Whether each graphic's numbers come from the source. Graphics are matched to evidence
 * clusters one-to-one (bipartite matching), so duplicates cannot share a cluster.
 */
import type { StrataSpec } from "../../../src/page-content/schema";

import type { CompositionBrief, GraphicEvidence } from "../brief";
import type { CandidateValues } from "../values";
import type { ComponentRole } from "../taxonomy";
import type { GraphicSupportScore } from "../scoring";
import { componentRole, GRAPHIC_COMPONENTS, GRAPHIC_ROLES } from "../taxonomy";
import { canonicalTokens, normalizeText, numericClaims } from "../text";
import { graphicValues } from "../values";
import { round } from "../scoring";

function evidenceContainsAll(
  candidate: CandidateValues,
  evidence: GraphicEvidence,
  source: string,
): boolean {
  const evidenceStrings = evidence.values
    .filter((value): value is string => typeof value === "string");
  const allowedStrings = evidenceStrings.map(normalizeText);
  const allowedNumbers = [
    ...evidence.values.filter((value): value is number => typeof value === "number"),
    ...evidenceStrings.flatMap(numericClaims),
  ];
  const allowedBooleans = evidence.values
    .filter((value): value is boolean => typeof value === "boolean");
  const candidateNumbers = [
    ...candidate.numbers,
    ...candidate.strings.flatMap(numericClaims),
  ];
  const sortedCandidateNumbers = [...candidateNumbers].sort((left, right) => left - right);
  const sortedAllowedNumbers = [...allowedNumbers].sort((left, right) => left - right);
  const numbersMatch = sortedCandidateNumbers.length === sortedAllowedNumbers.length
    && sortedCandidateNumbers.every((value, index) => value === sortedAllowedNumbers[index]);
  if (!numbersMatch) return false;
  const booleansMatch = candidate.booleans.filter(Boolean).length
      === allowedBooleans.filter(Boolean).length
    && candidate.booleans.length === allowedBooleans.length;
  if (!booleansMatch) return false;

  const normalizedSource = normalizeText(source);
  const evidenceTokens = new Set(evidenceStrings.flatMap(canonicalTokens));
  const allowedTokens = new Set([
    ...canonicalTokens(source),
    ...evidenceTokens,
  ]);
  return candidate.strings.every((value) => {
    if (allowedStrings.includes(value)) return true;
    const tokens = canonicalTokens(value);
    if (tokens.length > 0) {
      return tokens.every((token) => allowedTokens.has(token))
        && tokens.some((token) => evidenceTokens.has(token));
    }
    // Punctuation-only units such as "%" have no tokens, so they need literal support.
    return numericClaims(value).length > 0 || normalizedSource.includes(value);
  });
}

export function sourceBackedGraphics(
  brief: CompositionBrief,
  spec: StrataSpec | null,
): GraphicSupportScore {
  const requiredRoles = brief.expected_roles
    .map(({ role }) => role)
    .filter((role) => GRAPHIC_ROLES.has(role));
  if (spec === null) {
    const passed = brief.disposition === "message" && requiredRoles.length === 0;
    return {
      score: passed ? 1 : 0,
      passed,
      graphic_element_ids: [],
      supported_element_ids: [],
      unsupported_element_ids: [],
      missing_required_roles: requiredRoles,
      missing_evidence_ids: brief.graphic_evidence.map((entry) => entry.id),
    };
  }
  const graphics = Object.entries(spec.elements)
    .filter(([, element]) => GRAPHIC_COMPONENTS.has(element.type));
  const presentRoles = new Set<ComponentRole>();
  const graphicRoles: (ComponentRole | null)[] = [];
  const graphicClaims: CandidateValues[] = [];
  for (const [, element] of graphics) {
    const role = componentRole(element.type);
    graphicRoles.push(role);
    graphicClaims.push(graphicValues(element.props));
    if (role !== null) presentRoles.add(role);
  }

  // Distinct assignment stops duplicate graphics from covering one cluster twice.
  const evidenceToGraphic = new Map<number, number>();
  const graphicToEvidence = new Map<number, number>();
  const edges = graphics.map((_, graphicIndex) =>
    brief.graphic_evidence.flatMap((entry, evidenceIndex) => {
      if (entry.role !== graphicRoles[graphicIndex]) return [];
      return evidenceContainsAll(
        graphicClaims[graphicIndex],
        entry,
        brief.source,
      )
        ? [evidenceIndex]
        : [];
    }),
  );
  const assign = (graphicIndex: number, visited: Set<number>): boolean => {
    for (const evidenceIndex of edges[graphicIndex] ?? []) {
      if (visited.has(evidenceIndex)) continue;
      visited.add(evidenceIndex);
      const previous = evidenceToGraphic.get(evidenceIndex);
      if (previous !== undefined && !assign(previous, visited)) continue;
      evidenceToGraphic.set(evidenceIndex, graphicIndex);
      graphicToEvidence.set(graphicIndex, evidenceIndex);
      return true;
    }
    return false;
  };
  for (const graphicIndex of graphics.keys()) assign(graphicIndex, new Set());

  const supported = graphics
    .filter((_, index) => graphicToEvidence.has(index))
    .map(([id]) => id);
  const unsupported = graphics
    .filter((_, index) => !graphicToEvidence.has(index))
    .map(([id]) => id);
  const missingEvidence = brief.graphic_evidence
    .filter((_, index) => !evidenceToGraphic.has(index))
    .map((entry) => entry.id);
  const missing = [...new Set(requiredRoles)]
    .filter((role) => !presentRoles.has(role));
  const supportShare = graphics.length === 0
    ? requiredRoles.length === 0 ? 1 : 0
    : supported.length / graphics.length;
  const evidenceCoverage = brief.graphic_evidence.length === 0
    ? 1
    : evidenceToGraphic.size / brief.graphic_evidence.length;
  const roleCoverage = requiredRoles.length === 0
    ? 1
    : 1 - missing.length / new Set(requiredRoles).size;
  const passed = unsupported.length === 0
    && missing.length === 0
    && missingEvidence.length === 0;
  return {
    score: round(supportShare * evidenceCoverage * roleCoverage),
    passed,
    graphic_element_ids: graphics.map(([id]) => id),
    supported_element_ids: supported,
    unsupported_element_ids: unsupported,
    missing_required_roles: missing,
    missing_evidence_ids: missingEvidence,
  };
}
