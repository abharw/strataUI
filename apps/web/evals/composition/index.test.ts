import { describe, expect, it } from "vitest";

import { textWall } from "@/test/fixtures/text-wall";

import {
  COMPOSITION_BRIEFS,
  GOLDEN_COMPOSITION_CANDIDATES,
} from "./cases";
import {
  evaluateCompositionCandidate,
  runCompositionEval,
  type CompositionBrief,
} from "./index";

interface MutableElement {
  type: string;
  props: Record<string, unknown>;
  children: string[];
}

interface MutableSpec {
  answer: { verdict: string };
  root: string;
  elements: Record<string, MutableElement>;
}

function brief(id: string): CompositionBrief {
  const found = COMPOSITION_BRIEFS.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`unknown test brief: ${id}`);
  return found;
}

function candidate(id: string): MutableSpec {
  return structuredClone(GOLDEN_COMPOSITION_CANDIDATES[id]) as MutableSpec;
}

describe("the golden composition corpus", () => {
  it("covers each semantic decision the generator has to make", () => {
    expect(COMPOSITION_BRIEFS.map((entry) => entry.id)).toEqual([
      "no-page-transient-status",
      "scalar-metrics-launch",
      "target-progress-migration",
      "trend-support-volume",
      "exact-plan-comparison",
      "queue-launch-blockers",
      "trip-upcoming-schedule",
      "chronology-incident-history",
      "decision-release-channel",
      "approval-venue-hold",
      "evidence-browser-support",
      "accordion-optional-detail",
      "code-block-exact-config",
      "facts-readable-facts",
      "quote-consequential-voice",
      "callout-expiring-caveat",
      "prose-irreducible-caveat",
      "regression-preserved-text-wall",
    ]);
    expect([
      ...new Set(
        COMPOSITION_BRIEFS.flatMap((entry) =>
          entry.layout_expectations.map((expectation) => expectation.kind),
        ),
      ),
    ]).toEqual([
      "compact-peers-grid",
      "browse-peers-carousel",
      "mixed-content-section",
    ]);
  });

  it("keeps every expected role allowed and every forbidden role disallowed", () => {
    for (const entry of COMPOSITION_BRIEFS) {
      for (const { role } of entry.expected_roles) {
        expect(entry.allowed_roles, `${entry.id}: ${role}`).toContain(role);
      }
      for (const role of entry.forbidden_roles) {
        expect(entry.allowed_roles, `${entry.id}: ${role}`).not.toContain(role);
      }
      for (const { component } of entry.expected_components) {
        expect(entry.forbidden_components, `${entry.id}: ${component}`).not.toContain(component);
      }
    }
  });

  it("validates and passes every deterministic reference output", () => {
    const report = runCompositionEval(
      COMPOSITION_BRIEFS,
      GOLDEN_COMPOSITION_CANDIDATES,
    );
    const failures = report.results
      .filter((result) => result.score?.passed !== true)
      .map((result) => ({
        id: result.brief_id,
        issues: result.issues,
        score: result.score,
      }));

    expect(failures).toEqual([]);
    expect(report.schema_invalid).toBe(0);
    expect(report.passed).toBe(COMPOSITION_BRIEFS.length);
    expect(report.failed).toBe(0);
    expect(report.mean_score).toBe(1);
  });
});

