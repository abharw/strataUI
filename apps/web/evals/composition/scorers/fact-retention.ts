/**
 * Whether the page kept the source's facts, by literal anchors rather than similarity. Multi-word
 * anchors tolerate bounded lexical variation.
 */
import type { StrataSpec } from "../../../src/page-content/schema";

import type { CompositionBrief, EvidenceScalar } from "../brief";
import type { CandidateValues } from "../values";
import type { ComponentRole } from "../taxonomy";
import type { FactRetentionScore } from "../scoring";
import { candidateValues } from "../values";
import { canonicalTokens, normalizeText, numericClaims } from "../text";
import { round } from "../scoring";

function evidenceMatches(anchor: EvidenceScalar, values: CandidateValues): boolean {
  if (typeof anchor === "number") {
    return values.numbers.includes(anchor)
      || values.strings.some((value) => numericClaims(value).includes(anchor));
  }
  if (typeof anchor === "boolean") return values.booleans.includes(anchor);
  const normalized = normalizeText(anchor);
  if (values.strings.some((value) => value.includes(normalized))) return true;

  // Lets "no action gate" match "lacks an action gate" without "gate" alone counting.
  const anchorTokens = canonicalTokens(anchor);
  if (anchorTokens.length < 2) return false;
  return values.strings.some((value) => {
    const candidate = new Set(canonicalTokens(value));
    return anchorTokens.every((token) => candidate.has(token));
  });
}

export function factRetention(
  brief: CompositionBrief,
  spec: StrataSpec | null,
): FactRetentionScore {
  if (brief.facts.length === 0) {
    return { score: 1, passed: true, matched_fact_ids: [], missing_fact_ids: [] };
  }
  if (spec === null) {
    return {
      score: 0,
      passed: false,
      matched_fact_ids: [],
      missing_fact_ids: brief.facts.map((fact) => fact.id),
    };
  }
  const valuesByRole = new Map<ComponentRole | undefined, CandidateValues>();
  const valuesFor = (role: ComponentRole | undefined): CandidateValues => {
    const existing = valuesByRole.get(role);
    if (existing !== undefined) return existing;
    const collected = candidateValues(spec, role);
    valuesByRole.set(role, collected);
    return collected;
  };
  const matched: string[] = [];
  const missing: string[] = [];
  for (const fact of brief.facts) {
    const values = valuesFor(fact.required_role);
    const hits = fact.anchors.map((anchor) => evidenceMatches(anchor, values));
    const found = fact.match === "any" ? hits.some(Boolean) : hits.every(Boolean);
    (found ? matched : missing).push(fact.id);
  }
  return {
    score: round(matched.length / brief.facts.length),
    passed: missing.length === 0,
    matched_fact_ids: matched,
    missing_fact_ids: missing,
  };
}
