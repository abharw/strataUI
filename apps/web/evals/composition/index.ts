/**
 * Deterministic composition eval: validates caller-supplied specs with the write-edge schema and
 * scores observable proxies, one scorer per file under `scorers/`. Not a model benchmark.
 */
import { specSchemaFor, type StrataSpec } from "../../src/page-content/schema";

import type { CompositionBrief } from "./brief";
import type { CandidateEvaluation, CompositionRunReport, CompositionScore } from "./scoring";
import { componentSelection } from "./scorers/component-selection";
import { factRetention } from "./scorers/fact-retention";
import { firstViewport } from "./scorers/first-viewport";
import { layoutSelection } from "./scorers/layout";
import { narrativeShare } from "./scorers/narrative-share";
import { roleSelection } from "./scorers/role-selection";
import { sourceBackedGraphics } from "./scorers/graphic-support";
import { unnecessaryWidgets } from "./scorers/unnecessary-widgets";
import { round } from "./scoring";

export type { CompositionBrief } from "./brief";
export type { CandidateEvaluation, CompositionRunReport } from "./scoring";

function scoreComposition(
  brief: CompositionBrief,
  spec: StrataSpec | null,
): CompositionScore {
  const dispositionPassed = (brief.disposition === "message") === (spec === null);
  const disposition = { score: dispositionPassed ? 1 : 0, passed: dispositionPassed };
  const dimensions = {
    disposition,
    first_viewport: firstViewport(brief, spec),
    role_selection: roleSelection(brief, spec),
    component_selection: componentSelection(brief, spec),
    layout_selection: layoutSelection(brief, spec),
    fact_retention: factRetention(brief, spec),
    narrative_share: narrativeShare(brief, spec),
    unnecessary_widgets: unnecessaryWidgets(brief, spec),
    source_backed_graphics: sourceBackedGraphics(brief, spec),
  };
  const values = Object.values(dimensions);
  return {
    brief_id: brief.id,
    passed: values.every((dimension) => dimension.passed),
    overall: round(
      values.reduce((sum, dimension) => sum + dimension.score, 0) / values.length,
    ),
    ...dimensions,
  };
}

/** Validates and scores generated JSON. `null` means the model chose a message over a page. */
export function evaluateCompositionCandidate(
  brief: CompositionBrief,
  candidate: unknown,
): CandidateEvaluation {
  if (candidate === null) {
    return {
      brief_id: brief.id,
      schema_valid: brief.disposition === "message",
      issues: brief.disposition === "message" ? [] : ["Expected a page spec; received null."],
      score: scoreComposition(brief, null),
    };
  }
  if (candidate === undefined) {
    return {
      brief_id: brief.id,
      schema_valid: false,
      issues: ["No candidate was supplied for this brief."],
      score: null,
    };
  }
  const result = specSchemaFor(brief.page_kind ?? "living").safeParse(candidate);
  if (!result.success) {
    return {
      brief_id: brief.id,
      schema_valid: false,
      issues: result.error.issues.map((issue) => {
        const path = issue.path.length === 0 ? "$" : `$.${issue.path.join(".")}`;
        return `${path}: ${issue.message}`;
      }),
      score: null,
    };
  }
  return {
    brief_id: brief.id,
    schema_valid: true,
    issues: [],
    score: scoreComposition(brief, result.data),
  };
}

/** Pure: no I/O or network. */
export function runCompositionEval(
  briefs: readonly CompositionBrief[],
  candidates: Readonly<Record<string, unknown>>,
): CompositionRunReport {
  const results = briefs.map((brief) =>
    evaluateCompositionCandidate(brief, candidates[brief.id]),
  );
  const scored = results
    .map((result) => result.score)
    .filter((score): score is CompositionScore => score !== null);
  const passed = scored.filter((score) => score.passed).length;
  return {
    results,
    // Invalid or missing outputs score zero so failures cannot inflate the mean.
    mean_score: results.length === 0
      ? 0
      : round(scored.reduce((sum, score) => sum + score.overall, 0) / results.length),
    passed,
    failed: results.length - passed,
    schema_invalid: results.filter((result) => !result.schema_valid).length,
  };
}
