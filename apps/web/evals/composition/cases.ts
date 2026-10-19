/**
 * Composition corpus with hand-authored reference outputs that exercise the evaluator. A model
 * harness can pass its own candidates, keyed by brief id, to `runCompositionEval`.
 */
import type { CompositionBrief } from "./index";

type Element = {
  type: string;
  props: Record<string, unknown>;
  children?: readonly string[];
};

function page(
  verdict: string,
  children: readonly string[],
  elements: Readonly<Record<string, Element>>,
): unknown {
  return {
    answer: { verdict },
    root: "root",
    elements: {
      root: { type: "section", props: {}, children },
      ...elements,
    },
  };
}

export const COMPOSITION_BRIEFS = [
  {
    id: "no-page-transient-status",
    title: "A transient answer should stay a message",
    source:
      "The build finished successfully. There is no state to track, compare, revisit, or share. Tell me it passed.",
    disposition: "message",
    facts: [],
    expected_roles: [],
    forbidden_roles: ["narrative", "scalar-metric", "queue"],
    expected_components: [],
    forbidden_components: [],
    layout_expectations: [],
    allowed_roles: [],
    max_narrative_share: 0,
    graphic_evidence: [],
  },
  {
    id: "scalar-metrics-launch",
    title: "Independent scalar metrics",
    source:
      "Weekly launch snapshot: 1,284 active teams and 42% weekly retention. These are independent current values, not progress toward targets.",
    disposition: "page",
    page_kind: "living",
    facts: [
      { id: "active-teams", anchors: [1_284], required_role: "scalar-metric" },
      { id: "weekly-retention", anchors: [42, "%"], required_role: "scalar-metric" },
    ],
    expected_roles: [{ role: "scalar-metric", min: 2, max: 2 }],
    forbidden_roles: ["target-progress", "trend", "narrative"],
    expected_components: [
      { component: "grid", min: 1, max: 1 },
      { component: "metric", min: 2, max: 2 },
    ],
    forbidden_components: ["carousel"],
    layout_expectations: [
      {
        id: "compact-metrics-share-one-grid",
        kind: "compact-peers-grid",
        child_role: "scalar-metric",
        child_count: 2,
      },
    ],
    allowed_roles: ["scalar-metric"],
    opening_roles: ["scalar-metric"],
    max_narrative_share: 0,
    graphic_evidence: [
      {
        id: "active-teams",
        role: "scalar-metric",
        values: ["Active teams", 1_284],
      },
      {
        id: "weekly-retention",
        role: "scalar-metric",
        values: ["Weekly retention", 42, "%"],
      },
    ],
  },
  {
    id: "target-progress-migration",
    title: "A current value against a target",
    source:
      "The account migration is at 72 of 100 accounts. The target is all 100 by Friday; this is progress, not a standalone metric or trend.",
    disposition: "page",
    page_kind: "living",
    facts: [
      { id: "migrated", anchors: [72], required_role: "target-progress" },
      { id: "target", anchors: [100], required_role: "target-progress" },
      { id: "deadline", anchors: ["Friday"], required_role: "target-progress" },
    ],
    expected_roles: [{ role: "target-progress", min: 1, max: 1 }],
    forbidden_roles: ["scalar-metric", "trend", "narrative"],
    expected_components: [{ component: "progress", min: 1, max: 1 }],
    forbidden_components: ["grid", "carousel", "chart", "metric"],
    layout_expectations: [],
    allowed_roles: ["target-progress"],
    opening_roles: ["target-progress"],
    max_narrative_share: 0,
    graphic_evidence: [
      {
        id: "accounts-migrated",
        role: "target-progress",
        values: ["Accounts migrated", 72, 100, "accounts"],
      },
    ],
  },
  {
    id: "trend-support-volume",
    title: "A time series where shape is the point",
    source:
      "Monthly support tickets rose from 18 in January to 24 in February, 31 in March, and 46 in April. Show the shape of the rise; exact lookup is secondary.",
    disposition: "page",
    page_kind: "standing",
    facts: [
      { id: "january", anchors: ["Jan", 18], required_role: "trend" },
      { id: "february", anchors: ["Feb", 24], required_role: "trend" },
      { id: "march", anchors: ["Mar", 31], required_role: "trend" },
      { id: "april", anchors: ["Apr", 46], required_role: "trend" },
    ],
    expected_roles: [{ role: "trend", min: 1, max: 1 }],
    forbidden_roles: ["exact-comparison", "narrative"],
    expected_components: [{ component: "chart", min: 1, max: 1 }],
    forbidden_components: ["table", "grid", "carousel"],
    layout_expectations: [],
    allowed_roles: ["trend"],
    opening_roles: ["trend"],
    max_narrative_share: 0,
    graphic_evidence: [
      {
        id: "monthly-tickets",
        role: "trend",
        values: ["Jan", "Feb", "Mar", "Apr", "Tickets", 18, 24, 31, 46, "tickets"],
      },
    ],
  },
  {
    id: "exact-plan-comparison",
    title: "Exact values compared side by side",
    source:
      "Compare Basic at $12 per month with 10 GB storage against Pro at $29 per month with 100 GB. Pro is the pick because the team needs more than 10 GB.",
    disposition: "page",
    page_kind: "standing",
    facts: [
      { id: "basic", anchors: ["Basic", 12, 10], required_role: "exact-comparison" },
      { id: "pro", anchors: ["Pro", 29, 100], required_role: "exact-comparison" },
      { id: "pick", anchors: ["Pro is the pick"] },
    ],
    expected_roles: [{ role: "exact-comparison", min: 1, max: 1 }],
    forbidden_roles: ["trend", "narrative"],
    expected_components: [{ component: "table", min: 1, max: 1 }],
    forbidden_components: ["chart", "grid", "carousel"],
    layout_expectations: [],
    allowed_roles: ["exact-comparison"],
    opening_roles: ["exact-comparison"],
    max_narrative_share: 0,
    graphic_evidence: [],
  },
  {
    id: "queue-launch-blockers",
    title: "Open loops with owners and wait directions",
    source:
      "Launch queue: Maya owes the privacy copy; Legal owes the DPA and has had it since 2026-08-24; production access is blocked; analytics is done.",
    disposition: "page",
    page_kind: "living",
    facts: [
      { id: "privacy-copy", anchors: ["Privacy copy", "Maya", "waiting-on-them"], required_role: "queue" },
      { id: "dpa", anchors: ["DPA", "Legal", "2026-08-24"], required_role: "queue" },
      { id: "production-access", anchors: ["Production access", "blocked"], required_role: "queue" },
      { id: "analytics", anchors: ["Analytics", "done"], required_role: "queue" },
    ],
    expected_roles: [{ role: "queue", min: 1, max: 1 }],
    forbidden_roles: ["tasks", "facts", "narrative"],
    expected_components: [{ component: "status-list", min: 1, max: 1 }],
    forbidden_components: ["checklist", "facts", "grid", "carousel"],
    layout_expectations: [],
    allowed_roles: ["queue"],
    opening_roles: ["queue"],
    max_narrative_share: 0,
    graphic_evidence: [],
  },
  {
    id: "trip-upcoming-schedule",
    title: "Substantial day plans consulted one day at a time",
    source:
      "The Lisbon itinerary has three full day plans that I will consult one day at a time while moving around. "
      + "On 2026-09-12: land at 14:05 at LIS Terminal 1 on TAP 1049, check in at Casa do Beco at 16:00, and eat at Taberna da Rua das Flores at 20:30. "
      + "On 2026-09-13: São Jorge Castle at 09:30, Tram 28 at 12:00, and fado at Mesa de Frades at 21:00. "
      + "On 2026-09-14: the 08:12 train from Rossio, Pena Palace at 10:00, Quinta da Regaleira at 14:30, and the 18:40 train back. "
      + "Keep each day's entries together; when I am using one day, the other days are not useful yet.",
    disposition: "page",
    page_kind: "standing",
    facts: [
      { id: "landing", anchors: ["2026-09-12", "14:05", "LIS Terminal 1", "TAP 1049"], required_role: "chronology" },
      { id: "arrival-day", anchors: ["16:00", "Casa do Beco", "20:30", "Taberna da Rua das Flores"], required_role: "chronology" },
      { id: "alfama-day", anchors: ["2026-09-13", "09:30", "São Jorge Castle", "21:00", "Mesa de Frades"], required_role: "chronology" },
      { id: "sintra-day", anchors: ["2026-09-14", "08:12", "Pena Palace", "14:30", "18:40"], required_role: "chronology" },
    ],
    expected_roles: [{ role: "chronology", min: 3, max: 3 }],
    forbidden_roles: ["narrative"],
    expected_components: [
      { component: "carousel", min: 1, max: 1 },
      { component: "timeline", min: 3, max: 3 },
    ],
    forbidden_components: ["grid"],
    layout_expectations: [
      {
        id: "trip-days-browse-one-at-a-time",
        kind: "browse-peers-carousel",
        child_role: "chronology",
        min_children: 3,
        max_children: 3,
      },
    ],
    allowed_roles: ["chronology"],
    opening_roles: ["chronology"],
    max_narrative_share: 0,
    graphic_evidence: [],
  },
  {
    id: "chronology-incident-history",
    title: "Past events in chronological context",
    source:
      "Incident history: alert fired on 2026-08-25 at 09:12-04:00; rollback completed at 09:26; the postmortem was published on 2026-08-26. These events already happened.",
    disposition: "page",
    page_kind: "standing",
    facts: [
      { id: "alert", anchors: ["2026-08-25T09:12:00-04:00", "Alert fired"], required_role: "chronology" },
      { id: "rollback", anchors: ["2026-08-25T09:26:00-04:00", "Rollback completed"], required_role: "chronology" },
      { id: "postmortem", anchors: ["2026-08-26", "Postmortem published"], required_role: "chronology" },
    ],
    expected_roles: [{ role: "chronology", min: 1, max: 1 }],
    forbidden_roles: ["narrative"],
    expected_components: [{ component: "timeline", min: 1, max: 1 }],
    forbidden_components: ["grid", "carousel"],
    layout_expectations: [],
    allowed_roles: ["chronology"],
    opening_roles: ["chronology"],
    max_narrative_share: 0,
    graphic_evidence: [],
  },
  {
    id: "decision-release-channel",
    title: "A settled decision with explicit tradeoffs",
    source:
      "Choose whether to release to everyone or use a 10% canary. The canary delays full rollout by one day but limits blast radius. Choose canary because rollback confidence is still low.",
    disposition: "page",
    page_kind: "standing",
    facts: [
      { id: "options", anchors: ["Release to everyone", "10% canary"], required_role: "decision" },
      { id: "cost", anchors: ["one day"], required_role: "decision" },
      { id: "choice", anchors: ["rollback confidence is still low"], required_role: "decision" },
    ],
    expected_roles: [{ role: "decision", min: 1, max: 1 }],
    forbidden_roles: ["approval", "exact-comparison", "narrative"],
    expected_components: [{ component: "decision", min: 1, max: 1 }],
    forbidden_components: ["approval", "table", "grid", "carousel"],
    layout_expectations: [],
    allowed_roles: ["decision"],
    opening_roles: ["decision"],
    max_narrative_share: 0,
    graphic_evidence: [],
  },
  {
    id: "approval-venue-hold",
    title: "An unanswered choice with only the facts needed to approve it",
    source:
      "The venue hold is waiting on a choice between Riverside Hall and Foundry Loft. "
      + "Both venues can hold the requested date until tomorrow afternoon. "
      + "Riverside Hall has more natural light and a longer trip from downtown. "
      + "Foundry Loft is closer to downtown with less outdoor space. "
      + "Ask the owner to choose between the two venue holds.",
    disposition: "page",
    page_kind: "living",
    facts: [
      {
        id: "options",
        anchors: ["Riverside Hall", "Foundry Loft"],
        required_role: "approval",
      },
      {
        id: "hold-deadline",
        anchors: ["tomorrow afternoon"],
        required_role: "approval",
      },
      {
        id: "riverside-distinction",
        anchors: ["Riverside Hall", "natural light", "longer trip", "downtown"],
        required_role: "approval",
      },
      {
        id: "foundry-distinction",
        anchors: ["Foundry Loft", "Closer to downtown", "less outdoor space"],
        required_role: "approval",
      },
    ],
    expected_roles: [{ role: "approval", min: 1, max: 1 }],
    forbidden_roles: ["decision", "exact-comparison", "facts", "narrative"],
    expected_components: [{ component: "approval", min: 1, max: 1 }],
    forbidden_components: [
      "decision",
      "table",
      "carousel",
      "metric",
      "facts",
      "prose",
      "callout",
    ],
    layout_expectations: [],
    allowed_roles: ["approval"],
    opening_roles: ["approval"],
    max_narrative_share: 0,
    graphic_evidence: [],
  },
  {
    id: "evidence-browser-support",
    title: "A conclusion backed by quiet external evidence",
    source:
      "The release can require Baseline 2025 browsers. Support this with the Web Platform Dashboard Baseline page at https://webstatus.dev/baseline and MDN Baseline docs at https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility.",
    disposition: "page",
    page_kind: "standing",
    facts: [
      { id: "conclusion", anchors: ["Baseline 2025"] },
      { id: "web-status", anchors: ["https://webstatus.dev/baseline"], required_role: "evidence" },
      { id: "mdn", anchors: ["https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility"], required_role: "evidence" },
    ],
    expected_roles: [{ role: "evidence", min: 1, max: 1 }],
    forbidden_roles: ["action", "quotation", "narrative"],
    expected_components: [{ component: "reference-list", min: 1, max: 1 }],
    forbidden_components: ["link-button", "quote", "grid", "carousel"],
    layout_expectations: [],
    allowed_roles: ["evidence"],
    opening_roles: ["evidence"],
    max_narrative_share: 0,
    graphic_evidence: [],
  },
  {
    id: "accordion-optional-detail",
    title: "Optional travel policy detail",
    source: "Keep cancellation and parking details available but collapsed: cancellation is free until 48 hours before check-in, and street parking starts after 6pm.",
    disposition: "page",
    page_kind: "standing",
    facts: [
      { id: "cancellation", anchors: ["Cancellation", "48 hours"], required_role: "optional-detail" },
      { id: "parking", anchors: ["Parking", "after 6pm"], required_role: "optional-detail" },
    ],
    expected_roles: [{ role: "optional-detail", min: 1, max: 1 }],
    forbidden_roles: ["facts", "narrative"],
    expected_components: [{ component: "accordion", min: 1, max: 1 }],
    forbidden_components: ["facts", "prose", "callout"],
    layout_expectations: [],
    allowed_roles: ["optional-detail"],
    opening_roles: ["optional-detail", "narrative"],
    max_narrative_share: 1,
    graphic_evidence: [],
  },
  {
    id: "code-block-exact-config",
    title: "Exact deploy configuration",
    source: "Publish this exact configuration without Markdown fencing: PUBLIC_BASE_URL=https://strata.example and POLL_INTERVAL_MS=3000.",
    disposition: "page",
    page_kind: "standing",
    facts: [
      { id: "base-url", anchors: ["PUBLIC_BASE_URL=https://strata.example"], required_role: "code" },
      { id: "poll-interval", anchors: ["POLL_INTERVAL_MS=3000"], required_role: "code" },
    ],
    expected_roles: [{ role: "code", min: 1, max: 1 }],
    forbidden_roles: ["narrative", "values"],
    expected_components: [{ component: "code-block", min: 1, max: 1 }],
    forbidden_components: ["prose", "callout", "facts"],
    layout_expectations: [],
    allowed_roles: ["code"],
    opening_roles: ["code"],
    max_narrative_share: 0,
    graphic_evidence: [],
  },
  {
    id: "facts-readable-facts",
    title: "Short labelled policy facts",
    source: "The rental has two readable facts: cancellation is free until 48 hours before check-in, and check-in is September 12, 2026.",
    disposition: "page",
    page_kind: "standing",
    facts: [
      { id: "cancellation", anchors: ["Cancellation", "48 hours"], required_role: "facts" },
      { id: "check-in", anchors: ["Check-in", "2026-09-12"], required_role: "facts" },
    ],
    expected_roles: [{ role: "facts", min: 1, max: 1 }],
    forbidden_roles: ["optional-detail", "values", "narrative"],
    expected_components: [{ component: "facts", min: 1, max: 1 }],
    forbidden_components: ["accordion", "prose", "callout"],
    layout_expectations: [],
    allowed_roles: ["facts"],
    opening_roles: ["facts", "narrative"],
    max_narrative_share: 1,
    graphic_evidence: [],
  },
  {
    id: "quote-consequential-voice",
    title: "A decision-maker's voice",
    source: "Ada said: We would rather ship one quiet page a day than ten loud ones.",
    disposition: "page",
    page_kind: "standing",
    facts: [
      { id: "words", anchors: ["one quiet page", "ten loud ones"], required_role: "quotation" },
      { id: "speaker", anchors: ["Ada"], required_role: "quotation" },
    ],
    expected_roles: [{ role: "quotation", min: 1, max: 1 }],
    forbidden_roles: ["narrative", "evidence"],
    expected_components: [{ component: "quote", min: 1, max: 1 }],
    forbidden_components: ["prose", "callout", "reference-list"],
    layout_expectations: [],
    allowed_roles: ["quotation"],
    opening_roles: ["quotation", "narrative"],
    max_narrative_share: 1,
    graphic_evidence: [],
  },
  {
    id: "callout-expiring-caveat",
    title: "A foreground expiration caveat",
    source: "Flights are held but not ticketed; the fare quote expires Friday.",
    disposition: "page",
    page_kind: "living",
    facts: [
      { id: "fare-expiry", anchors: ["held", "expires Friday"], required_role: "narrative" },
    ],
    expected_roles: [{ role: "narrative", min: 1, max: 1 }],
    forbidden_roles: ["quotation", "optional-detail", "facts"],
    expected_components: [{ component: "callout", min: 1, max: 1 }],
    forbidden_components: ["quote", "accordion", "facts", "prose"],
    layout_expectations: [],
    allowed_roles: ["narrative"],
    opening_roles: ["narrative"],
    max_narrative_share: 1,
    graphic_evidence: [],
  },
  {
    id: "prose-irreducible-caveat",
    title: "A conditional decision whose causal reasoning must stay connected",
    source:
      "Choose annual billing for the 20% discount, but preserve why the recommendation is conditional as one connected explanation. "
      + "Annual only wins if we expect the workspace to remain open beyond ten months. Current runway can absorb the prepaid year, but there is no prorated refund if the workspace closes mid-year; when that horizon is uncertain, monthly billing's cash flexibility can outweigh the discount. "
      + "Separating those clauses into badges would lose the causal relationship that changes the recommendation.",
    disposition: "page",
    page_kind: "standing",
    facts: [
      { id: "choice", anchors: ["Annual billing", "20%"], required_role: "decision" },
      { id: "prepaid", anchors: ["prepaid"], required_role: "narrative" },
      { id: "refund-caveat", anchors: ["no prorated refund"], required_role: "narrative" },
      { id: "conditional-horizon", anchors: ["beyond ten months", "cash flexibility"], required_role: "narrative" },
    ],
    expected_roles: [
      { role: "decision", min: 1, max: 1 },
      { role: "narrative", min: 1, max: 1 },
    ],
    forbidden_roles: ["exact-comparison", "facts"],
    expected_components: [
      { component: "decision", min: 1, max: 1 },
      { component: "prose", min: 1, max: 1 },
    ],
    forbidden_components: ["callout", "table", "facts", "grid", "carousel"],
    layout_expectations: [],
    allowed_roles: ["decision", "narrative"],
    opening_roles: ["decision"],
    max_narrative_share: 0.65,
    graphic_evidence: [],
  },
  {
    id: "regression-preserved-text-wall",
    title: "Compress the preserved Driftwood text wall without losing the decision",
    source:
      "Driftwood is the closest open-source project to what we need, but it is a reference rather than a base. It has 50+ agent-authored commits on main and about 12.4K lines across the product. Its unrestricted shell execution has no action gate. Read scheduler.md and health-checks.md before building our scheduler. Cite https://example.com/driftwood and https://example.com/driftwood/design/health-checks.md.",
    disposition: "page",
    page_kind: "standing",
    facts: [
      { id: "verdict", anchors: ["reference", "rather than", "base"], required_role: "decision" },
      { id: "commits", anchors: ["50+"], required_role: "scalar-metric" },
      { id: "size", anchors: [12.4, "lines"], required_role: "scalar-metric" },
      { id: "gate", anchors: ["no action gate"], required_role: "decision" },
      {
        id: "reading",
        anchors: ["scheduler.md", "health-checks.md"],
        required_role: "tasks",
      },
      {
        id: "repo",
        anchors: ["https://example.com/driftwood"],
        required_role: "evidence",
      },
    ],
    expected_roles: [
      { role: "decision", min: 1, max: 1 },
      { role: "scalar-metric", min: 2, max: 2 },
      { role: "tasks", min: 1, max: 1 },
      { role: "evidence", min: 1, max: 1 },
    ],
    forbidden_roles: ["facts", "narrative", "trend"],
    expected_components: [
      { component: "section", min: 1, max: 1 },
      { component: "decision", min: 1, max: 1 },
      { component: "grid", min: 1, max: 1 },
      { component: "metric", min: 2, max: 2 },
      { component: "checklist", min: 1, max: 1 },
      { component: "reference-list", min: 1, max: 1 },
    ],
    forbidden_components: ["facts", "prose", "callout", "chart", "carousel"],
    layout_expectations: [
      {
        id: "driftwood-scalars-share-one-grid",
        kind: "compact-peers-grid",
        child_role: "scalar-metric",
        child_count: 2,
      },
      {
        id: "heterogeneous-summary-reads-in-one-section",
        kind: "mixed-content-section",
        child_roles: ["decision", "scalar-metric", "tasks", "evidence"],
        allowed_peer_containers: ["grid"],
      },
    ],
    allowed_roles: ["decision", "scalar-metric", "tasks", "evidence"],
    opening_roles: ["decision"],
    max_narrative_share: 0.35,
    graphic_evidence: [
      {
        id: "driftwood-commits",
        role: "scalar-metric",
        values: ["Agent-authored commits", "50+"],
      },
      {
        id: "driftwood-size",
        role: "scalar-metric",
        values: ["Product size", 12.4, "K lines"],
      },
    ],
    regression_source: "preserved-text-wall",
  },
] as const satisfies readonly CompositionBrief[];

