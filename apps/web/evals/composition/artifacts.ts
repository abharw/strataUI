import {
  COMPOSITION_BRIEFS,
} from "./cases";
import {
  runCompositionEval,
  type CompositionRunReport,
} from "./index";

const COMPOSITION_ARTIFACT_FORMAT = "strata-composition-candidates/v1";

export type CompositionCandidateArtifacts = Readonly<Record<string, unknown>>;

export interface CompositionEvaluationArtifact {
  readonly format: typeof COMPOSITION_ARTIFACT_FORMAT;
  /** The caller's candidates, preserved verbatim after JSON parsing. */
  readonly candidates: CompositionCandidateArtifacts;
  readonly report: CompositionRunReport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Exactly one JSON-or-null artifact per brief; unknown or missing ids are rejected. */
export function parseCompositionCandidateArtifacts(value: unknown): CompositionCandidateArtifacts {
  if (!isRecord(value)) {
    throw new Error("Composition candidates must be a JSON object keyed by composition brief id.");
  }
  const expectedIds = COMPOSITION_BRIEFS.map((brief) => brief.id);
  const expected = new Set<string>(expectedIds);
  const suppliedIds = Object.keys(value);
  const missing = expectedIds.filter((id) => !Object.hasOwn(value, id));
  const unexpected = suppliedIds.filter((id) => !expected.has(id));
  if (missing.length > 0 || unexpected.length > 0) {
    const problems = [
      missing.length > 0 ? `missing: ${missing.join(", ")}` : null,
      unexpected.length > 0 ? `unexpected: ${unexpected.join(", ")}` : null,
    ].filter((problem): problem is string => problem !== null);
    throw new Error(`Composition candidate ids must exactly match the ${expectedIds.length} briefs (${problems.join("; ")}).`);
  }

  // Corpus order keeps reports stable regardless of input key order.
  return Object.fromEntries(expectedIds.map((id) => [id, value[id]]));
}

export function createCompositionEvaluationArtifact(
  value: unknown,
): CompositionEvaluationArtifact {
  const candidates = parseCompositionCandidateArtifacts(value);
  return {
    format: COMPOSITION_ARTIFACT_FORMAT,
    candidates,
    report: runCompositionEval(COMPOSITION_BRIEFS, candidates),
  };
}

function score(value: number | null): string {
  return value === null ? "—" : value.toFixed(3);
}

/** Human-readable summary; the JSON report is the complete record. */
export function formatCompositionEvaluationReport(
  artifact: CompositionEvaluationArtifact,
): string {
  const { report } = artifact;
  const lines = [
    "Composition evaluation",
    `${report.passed}/${report.results.length} passed · ${report.failed} failed · ${report.schema_invalid} schema invalid · mean ${score(report.mean_score)}`,
    "Deterministic scores are falsifiers, not semantic proof. Review source meaning, omissions, caveats, and misleading emphasis separately.",
    "Raw JSON/null candidate artifacts are retained in the machine-readable evaluation artifact.",
    "",
  ];
  for (const result of report.results) {
    if (!result.schema_valid) {
      lines.push(`INVALID ${result.brief_id} — ${result.issues.join(" | ")}`);
      continue;
    }
    lines.push(`${result.score?.passed === true ? "PASS" : "FAIL"} ${result.brief_id} — ${score(result.score?.overall ?? null)}`);
  }
  return `${lines.join("\n")}\n`;
}
