/**
 * One eval case: source material plus machine-checkable claims about a good representation.
 * Semantic faithfulness is not scored.
 */
import type { ComponentName } from "../../src/page-content/catalog";

import type { ComponentRole } from "./taxonomy";
import type { PageKind } from "../../src/page-content/document/types";

export type EvidenceScalar = string | number | boolean;

interface SourceFact {
  readonly id: string;
  /** Literal anchors: strings match normalized substrings, numbers and booleans match exactly. */
  readonly anchors: readonly EvidenceScalar[];
  readonly match?: "all" | "any";
  /** When set, the fact must be present in this semantic role, not elsewhere. */
  readonly required_role?: ComponentRole;
}

export interface GraphicEvidence {
  readonly id: string;
  /** A chart cannot borrow metric evidence, even if some numbers overlap. */
  readonly role: Extract<
    ComponentRole,
    "consistency" | "scalar-metric" | "target-progress" | "trend"
  >;
  /** Every data primitive emitted by that graphic must come from this set. */
  readonly values: readonly EvidenceScalar[];
}

export interface RoleExpectation {
  readonly role: ComponentRole;
  readonly min?: number;
  readonly max?: number;
}

interface ComponentExpectation {
  readonly component: ComponentName;
  readonly min?: number;
  readonly max?: number;
}

export type LayoutExpectation =
  | {
      readonly id: string;
      readonly kind: "compact-peers-grid";
      readonly child_role: ComponentRole;
      readonly child_count: 2 | 4 | 6;
    }
  | {
      readonly id: string;
      readonly kind: "browse-peers-carousel";
      readonly child_role: ComponentRole;
      readonly min_children: number;
      readonly max_children?: number;
    }
  | {
      readonly id: string;
      readonly kind: "mixed-content-section";
      readonly child_roles: readonly ComponentRole[];
      /** Peer containers allowed as one direct block inside the mixed section. */
      readonly allowed_peer_containers?: readonly ("grid" | "carousel")[];
    };

export interface CompositionBrief {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly disposition: "message" | "page";
  readonly page_kind?: PageKind;
  readonly facts: readonly SourceFact[];
  readonly expected_roles: readonly RoleExpectation[];
  readonly forbidden_roles: readonly ComponentRole[];
  readonly expected_components: readonly ComponentExpectation[];
  readonly forbidden_components: readonly ComponentName[];
  readonly layout_expectations: readonly LayoutExpectation[];
  /** Roles that are useful for this brief; structural containers are implicit. */
  readonly allowed_roles: readonly ComponentRole[];
  /** Roles that should appear among the first two semantic blocks. */
  readonly opening_roles?: readonly ComponentRole[];
  readonly max_narrative_share: number;
  readonly max_unnecessary_widgets?: number;
  readonly graphic_evidence: readonly GraphicEvidence[];
  /** Names a historical failure shape without importing it into production. */
  readonly regression_source?: "preserved-text-wall";
}