describe("observable composition failures", () => {
  it("requires compact metrics to share a Grid", () => {
    const output = candidate("scalar-metrics-launch");
    output.elements.root.children = ["active-teams", "weekly-retention"];
    delete output.elements["launch-metrics"];

    const result = evaluateCompositionCandidate(
      brief("scalar-metrics-launch"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.role_selection.passed).toBe(true);
    expect(result.score?.component_selection.missing_components).toEqual(["grid"]);
    expect(result.score?.layout_selection.checks).toEqual([
      {
        id: "compact-metrics-share-one-grid",
        kind: "compact-peers-grid",
        passed: false,
      },
    ]);
    expect(result.score?.passed).toBe(false);
  });

  it("requires coherent trip days to browse one at a time in a carousel", () => {
    const output = candidate("trip-upcoming-schedule");
    output.elements.root.children = ["arrival-day", "alfama-day", "sintra-day"];
    delete output.elements["trip-days"];

    const result = evaluateCompositionCandidate(
      brief("trip-upcoming-schedule"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.role_selection.passed).toBe(true);
    expect(result.score?.component_selection.missing_components).toEqual([
      "carousel",
    ]);
    expect(
      result.score?.layout_selection.checks
        .find((check) => check.id === "trip-days-browse-one-at-a-time")
        ?.passed,
    ).toBe(false);
    expect(result.score?.passed).toBe(false);
  });

  it("keeps causal conditional reasoning in prose rather than a callout", () => {
    const output = candidate("prose-irreducible-caveat");
    output.elements["refund-caveat"].type = "callout";
    output.elements["refund-caveat"].props = {
      text: "The annual plan is prepaid and has no prorated refund if the workspace closes mid-year.",
      tone: "warning",
    };

    const result = evaluateCompositionCandidate(
      brief("prose-irreducible-caveat"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.role_selection.passed).toBe(true);
    expect(result.score?.fact_retention.missing_fact_ids).toEqual([
      "conditional-horizon",
    ]);
    expect(result.score?.component_selection.missing_components).toEqual(["prose"]);
    expect(result.score?.component_selection.forbidden_components_present).toEqual([
      "callout",
    ]);
    expect(result.score?.passed).toBe(false);
  });

  it("keeps scalar wall facts as peer metrics rather than detail sentences", () => {
    const output = candidate("regression-preserved-text-wall");
    output.elements["driftwood-facts"] = {
      type: "facts",
      props: {
        items: [
          { id: "commits", label: "Agent-authored commits", value: "50+" },
          { id: "size", label: "Product size", value: "12.4K lines" },
        ],
      },
      children: [],
    };
    output.elements.root.children = output.elements.root.children.map((id) =>
      id === "driftwood-metrics" ? "driftwood-facts" : id,
    );
    delete output.elements["driftwood-metrics"];
    delete output.elements["agent-authored-commits"];
    delete output.elements["product-size"];

    const result = evaluateCompositionCandidate(
      brief("regression-preserved-text-wall"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.fact_retention.missing_fact_ids).toEqual([
      "commits",
      "size",
    ]);
    expect(result.score?.role_selection.missing_roles).toEqual(["scalar-metric"]);
    expect(result.score?.role_selection.forbidden_roles_present).toEqual(["facts"]);
    expect(result.score?.component_selection.missing_components).toEqual([
      "grid",
      "metric",
    ]);
    expect(result.score?.layout_selection.checks
      .find((check) => check.id === "driftwood-scalars-share-one-grid")?.passed)
      .toBe(false);
    expect(result.score?.passed).toBe(false);
  });

  it("requires distinct metric cards to cover every scalar evidence cluster", () => {
    const output = candidate("regression-preserved-text-wall");
    output.elements["product-size"].props = {
      label: "Agent-authored commits",
      value: "50+",
    };

    const result = evaluateCompositionCandidate(
      brief("regression-preserved-text-wall"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.role_selection.passed).toBe(true);
    expect(result.score?.component_selection.passed).toBe(true);
    expect(result.score?.source_backed_graphics.supported_element_ids).toEqual([
      "agent-authored-commits",
    ]);
    expect(result.score?.source_backed_graphics.unsupported_element_ids).toEqual([
      "product-size",
    ]);
    expect(result.score?.source_backed_graphics.missing_evidence_ids).toEqual([
      "driftwood-size",
    ]);
    expect(result.score?.fact_retention.missing_fact_ids).toContain("size");
    expect(result.score?.passed).toBe(false);
  });

  it("rejects labels paired with the other metric's value", () => {
    const output = candidate("regression-preserved-text-wall");
    output.elements["agent-authored-commits"].props = {
      label: "Agent-authored commits",
      value: { value: 12.4, unit: "K lines" },
    };
    output.elements["product-size"].props = {
      label: "Product size",
      value: "50+",
    };

    const result = evaluateCompositionCandidate(
      brief("regression-preserved-text-wall"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.source_backed_graphics.supported_element_ids).toEqual([]);
    expect(result.score?.source_backed_graphics.unsupported_element_ids).toEqual([
      "agent-authored-commits",
      "product-size",
    ]);
    expect(result.score?.source_backed_graphics.missing_evidence_ids).toEqual([
      "driftwood-commits",
      "driftwood-size",
    ]);
    expect(result.score?.passed).toBe(false);
  });

  it("requires each finite reading action to appear in the Checklist role", () => {
    const output = candidate("regression-preserved-text-wall");
    const items = output.elements["next-reading"].props.items as {
      id: string;
      label: string;
      done: boolean;
    }[];
    items[1] = {
      id: "backoff-again",
      label: "Read scheduler.md again before building our scheduler.",
      done: false,
    };

    const result = evaluateCompositionCandidate(
      brief("regression-preserved-text-wall"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.role_selection.passed).toBe(true);
    expect(result.score?.fact_retention.missing_fact_ids).toContain("reading");
    expect(result.score?.passed).toBe(false);
  });

  it("keeps heterogeneous summary blocks in the page Section", () => {
    const output = candidate("regression-preserved-text-wall");
    const mixedChildren = [...output.elements.root.children];
    output.elements.summary = {
      type: "section",
      props: { title: "Summary" },
      children: mixedChildren,
    };
    output.elements.root.children = ["summary"];

    const result = evaluateCompositionCandidate(
      brief("regression-preserved-text-wall"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.role_selection.passed).toBe(true);
    expect(result.score?.component_selection.excess_components).toEqual([
      "section",
    ]);
    expect(
      result.score?.layout_selection.checks
        .find((check) => check.id === "heterogeneous-summary-reads-in-one-section")
        ?.passed,
    ).toBe(false);
    expect(result.score?.passed).toBe(false);
  });

  it("rejects a table when the source asks the reader to see a trend", () => {
    const output = candidate("trend-support-volume");
    output.elements["monthly-tickets"] = {
      type: "table",
      children: [],
      props: {
        columns: ["Month", "Tickets"],
        rows: [
          { id: "jan", cells: ["Jan", 18] },
          { id: "feb", cells: ["Feb", 24] },
          { id: "mar", cells: ["Mar", 31] },
          { id: "apr", cells: ["Apr", 46] },
        ],
      },
    };

    const result = evaluateCompositionCandidate(
      brief("trend-support-volume"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.role_selection.missing_roles).toEqual(["trend"]);
    expect(result.score?.role_selection.forbidden_roles_present).toEqual([
      "exact-comparison",
    ]);
    expect(result.score?.unnecessary_widgets.unnecessary_element_ids).toEqual([
      "monthly-tickets",
    ]);
    expect(result.score?.source_backed_graphics.missing_required_roles).toEqual([
      "trend",
    ]);
    expect(result.score?.passed).toBe(false);
  });

  it("flags a chart whose plotted value was not in the source", () => {
    const output = candidate("trend-support-volume");
    const series = output.elements["monthly-tickets"].props.series as {
      name: string;
      values: number[];
    }[];
    series[0].values[3] = 99;

    const result = evaluateCompositionCandidate(
      brief("trend-support-volume"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.source_backed_graphics.unsupported_element_ids).toEqual([
      "monthly-tickets",
    ]);
    expect(result.score?.source_backed_graphics.passed).toBe(false);
    expect(result.score?.fact_retention.missing_fact_ids).toContain("april");
  });

  it("does not let an omitted trend value hide in the verdict", () => {
    const output = candidate("trend-support-volume");
    output.answer.verdict = "Tickets were 18 in January, 24 in February, 31 in March, and 46 in April.";
    const series = output.elements["monthly-tickets"].props.series as {
      name: string;
      values: number[];
    }[];
    series[0].values = [18, 24, 24, 46];

    const result = evaluateCompositionCandidate(
      brief("trend-support-volume"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.fact_retention.missing_fact_ids).toContain("march");
    expect(result.score?.source_backed_graphics.unsupported_element_ids).toEqual([
      "monthly-tickets",
    ]);
    expect(result.score?.source_backed_graphics.missing_evidence_ids).toEqual([
      "monthly-tickets",
    ]);
    expect(result.score?.passed).toBe(false);
  });

  it("accepts source-backed label inflection without weakening progress values", () => {
    const output = candidate("target-progress-migration");
    output.elements["accounts-migrated"].props.label = "Accounts migrated by Friday";

    const result = evaluateCompositionCandidate(
      brief("target-progress-migration"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.source_backed_graphics.passed).toBe(true);
    expect(result.score?.passed).toBe(true);

    const invented = structuredClone(output);
    invented.elements["accounts-migrated"].props.current = {
      value: 73,
      unit: "accounts",
    };
    const inventedResult = evaluateCompositionCandidate(
      brief("target-progress-migration"),
      invented,
    );
    expect(inventedResult.schema_valid).toBe(true);
    expect(inventedResult.score?.source_backed_graphics.unsupported_element_ids)
      .toEqual(["accounts-migrated"]);
    expect(inventedResult.score?.passed).toBe(false);
  });

  it("treats full month names and a source-grounded series label as the same trend", () => {
    const output = candidate("trend-support-volume");
    output.elements["monthly-tickets"].props.labels = [
      "January",
      "February",
      "March",
      "April",
    ];
    const series = output.elements["monthly-tickets"].props.series as {
      name: string;
      values: number[];
    }[];
    series[0].name = "Support tickets";

    const result = evaluateCompositionCandidate(
      brief("trend-support-volume"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.source_backed_graphics.passed).toBe(true);
    expect(result.score?.passed).toBe(true);

    const inventedLabel = structuredClone(output);
    const inventedSeries = inventedLabel.elements["monthly-tickets"].props.series as {
      name: string;
      values: number[];
    }[];
    inventedSeries[0].name = "Projected tickets";
    const inventedResult = evaluateCompositionCandidate(
      brief("trend-support-volume"),
      inventedLabel,
    );
    expect(inventedResult.schema_valid).toBe(true);
    expect(inventedResult.score?.source_backed_graphics.unsupported_element_ids)
      .toEqual(["monthly-tickets"]);
    expect(inventedResult.score?.passed).toBe(false);
  });

  it("accepts source-grounded metric paraphrases and absence wording, but not a new number", () => {
    const output = candidate("regression-preserved-text-wall");
    output.answer.verdict = "Driftwood is a reference, not a base: 50+ commits and about 12.4K lines prove scale, but unrestricted shell access lacks an action gate.";
    output.elements["agent-authored-commits"].props.label = "Agent commits on main";
    output.elements["product-size"].props = {
      label: "Product lines",
      value: "About 12.4K",
    };
    const decision = output.elements["adoption-decision"].props as {
      options: { id: string; label: string; tradeoff?: string }[];
      rationale: string;
    };
    decision.options.find((option) => option.id === "base")!.tradeoff =
      "Unrestricted shell access lacks an action gate.";
    decision.rationale = "Use it as a reference rather than a base because unrestricted shell access lacks an action gate.";

    const result = evaluateCompositionCandidate(
      brief("regression-preserved-text-wall"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.fact_retention.missing_fact_ids).toEqual([]);
    expect(result.score?.source_backed_graphics.unsupported_element_ids).toEqual([]);
    expect(result.score?.passed).toBe(true);

    const invented = structuredClone(output);
    invented.elements["product-size"].props.value = "About 14.9K";
    const inventedResult = evaluateCompositionCandidate(
      brief("regression-preserved-text-wall"),
      invented,
    );
    expect(inventedResult.schema_valid).toBe(true);
    expect(inventedResult.score?.fact_retention.missing_fact_ids).toContain("size");
    expect(inventedResult.score?.source_backed_graphics.supported_element_ids)
      .toEqual(["agent-authored-commits"]);
    expect(inventedResult.score?.source_backed_graphics.unsupported_element_ids)
      .toEqual(["product-size"]);
    expect(inventedResult.score?.passed).toBe(false);
  });

  it("refuses a source-backed series whose authored axis clips its values", () => {
    const output = candidate("trend-support-volume");
    output.elements["monthly-tickets"].props.y_max = 20;

    const result = evaluateCompositionCandidate(
      brief("trend-support-volume"),
      output,
    );
    expect(result.schema_valid).toBe(false);
    expect(result.issues.some((issue) => issue.includes("observed maximum 46"))).toBe(true);
    expect(result.score).toBeNull();
  });

  it("catches retained structure with source facts omitted", () => {
    const output = candidate("exact-plan-comparison");
    const rows = output.elements["plan-comparison"].props.rows as unknown[];
    output.elements["plan-comparison"].props.rows = rows.slice(0, 1);

    const result = evaluateCompositionCandidate(
      brief("exact-plan-comparison"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.role_selection.passed).toBe(true);
    expect(result.score?.fact_retention.missing_fact_ids).toEqual([
      "basic",
      "pro",
    ]);
    expect(result.score?.passed).toBe(false);
  });

  it("requires what separates the venues to stay inside the unanswered approval", () => {
    // The distinctions live in the approval context, so dropping half of it loses a fact.
    const output = candidate("approval-venue-hold");
    output.elements["venue-hold"].props.context =
      "Both hold the requested date until tomorrow afternoon. Foundry Loft is closer to downtown with less outdoor space.";

    const result = evaluateCompositionCandidate(
      brief("approval-venue-hold"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.role_selection.passed).toBe(true);
    expect(result.score?.component_selection.passed).toBe(true);
    expect(result.score?.fact_retention.missing_fact_ids).toEqual([
      "riverside-distinction",
    ]);
    expect(result.score?.passed).toBe(false);
  });

  it("does not replace an unanswered approval with a display-only decision", () => {
    const output = candidate("approval-venue-hold");
    output.elements["venue-hold"] = {
      type: "decision",
      props: {
        question: "Which venue should we hold?",
        options: [
          {
            id: "riverside",
            label: "Riverside Hall",
            tradeoff: "More natural light and a longer trip from downtown.",
          },
          {
            id: "foundry",
            label: "Foundry Loft",
            tradeoff: "Closer to downtown with less outdoor space.",
          },
        ],
        rationale: "Waiting for the owner to choose before placing the hold.",
      },
      children: [],
    };

    const result = evaluateCompositionCandidate(
      brief("approval-venue-hold"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.role_selection.missing_roles).toEqual(["approval"]);
    expect(result.score?.role_selection.forbidden_roles_present).toEqual([
      "decision",
    ]);
    expect(result.score?.component_selection.missing_components).toEqual([
      "approval",
    ]);
    expect(result.score?.component_selection.forbidden_components_present).toEqual([
      "decision",
    ]);
    expect(result.score?.passed).toBe(false);
  });

  it("penalizes a legal but paragraph-first decorative wrapper", () => {
    const output = candidate("scalar-metrics-launch");
    output.elements.intro = {
      type: "callout",
      props: {
        text: "This weekly snapshot introduces the numbers in a sentence before showing the same numbers below.",
      },
      children: [],
    };
    output.elements.root.children = ["intro", "launch-metrics"];

    const result = evaluateCompositionCandidate(
      brief("scalar-metrics-launch"),
      output,
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.first_viewport.starts_with_narrative).toBe(true);
    expect(result.score?.narrative_share.passed).toBe(false);
    expect(result.score?.unnecessary_widgets.unnecessary_element_ids).toEqual([
      "intro",
    ]);
    expect(result.score?.passed).toBe(false);
  });

  it("treats creating a page for a transient answer as a disposition failure", () => {
    const result = evaluateCompositionCandidate(
      brief("no-page-transient-status"),
      candidate("scalar-metrics-launch"),
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.disposition.passed).toBe(false);
    expect(result.score?.passed).toBe(false);
  });
});

describe("the preserved text-wall regression", () => {
  it("runs the historical wall through the current write schema and refuses it", () => {
    const result = evaluateCompositionCandidate(
      brief("regression-preserved-text-wall"),
      textWall,
    );
    expect(result.schema_valid).toBe(false);
    expect(result.score).toBeNull();
    expect(result.issues.some((issue) => issue.includes("visible text"))).toBe(true);
    expect(result.issues.some((issue) => issue.includes("first child") || issue.includes("first thing"))).toBe(true);
    expect(result.issues.some((issue) => issue.includes("no `answer`"))).toBe(true);
  });

  it("passes the compressed golden rewrite for the same source shape", () => {
    const result = evaluateCompositionCandidate(
      brief("regression-preserved-text-wall"),
      GOLDEN_COMPOSITION_CANDIDATES["regression-preserved-text-wall"],
    );
    expect(result.schema_valid).toBe(true);
    expect(result.score?.passed).toBe(true);
    expect(result.score?.narrative_share.share).toBeLessThanOrEqual(0.35);
    expect(result.score?.fact_retention.missing_fact_ids).toEqual([]);
  });
});

describe("runner contract", () => {
  it("reports a missing generated output without inventing a score", () => {
    const report = runCompositionEval(
      [brief("trend-support-volume")],
      {},
    );
    expect(report.schema_invalid).toBe(1);
    expect(report.results[0]?.issues).toEqual([
      "No candidate was supplied for this brief.",
    ]);
    expect(report.results[0]?.score).toBeNull();
    expect(report.mean_score).toBe(0);
    expect(report.failed).toBe(1);
  });
});
