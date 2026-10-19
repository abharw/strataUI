/** Scorer result types and rounding. Each dimension reports a 0-1 score and a separate pass. */
import type { ComponentName } from "../../src/page-content/catalog";

import type { ComponentRole } from "./taxonomy";
import type { LayoutExpectation } from "./brief";

interface DimensionScore {
  readonly score: number;
  readonly passed: boolean;
}

export interface FirstViewportScore extends DimensionScore {
  readonly opening_element_ids: readonly string[];
  readonly opening_types: readonly ComponentName[];
  readonly opening_roles: readonly ComponentRole[];
  readonly expected_role_visible: boolean;
  readonly starts_with_narrative: boolean;
  readonly has_glanceable_component: boolean;
}

export interface FactRetentionScore extends DimensionScore {
  readonly matched_fact_ids: readonly string[];
  readonly missing_fact_ids: readonly string[];
}

export interface NarrativeShareScore extends DimensionScore {
  readonly narrative_chars: number;
  readonly total_text_chars: number;
  readonly share: number;
  readonly maximum: number;
}

export interface UnnecessaryWidgetScore extends DimensionScore {
  readonly semantic_widgets: number;
  readonly unnecessary_count: number;
  readonly unnecessary_element_ids: readonly string[];
  readonly maximum: number;
}

export interface GraphicSupportScore extends DimensionScore {
  readonly graphic_element_ids: readonly string[];
  readonly supported_element_ids: readonly string[];
  readonly unsupported_element_ids: readonly string[];
  readonly missing_required_roles: readonly ComponentRole[];
  readonly missing_evidence_ids: readonly string[];
}

export interface RoleSelectionScore extends DimensionScore {
  readonly missing_roles: readonly ComponentRole[];
  readonly forbidden_roles_present: readonly ComponentRole[];
  readonly excess_roles: readonly ComponentRole[];
}

export interface ComponentSelectionScore extends DimensionScore {
  readonly missing_components: readonly ComponentName[];
  readonly forbidden_components_present: readonly ComponentName[];
  readonly excess_components: readonly ComponentName[];
}

export interface LayoutCheckResult {
  readonly id: string;
  readonly kind: LayoutExpectation["kind"];
  readonly passed: boolean;
}

export interface LayoutSelectionScore extends DimensionScore {
  readonly checks: readonly LayoutCheckResult[];
}

export interface CompositionScore {
  readonly brief_id: string;
  readonly passed: boolean;
  readonly overall: number;
  readonly disposition: DimensionScore;
  readonly first_viewport: FirstViewportScore;
  readonly role_selection: RoleSelectionScore;
  readonly component_selection: ComponentSelectionScore;
  readonly layout_selection: LayoutSelectionScore;
  readonly fact_retention: FactRetentionScore;
  readonly narrative_share: NarrativeShareScore;
  readonly unnecessary_widgets: UnnecessaryWidgetScore;
  readonly source_backed_graphics: GraphicSupportScore;
}

export interface CandidateEvaluation {
  readonly brief_id: string;
  readonly schema_valid: boolean;
  readonly issues: readonly string[];
  readonly score: CompositionScore | null;
}

export interface CompositionRunReport {
  readonly results: readonly CandidateEvaluation[];
  readonly mean_score: number;
  readonly passed: number;
  readonly failed: number;
  readonly schema_invalid: number;
}

/** Three decimals. */
export function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