export const GOLDEN_COMPOSITION_CANDIDATES: Readonly<Record<string, unknown>> = {
  "no-page-transient-status": null,

  "scalar-metrics-launch": page(
    "1,284 active teams; weekly retention is 42%.",
    ["launch-metrics"],
    {
      "launch-metrics": {
        type: "grid",
        props: {},
        children: ["active-teams", "weekly-retention"],
      },
      "active-teams": {
        type: "metric",
        props: { label: "Active teams", value: 1_284 },
      },
      "weekly-retention": {
        type: "metric",
        props: { label: "Weekly retention", value: { value: 42, unit: "%" } },
      },
    },
  ),

  "target-progress-migration": page(
    "72 of 100 accounts are migrated; the target is Friday.",
    ["accounts-migrated"],
    {
      "accounts-migrated": {
        type: "progress",
        props: {
          label: "Accounts migrated by Friday",
          current: { value: 72, unit: "accounts" },
          target: { value: 100, unit: "accounts" },
        },
      },
    },
  ),

  "trend-support-volume": page(
    "Support volume rose every month, from 18 tickets in January to 46 in April.",
    ["monthly-tickets"],
    {
      "monthly-tickets": {
        type: "chart",
        props: {
          // Explicit: short category labels would default to bars, but the brief wants the rise.
          presentation: "line",
          labels: ["Jan", "Feb", "Mar", "Apr"],
          series: [{ name: "Tickets", values: [18, 24, 31, 46] }],
          y_label: "tickets",
          y_min: 0,
        },
      },
    },
  ),

  "exact-plan-comparison": page(
    "Pro is the pick: $29 per month for 100 GB, because the team needs more than 10 GB.",
    ["plan-comparison"],
    {
      "plan-comparison": {
        type: "table",
        props: {
          columns: ["", "Basic", "Pro"],
          highlight_column: 2,
          rows: [
            {
              id: "price",
              cells: ["Monthly price", { amount: 12, currency: "USD" }, { amount: 29, currency: "USD" }],
            },
            {
              id: "storage",
              cells: ["Storage", { value: 10, unit: "GB" }, { value: 100, unit: "GB" }],
            },
          ],
        },
      },
    },
  ),

  "queue-launch-blockers": page(
    "Maya and Legal each owe a launch item; production access is blocked and analytics is done.",
    ["launch-queue"],
    {
      "launch-queue": {
        type: "status-list",
        props: {
          items: [
            { id: "privacy-copy", label: "Privacy copy", status: "waiting-on-them", owner: "Maya" },
            { id: "dpa", label: "DPA", status: "waiting-on-them", owner: "Legal", since: "2026-08-24" },
            { id: "production-access", label: "Production access", status: "blocked" },
            { id: "analytics", label: "Analytics", status: "done" },
          ],
        },
      },
    },
  ),

  "trip-upcoming-schedule": page(
    "Lisbon has three complete day plans, from the Sep 12 arrival through Sep 14 in Sintra.",
    ["trip-days"],
    {
      "trip-days": {
        type: "carousel",
        props: {},
        // Carousel children must be cards; each day plan is its card's only child.
        children: ["arrival-day", "alfama-day", "sintra-day"],
      },
      "arrival-day": {
        type: "card",
        props: { title: "Sep 12 · Arrival" },
        children: ["arrival-day-events"],
      },
      "arrival-day-events": {
        type: "timeline",
        props: {
          order: "ascending",
          events: [
            { id: "landing", at: "2026-09-12", time: "14:05", title: "Land in Lisbon", place: "LIS Terminal 1", ref: "TAP 1049" },
            { id: "check-in", at: "2026-09-12", time: "16:00", title: "Check in", place: "Casa do Beco" },
            { id: "dinner", at: "2026-09-12", time: "20:30", title: "Dinner", place: "Taberna da Rua das Flores" },
          ],
        },
      },
      "alfama-day": {
        type: "card",
        props: { title: "Sep 13 · Alfama" },
        children: ["alfama-day-events"],
      },
      "alfama-day-events": {
        type: "timeline",
        props: {
          order: "ascending",
          events: [
            { id: "castle", at: "2026-09-13", time: "09:30", title: "São Jorge Castle" },
            { id: "tram", at: "2026-09-13", time: "12:00", title: "Tram 28" },
            { id: "fado", at: "2026-09-13", time: "21:00", title: "Fado", place: "Mesa de Frades" },
          ],
        },
      },
      "sintra-day": {
        type: "card",
        props: { title: "Sep 14 · Sintra" },
        children: ["sintra-day-events"],
      },
      "sintra-day-events": {
        type: "timeline",
        props: {
          order: "ascending",
          events: [
            { id: "train-out", at: "2026-09-14", time: "08:12", title: "Train to Sintra", place: "Rossio" },
            { id: "pena-palace", at: "2026-09-14", time: "10:00", title: "Pena Palace" },
            { id: "regaleira", at: "2026-09-14", time: "14:30", title: "Quinta da Regaleira" },
            { id: "train-back", at: "2026-09-14", time: "18:40", title: "Train back to Lisbon" },
          ],
        },
      },
    },
  ),

  "chronology-incident-history": page(
    "The rollback finished 14 minutes after the alert; the postmortem was published the next day.",
    ["incident-history"],
    {
      "incident-history": {
        type: "timeline",
        props: {
          order: "descending",
          events: [
            { id: "alert", at: "2026-08-25T09:12:00-04:00", title: "Alert fired" },
            { id: "rollback", at: "2026-08-25T09:26:00-04:00", title: "Rollback completed" },
            { id: "postmortem", at: "2026-08-26", title: "Postmortem published" },
          ],
        },
      },
    },
  ),

  "decision-release-channel": page(
    "Use a 10% canary: it costs one day and limits blast radius while rollback confidence is low.",
    ["release-channel"],
    {
      "release-channel": {
        type: "decision",
        props: {
          question: "How should this release roll out?",
          options: [
            { id: "everyone", label: "Release to everyone", tradeoff: "Fastest, with the full blast radius." },
            { id: "canary", label: "10% canary", tradeoff: "Delays full rollout by one day and limits blast radius." },
          ],
          chosen_id: "canary",
          rationale: "Choose canary because rollback confidence is still low.",
        },
      },
    },
  ),

  "approval-venue-hold": page(
    "The venue hold is waiting on a choice between Riverside Hall and Foundry Loft.",
    ["venue-hold"],
    {
      "venue-hold": {
        type: "approval",
        props: {
          id: "venue-hold",
          question: "Which venue should we hold?",
          // Approval options carry only labels, so the distinctions go in context.
          context:
            "Both hold the requested date until tomorrow afternoon. Riverside Hall has more natural "
            + "light and a longer trip from downtown; Foundry Loft is closer to downtown with less "
            + "outdoor space.",
          options: [
            { id: "riverside", label: "Riverside Hall" },
            { id: "foundry", label: "Foundry Loft" },
          ],
        },
      },
    },
  ),

  "evidence-browser-support": page(
    "The release can require Baseline 2025 browsers; Web Platform Dashboard and MDN support the boundary.",
    ["browser-evidence"],
    {
      "browser-evidence": {
        type: "reference-list",
        props: {
          items: [
            { id: "web-status", title: "Baseline", url: "https://webstatus.dev/baseline", source: "Web Platform Dashboard" },
            { id: "mdn-baseline", title: "Baseline compatibility", url: "https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility", source: "MDN" },
          ],
        },
      },
    },
  ),

  "accordion-optional-detail": page(
    "Cancellation and parking details are available if needed.",
    ["policies"],
    {
      policies: {
        type: "accordion",
        props: {
          items: [
            { id: "cancellation", title: "Cancellation", body: "Free until 48 hours before check-in." },
            { id: "parking", title: "Parking", body: "Street parking only after 6pm." },
          ],
        },
      },
    },
  ),

  "code-block-exact-config": page(
    "The deploy configuration is ready to copy.",
    ["deploy-config"],
    {
      "deploy-config": {
        type: "code-block",
        props: {
          code: "PUBLIC_BASE_URL=https://strata.example\nPOLL_INTERVAL_MS=3000",
          language: "dotenv",
        },
      },
    },
  ),

  "facts-readable-facts": page(
    "The rental's cancellation and check-in terms are confirmed.",
    ["rental-facts"],
    {
      "rental-facts": {
        type: "facts",
        props: {
          items: [
            { id: "cancellation", label: "Cancellation", value: "Free until 48 hours before check-in." },
            { id: "check-in", label: "Check-in", value: "2026-09-12" },
          ],
        },
      },
    },
  ),

  "quote-consequential-voice": page(
    "The product bar favors one quiet useful page over many loud ones.",
    ["product-bar"],
    {
      "product-bar": {
        type: "quote",
        props: {
          text: "We would rather ship one quiet page a day than ten loud ones.",
          attribution: "Ada",
        },
      },
    },
  ),

  "callout-expiring-caveat": page(
    "Flights are held, but the fare quote expires Friday.",
    ["fare-expiry"],
    {
      "fare-expiry": {
        type: "callout",
        props: {
          text: "Flights are held but not ticketed — the fare quote expires Friday.",
          tone: "warning",
        },
      },
    },
  ),

  "prose-irreducible-caveat": page(
    "Choose annual billing for 20% off while the expected operating horizon stays beyond ten months.",
    ["billing-decision", "refund-caveat"],
    {
      "billing-decision": {
        type: "decision",
        props: {
          question: "Which billing cadence should we use?",
          options: [
            { id: "monthly", label: "Monthly billing", tradeoff: "Flexible, at the full price." },
            { id: "annual", label: "Annual billing", tradeoff: "20% discount, prepaid for the year." },
          ],
          chosen_id: "annual",
          rationale: "The 20% discount wins under the current operating horizon.",
        },
      },
      "refund-caveat": {
        type: "prose",
        props: {
          text: "Annual only wins if the workspace remains open beyond ten months. Runway can absorb the prepaid year, so upfront cash is not the blocker. The real risk is irreversibility: there is no prorated refund if the workspace closes mid-year. If that horizon becomes uncertain, monthly cash flexibility can outweigh the discount even at a higher price.",
        },
      },
    },
  ),

  "regression-preserved-text-wall": page(
    "Driftwood is a reference, not a base: 50+ own commits and ~12.4K lines show maturity, but no action gate rules out adoption.",
    ["adoption-decision", "driftwood-metrics", "next-reading", "sources"],
    {
      "adoption-decision": {
        type: "decision",
        props: {
          question: "Should we adopt Driftwood as our base?",
          options: [
            { id: "base", label: "Adopt it", tradeoff: "Reuse the loop but inherit unrestricted shell execution." },
            { id: "reference", label: "Use it as a reference", tradeoff: "Keep typed seams and borrow only proven lessons." },
          ],
          chosen_id: "reference",
          rationale: "Use Driftwood as a reference rather than a base: it has no action gate, so adopting it would mean adding approvals from scratch.",
        },
      },
      "driftwood-metrics": {
        type: "grid",
        props: {},
        children: ["agent-authored-commits", "product-size"],
      },
      "agent-authored-commits": {
        type: "metric",
        props: { label: "Agent-authored commits", value: "50+" },
      },
      "product-size": {
        type: "metric",
        props: { label: "Product size", value: { value: 12.4, unit: "K lines" } },
      },
      "next-reading": {
        type: "checklist",
        props: {
          items: [
            { id: "backoff", label: "Read scheduler.md before building our scheduler.", done: false },
            { id: "run-health", label: "Read health-checks.md for failures already paid for.", done: false },
          ],
        },
      },
      sources: {
        type: "reference-list",
        props: {
          items: [
            { id: "repo", title: "Driftwood", url: "https://example.com/driftwood", source: "Driftwood" },
            { id: "run-health-source", title: "health-checks.md", url: "https://example.com/driftwood/design/health-checks.md", source: "Driftwood design" },
          ],
        },
      },
    },
  ),
};
