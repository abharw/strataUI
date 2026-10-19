/** Spec schema tests: JSON Render boundary, structure, and the text budget. */
import { describe, expect, it } from "vitest";

import { move, releaseReview, triathlon, trip } from "@/page-content/document/fixtures";
import { textWall } from "@/test/fixtures/text-wall";
import {
  MAX_APPROVAL_CONTEXT_CHARS,
  MAX_APPROVAL_COPY_CHARS,
  MAX_CHOICE_LABEL_CHARS,
  MAX_CHOICE_QUESTION_CHARS,
  MAX_COLLECTION_TEXT_CHARS,
  MAX_METRIC_VALUE_CHARS,
  MAX_PROSE_CHARS,
  MAX_RATIONALE_CHARS,
  MAX_TRADEOFF_CHARS,
  PAGE_TEXT_BUDGET,
} from "@/page-content/document/limits";
import type { PageKind } from "@/page-content/document/types";
import { specSchemaFor } from "./schema";
import { COMPONENT_NAMES, validateProps } from "./catalog";
import { strataCatalog } from "@/page-content/json-render/catalog";
import { type StrataSpecNarrowsSpec, StrataSpecSchema } from "./schema";

type Element = { type: string; props: Record<string, unknown> };

/** A page whose root holds these elements in order, with a valid answer. */
function pageOf(elements: Record<string, Element>, extra: Record<string, unknown> = {}): unknown {
  return {
    answer: { verdict: "Everything is where it should be." },
    root: "root",
    elements: {
      root: { type: "section", props: {}, children: Object.keys(elements) },
      ...elements,
    },
    ...extra,
  };
}

function issuesFor(spec: unknown, kind: PageKind = "living"): string[] {
  const result = specSchemaFor(kind).safeParse(spec);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

/** `count` characters of plain words. */
function words(count: number): string {
  const sentence = "The quote holds until Friday and the elevator is booked for the morning. ";
  return sentence.repeat(Math.ceil(count / sentence.length)).slice(0, count);
}

const LEAN = pageOf({
  "hours-this-week": { type: "metric", props: { label: "Hours", value: { value: 8.5, unit: "h" } } },
  "open-loops": {
    type: "status-list",
    props: {
      items: [
        { id: "wetsuit", label: "Reserve a wetsuit", status: "waiting-on-you", since: "2026-08-14" },
        { id: "bike-fit", label: "Bike fit", status: "waiting-on-them", owner: "Ride Studio", note: "Thursday slot promised." },
      ],
    },
  },
  details: {
    type: "facts",
    props: {
      items: [
        { id: "race-day", label: "Race day", value: "2026-10-04" },
        { id: "taper", label: "Taper", value: "Ten days, starting after the dress rehearsal." },
      ],
    },
  },
});

describe("JSON Render boundary", () => {
  it.each([
    ["triathlon", triathlon],
    ["trip", trip],
    ["release review", releaseReview],
    ["move", move],
  ])("validates the canonical %s fixture with stable identity and composition", (_name, document) => {
    // catalog.validate() strips runtime fields and still succeeds (upstream #222);
    // StrataSpecSchema is the real boundary.
    expect(strataCatalog.validate(document.spec).success).toBe(true);
    expect(StrataSpecSchema.safeParse(document.spec).success).toBe(true);
    expect(document.spec.elements[document.spec.root]?.type).toBe("section");
    expect(document.spec.elements[document.spec.root]?.props.title).toBeUndefined();
  });

  it("emits canonical JSON Render children arrays for leaf elements", () => {
    expect(triathlon.spec.elements["longest-ride"]?.children).toEqual([]);
  });

  it("preserves the standing answer through catalog validation", () => {
    const result = strataCatalog.validate(triathlon.spec);
    expect(result.success).toBe(true);
    expect(result.data?.answer).toEqual(triathlon.spec.answer);
  });

  it("requires the standing answer in the generated catalog schema", () => {
    const jsonSchema = strataCatalog.jsonSchema() as {
      required?: string[];
      properties?: { answer?: { required?: string[] } };
    };
    expect(jsonSchema.required).toContain("answer");
    expect(jsonSchema.properties?.answer?.required).toContain("verdict");
  });

  it("uses the same component names as the authoritative catalog", () => {
    expect([...strataCatalog.componentNames].sort()).toEqual([...COMPONENT_NAMES].sort());
  });

  it("rejects model-authored runtime and styling fields", () => {
    const base = triathlon.spec;
    expect(StrataSpecSchema.safeParse({ ...base, state: {} }).success).toBe(false);
    expect(
      StrataSpecSchema.safeParse({
        ...base,
        elements: {
          ...base.elements,
          [base.root]: { ...base.elements[base.root], visible: true },
        },
      }).success,
    ).toBe(false);
    expect(validateProps("section", { columns: 1, className: "fixed inset-0" }).ok).toBe(false);
    expect(validateProps("callout", { text: "hello", style: { color: "red" } }).ok).toBe(false);
  });

  it("enforces composition in the spec rather than relying on a prompt", () => {
    expect(
      StrataSpecSchema.safeParse({
        root: "root",
        elements: {
          root: { type: "metric", props: { label: "x", value: 1 }, children: ["leaf"] },
          leaf: { type: "callout", props: { text: "hello" }, children: [] },
        },
      }).success,
    ).toBe(false);
    expect(
      StrataSpecSchema.safeParse({
        root: "root",
        elements: {
          root: { type: "section", props: {}, children: ["cards"] },
          cards: { type: "carousel", props: {}, children: ["a", "b"] },
          a: { type: "checklist", props: { items: [] }, children: [] },
          b: { type: "callout", props: { text: "not a card" }, children: [] },
        },
      }).success,
    ).toBe(false);

    // A chart is not allowed in a half-width grid cell.
    expect(
      StrataSpecSchema.safeParse({
        root: "root",
        elements: {
          root: { type: "section", props: {}, children: ["grid"] },
          "grid": { type: "grid", props: {}, children: ["metric", "chart"] },
          metric: {
            type: "metric",
            props: { label: "Hours", value: 8 },
            children: [],
          },
          chart: {
            type: "chart",
            props: {
              labels: ["Mon", "Tue"],
              series: [{ name: "Hours", values: [1, 2] }],
            },
            children: [],
          },
        },
      }).success,
    ).toBe(false);

    // Progress is allowed in a grid cell.
    expect(
      StrataSpecSchema.safeParse({
        root: "root",
        answer: { verdict: "One target is halfway done." },
        elements: {
          root: { type: "section", props: {}, children: ["grid"] },
          "grid": { type: "grid", props: {}, children: ["a", "b"] },
          a: { type: "progress", props: { label: "Weekly volume", current: 1, target: 2 }, children: [] },
          b: { type: "progress", props: { label: "Packing", current: 3, target: 6 }, children: [] },
        },
      }).success,
    ).toBe(true);

    expect(
      StrataSpecSchema.safeParse({
        root: "root",
        answer: { verdict: "Two cards, side by side." },
        elements: {
          root: { type: "section", props: {}, children: ["grid"] },
          "grid": { type: "grid", props: {}, children: ["a", "b"] },
          a: { type: "metric", props: { label: "A", value: 1 }, children: [] },
          b: { type: "metric", props: { label: "B", value: 2 }, children: [] },
        },
      }).success,
    ).toBe(true);
  });

  it("accepts a cover card with no children only when it has a title or media", () => {
    const withTitle = StrataSpecSchema.safeParse({
      root: "root",
      answer: { verdict: "A cover card with no children." },
      elements: {
        root: { type: "section", props: {}, children: ["carousel"] },
        carousel: { type: "carousel", props: {}, children: ["cover"] },
        cover: { type: "card", props: { title: "Maple Street" }, children: [] },
      },
    });
    expect(withTitle.success).toBe(true);

    const bare = StrataSpecSchema.safeParse({
      root: "root",
      answer: { verdict: "A cover card with nothing at all." },
      elements: {
        root: { type: "section", props: {}, children: ["carousel"] },
        carousel: { type: "carousel", props: {}, children: ["cover"] },
        cover: { type: "card", props: {}, children: [] },
      },
    });
    expect(bare.success).toBe(false);
    if (!bare.success) {
      expect(bare.error.issues.some((issue) => issue.message.includes("needs title or media"))).toBe(true);
    }
  });

  it("caps grid and carousel children and refuses non-card carousel peers", () => {
    const wideGrid = StrataSpecSchema.safeParse({
      root: "root",
      answer: { verdict: "Nine metrics is one too many." },
      elements: {
        root: { type: "section", props: {}, children: ["grid"] },
        grid: {
          type: "grid",
          props: {},
          children: Array.from({ length: 9 }, (_, index) => `m${index}`),
        },
        ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => [
          `m${index}`,
          { type: "metric", props: { label: `M${index}`, value: index }, children: [] },
        ])),
      },
    });
    expect(wideGrid.success).toBe(false);
    if (!wideGrid.success) {
      expect(wideGrid.error.issues.some((issue) => issue.message.includes("grid has 9 children"))).toBe(true);
    }
  });

  it("accepts the spec-root sequence linking to another page", () => {
    const spec = pageOf({ status: { type: "metric", props: { label: "Status", value: "Open" } } }, {
      sequence: { previous: { page: "3c7e5b90-1a44-4d62-8f0b-9ad2e6c71455" }, next: { url: "https://example.com/next" } },
    });
    expect(issuesFor(spec)).toEqual([]);
  });

  it("accepts a sequence position only beside a page-typed up", () => {
    const status = { status: { type: "metric" as const, props: { label: "Status", value: "Open" } } };
    const parent = "3c7e5b90-1a44-4d62-8f0b-9ad2e6c71455";

    expect(issuesFor(pageOf(status, { sequence: { up: { page: parent }, position: 3 } }))).toEqual([]);

    const noUp = issuesFor(pageOf(status, { sequence: { position: 3 } }));
    expect(noUp.some((message) => message.includes("needs up to be a { page } link"))).toBe(true);

    const urlUp = issuesFor(pageOf(status, { sequence: { up: { url: "https://example.com/plan" }, position: 3 } }));
    expect(urlUp.some((message) => message.includes("a url has no children"))).toBe(true);

    for (const position of [0, 1.5, 251]) {
      expect(issuesFor(pageOf(status, { sequence: { up: { page: parent }, position }})), String(position)).not.toEqual([]);
    }
  });
});

describe("high-value semantic schemas", () => {
  it("allows one primary link-button and refuses competing actions", () => {
    const one = pageOf({
      action: { type: "link-button", props: { label: "Open brief", url: "https://example.com/brief" } },
    });
    expect(issuesFor(one)).toEqual([]);

    const two = pageOf({
      action: { type: "link-button", props: { label: "Open brief", url: "https://example.com/brief" } },
      other: { type: "link-button", props: { label: "Open source", url: "https://example.com/source" } },
    });
    expect(issuesFor(two).find((message) => message.includes("at most one link-button")))
      .toContain("other");
  });

  it("keeps metric values glanceable", () => {
    expect(validateProps("metric", {
      label: "Status",
      value: "x".repeat(MAX_METRIC_VALUE_CHARS),
    }).ok).toBe(true);
    expect(validateProps("metric", {
      label: "Status",
      value: "x".repeat(MAX_METRIC_VALUE_CHARS + 1),
    }).ok).toBe(false);
    expect(validateProps("metric", {
      label: "Revenue",
      value: 1_000_000_000_000,
    }).ok).toBe(false);
    expect(validateProps("metric", {
      label: "Distance",
      value: { value: 12, unit: "characters-far-too-long-for-a-display-unit" },
    }).ok).toBe(false);
  });

  it("accepts area charts and rejects misleading/incoherent series", () => {
    expect(
      validateProps("chart", {
        presentation: "area",
        labels: ["Mon", "Tue"],
        series: [{ name: "Volume", values: [4, 7] }],
        y_min: 0,
        y_max: 10,
      }).ok,
    ).toBe(true);
    expect(
      validateProps("chart", {
        presentation: "line",
        labels: ["Mon", "Tue"],
        series: [{ name: "Volume", values: [4] }],
      }).ok,
    ).toBe(false);
    // Series are keyed by `name`, so the generic id rule does not cover them.
    expect(
      validateProps("chart", {
        presentation: "bar",
        labels: ["A"],
        series: [
          { name: "Same", values: [1] },
          { name: "Same", values: [2] },
        ],
      }).ok,
    ).toBe(false);
    // A bar chart's floor is derived, so an explicit one is ignored, not refused.
    expect(
      validateProps("chart", {
        presentation: "bar",
        labels: ["Mon", "Tue"],
        series: [{ name: "Volume", values: [4, 7] }],
        y_min: 3,
      }).ok,
    ).toBe(true);
  });

  it("requires rectangular tables with in-range column references", () => {
    expect(validateProps("table", { columns: ["A", "B"], rows: [{ id: "r", cells: [1] }] }).ok)
      .toBe(false);
    expect(
      validateProps("table", {
        columns: ["A"],
        rows: [{ id: "r", cells: [1] }],
        copyable_columns: [1],
      }).ok,
    ).toBe(false);
  });

  it("dedupes a repeated copyable column instead of refusing it", () => {
    const result = validateProps("table", {
      columns: ["Code", "Name"],
      rows: [{ id: "r", cells: ["A1B2", "Ada"] }],
      copyable_columns: [0, 0, 1, 0],
    });
    expect(result.ok).toBe(true);
  });

  it("leaves duplicate row ids to the generic collection rule", () => {
    // Exactly one issue: the page-level rule owns duplicate ids.
    const issues = specSchemaFor("living").safeParse({
      answer: { verdict: "Two rows share an address." },
      root: "root",
      elements: {
        root: { type: "section", props: {}, children: ["prices"] },
        prices: {
          type: "table",
          props: {
            columns: ["Option", "Price"],
            rows: [
              { id: "tap", cells: ["TAP", 412] },
              { id: "tap", cells: ["Iberia", 389] },
            ],
          },
          children: [],
        },
      },
    });
    expect(issues.success).toBe(false);
    if (!issues.success) {
      const duplicates = issues.error.issues.filter(({ message }) => message.includes("is duplicated"));
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].message).toContain("an id is how a later write addresses its item");
    }
  });

  it("models attachments as host resource ids and rejects URLs", () => {
    const item = {
      id: "guide",
      resource_id: "asset_guide",
      label: "Guide.pdf",
      kind: "document",
    };
    expect(validateProps("attachment-list", { items: [item] }).ok).toBe(true);
    expect(
      validateProps("attachment-list", {
        items: [{ ...item, href: "https://example.com/guide.pdf" }],
      }).ok,
    ).toBe(false);
    expect(
      validateProps("attachment-list", {
        items: [{ ...item, kind: "video", media_type: "video/mp4" }],
      }).ok,
    ).toBe(false);
  });

  it("keeps approvals and decisions inside their model-facing choice contract", () => {
    const fiveOptions = Array.from({ length: 5 }, (_, index) => ({
      id: `option-${index}`,
      label: `Option ${index + 1}`,
    }));

    expect(
      validateProps("approval", {
        id: "booking",
        question: "Book it?",
        options: [{ id: "yes", label: "Yes" }],
      }).ok,
    ).toBe(false);
    expect(
      validateProps("approval", {
        id: "booking",
        question: "Book it?",
        options: fiveOptions,
      }).ok,
    ).toBe(false);
    expect(
      validateProps("decision", {
        question: "Which route?",
        options: [
          { id: "north", label: "North" },
          { id: "south", label: "South" },
        ],
        chosen_id: "missing",
      }).ok,
    ).toBe(false);
    expect(
      validateProps("decision", {
        question: "Which route?",
        options: fiveOptions,
      }).ok,
    ).toBe(false);
    // A chosen option requires a rationale.
    expect(
      validateProps("decision", {
        question: "Which route?",
        options: [
          { id: "north", label: "North" },
          { id: "south", label: "South" },
        ],
        chosen_id: "north",
      }).ok,
    ).toBe(false);
    expect(
      validateProps("decision", {
        question: "Which route?",
        options: [
          { id: "north", label: "North" },
          { id: "south", label: "South" },
        ],
        chosen_id: "north",
        rationale: "North keeps the elevation gain under the week's cap.",
      }).ok,
    ).toBe(true);
  });

  it("makes concise choice copy a model-facing schema contract", () => {
    const approval = {
      id: "booking",
      question: "q".repeat(MAX_CHOICE_QUESTION_CHARS),
      options: [
        { id: "north", label: "n".repeat(MAX_CHOICE_LABEL_CHARS) },
        { id: "south", label: "South" },
      ],
    };
    expect(validateProps("approval", approval).ok).toBe(true);
    expect(validateProps("approval", {
      ...approval,
      question: "q".repeat(MAX_CHOICE_QUESTION_CHARS + 1),
    }).ok).toBe(false);
    expect(validateProps("approval", {
      ...approval,
      options: [
        { ...approval.options[0], label: "n".repeat(MAX_CHOICE_LABEL_CHARS + 1) },
        approval.options[1],
      ],
    }).ok).toBe(false);
    // Approval options carry only a label.
    expect(validateProps("approval", {
      ...approval,
      options: [{ ...approval.options[0], tradeoff: "Shorter drive." }, approval.options[1]],
    }).ok).toBe(false);
    expect(validateProps("approval", {
      id: "booking",
      question: "Book it?",
      context: "c".repeat(MAX_APPROVAL_CONTEXT_CHARS + 1),
      options: [
        { id: "yes", label: "Yes" },
        { id: "no", label: "No" },
      ],
    }).ok).toBe(false);
    expect(validateProps("approval", {
      id: "booking",
      question: "Book it?",
      context: " The quote holds until Friday. ",
      options: [
        { id: "yes", label: "Yes" },
        { id: "no", label: "No" },
      ],
    }).ok).toBe(false);
    const exactTotal = {
      id: "route",
      question: "q".repeat(80),
      context: "c".repeat(160),
      options: [
        { id: "north", label: "n".repeat(20) },
        { id: "south", label: "s".repeat(20) },
        { id: "east", label: "e".repeat(20) },
        { id: "west", label: "w".repeat(20) },
      ],
    };
    expect(80 + 160 + 20 * 4).toBe(MAX_APPROVAL_COPY_CHARS);
    expect(validateProps("approval", exactTotal).ok).toBe(true);
    expect(validateProps("approval", {
      ...exactTotal,
      context: `${exactTotal.context}c`,
    }).ok).toBe(false);

    const decision = {
      question: "Which route?",
      options: [
        { id: "north", label: "North", tradeoff: "Steeper but shorter." },
        { id: "south", label: "South", tradeoff: "Flatter but longer." },
      ],
    };
    expect(validateProps("decision", {
      ...decision,
      question: "q".repeat(MAX_CHOICE_QUESTION_CHARS + 1),
    }).ok).toBe(false);
    expect(validateProps("decision", {
      ...decision,
      options: [
        { ...decision.options[0], label: "n".repeat(MAX_CHOICE_LABEL_CHARS + 1) },
        decision.options[1],
      ],
    }).ok).toBe(false);
    expect(validateProps("decision", {
      ...decision,
      options: [
        { ...decision.options[0], tradeoff: "t".repeat(MAX_TRADEOFF_CHARS + 1) },
        decision.options[1],
      ],
    }).ok).toBe(false);
    expect(validateProps("decision", {
      ...decision,
      chosen_id: "north",
      rationale: "r".repeat(MAX_RATIONALE_CHARS + 1),
    }).ok).toBe(false);
    expect(validateProps("decision", {
      ...decision,
      question: " Which route? ",
    }).ok).toBe(false);
  });

  it("stays a narrowing of core's Spec", () => {
    // Fails to compile if StrataSpec stops being assignable to Spec.
    const narrows: StrataSpecNarrowsSpec = true;
    expect(narrows).toBe(true);
  });
});

describe("children is optional on a leaf", () => {
  it("accepts a spec whose leaves omit children and fills them in", () => {
    const result = StrataSpecSchema.safeParse({
      root: "page",
      answer: { verdict: "Renovation is on track." },
      elements: {
        page: { type: "section", props: {}, children: ["count", "lead"] },
        lead: { type: "prose", props: { text: "Where the kitchen stands." } },
        count: { type: "metric", props: { label: "Days left", value: 9 } },
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.elements.lead.children).toEqual([]);
    expect(result.data.elements.count.children).toEqual([]);
  });

  it("still refuses children on a leaf that names one", () => {
    const result = StrataSpecSchema.safeParse({
      root: "page",
      elements: {
        page: { type: "section", props: {}, children: ["lead"] },
        lead: { type: "prose", props: { text: "x" }, children: ["count"] },
        count: { type: "metric", props: { label: "a", value: 1 }, children: [] },
      },
    });
    expect(result.success).toBe(false);
  });
});


describe("page text budget", () => {
  it("accepts a lean page", () => {
    expect(issuesFor(LEAN)).toEqual([]);
  });

  it("accepts every shipped fixture against its own cadence", () => {
    for (const fixture of [triathlon, trip, releaseReview, move]) {
      expect(issuesFor(fixture.spec, fixture.meta.kind), fixture.meta.slug).toEqual([]);
    }
  });

  it("refuses a page over its budget, naming the cap, the count, and the way out", () => {
    const [first] = issuesFor(textWall);
    expect(first).toContain("characters of visible text");
    expect(first).toContain(`a living page's budget is ${PAGE_TEXT_BUDGET.living.toLocaleString("en-US")}`);
    expect(first).toMatch(/Cut [\d,]+ characters/);
    expect(first).toContain("move the background or the full account to a second page");
  });

  it("gives a standing page the room a living page does not have", () => {
    const long = pageOf({
      status: { type: "metric", props: { label: "Status", value: "Open" } },
      history: {
        type: "timeline",
        props: {
          order: "descending",
          events: Array.from({ length: 12 }, (_, index) => ({
            id: `event-${index}`,
            at: "2026-08-19",
            title: words(60),
            note: words(100),
          })),
        },
      },
    });
    // 12 events of 160 characters: past a living page, inside a standing one.
    expect(issuesFor(long, "living").join(" ")).toContain("a living page's budget is 1,500");
    expect(issuesFor(long, "standing").filter((issue) => issue.includes("page's budget"))).toEqual([]);
  });

  it("counts neither code-block code nor approval context toward the page budget - but both keep their own caps", () => {
    const exempt = pageOf({
      decision: {
        type: "approval",
        props: {
          id: "install",
          question: "Which install window?",
          // Exempt from pageTextChars, bounded by MAX_APPROVAL_CONTEXT_CHARS.
          context: words(MAX_APPROVAL_CONTEXT_CHARS),
          options: [
            { id: "saturday", label: "Saturday morning" },
            { id: "monday", label: "Monday afternoon" },
          ],
        },
      },
      config: { type: "code-block", props: { code: words(4_000), language: "text" } },
    });
    expect(issuesFor(exempt)).toEqual([]);
  });
});

describe("per-collection text cap", () => {
  it("refuses a list whose items add up to a wall", () => {
    const spec = pageOf({
      status: { type: "metric", props: { label: "Status", value: "Open" } },
      facts: {
        type: "facts",
        props: {
          items: Array.from({ length: 5 }, (_, index) => ({
            id: `fact-${index}`,
            label: "Fact",
            value: words(150),
          })),
        },
      },
    });
    const collection = issuesFor(spec).find((issue) => issue.includes("one collection may hold"));
    expect(collection).toContain("The 5 items in facts \"facts\" hold 770 characters");
    expect(collection).toContain(`one collection may hold ${MAX_COLLECTION_TEXT_CHARS}`);
    expect(collection).toContain("A list is scanned, not read");
  });

  it("leaves one list split across same-type siblings that fits between them", () => {
    const spec = pageOf({
      status: { type: "metric", props: { label: "Status", value: "Open" } },
      "facts-a": { type: "facts", props: { items: [{ id: "a-0", label: "Fact", value: words(150) }] } },
      "facts-b": { type: "facts", props: { items: [{ id: "b-0", label: "Fact", value: words(150) }] } },
    });
    expect(issuesFor(spec)).toEqual([]);
  });

  it("refuses a list split across same-type siblings that no half exceeds", () => {
    const half = (prefix: string) => ({
      type: "facts",
      props: {
        items: Array.from({ length: 2 }, (_, index) => ({
          id: `${prefix}-${index}`,
          label: "Fact",
          value: words(150),
        })),
      },
    });
    const spec = pageOf({
      status: { type: "metric", props: { label: "Status", value: "Open" } },
      "facts-a": half("a"),
      "facts-b": half("b"),
    });
    const issues = issuesFor(spec);
    // 308 characters each: neither block is over the cap on its own.
    expect(issues.filter((issue) => issue.includes("one collection may hold"))).toEqual([]);
    const sibling = issues.find((issue) => issue.includes("same-type siblings"));
    expect(sibling).toContain("The 2 facts elements under \"root\" (facts-a, facts-b) hold 616 characters");
    expect(sibling).toContain(`share one ${MAX_COLLECTION_TEXT_CHARS}-character collection budget`);
  });

  it("leaves a list that fits alone", () => {
    const spec = pageOf({
      status: { type: "metric", props: { label: "Status", value: "Open" } },
      facts: {
        type: "facts",
        props: {
          items: Array.from({ length: 3 }, (_, index) => ({
            id: `fact-${index}`,
            label: "Fact",
            value: words(150),
          })),
        },
      },
    });
    expect(issuesFor(spec)).toEqual([]);
  });
});

describe("per-field text caps", () => {
  const cases: { name: string; cap: number; element: Element }[] = [
    {
      name: "facts value",
      cap: 200,
      element: { type: "facts", props: { items: [{ id: "a", label: "Fact", value: words(201) }] } },
    },
    {
      name: "facts label",
      cap: 48,
      element: { type: "facts", props: { items: [{ id: "a", label: words(49), value: "Short." }] } },
    },
    {
      name: "checklist label",
      cap: 80,
      element: { type: "checklist", props: { items: [{ id: "a", label: words(81), done: false }] } },
    },
    {
      name: "decision tradeoff",
      cap: 120,
      element: {
        type: "decision",
        props: {
          question: "Which apartment?",
          options: [
            { id: "bergen", label: "Bergen", tradeoff: words(121) },
            { id: "carroll", label: "Carroll" },
          ],
        },
      },
    },
    {
      name: "decision rationale",
      cap: 200,
      element: {
        type: "decision",
        props: {
          question: "Which apartment?",
          options: [{ id: "bergen", label: "Bergen" }, { id: "carroll", label: "Carroll" }],
          chosen_id: "bergen",
          rationale: words(201),
        },
      },
    },
    {
      name: "callout text",
      cap: 240,
      element: { type: "callout", props: { text: words(241), tone: "note" } },
    },
    {
      name: "timeline note",
      cap: 120,
      element: { type: "timeline", props: { order: "descending", events: [{ id: "a", at: "2026-08-19", title: "Quote", note: words(121) }] } },
    },
    {
      name: "status-list note",
      cap: 120,
      element: {
        type: "status-list",
        props: { items: [{ id: "a", label: "Bike fit", status: "blocked", note: words(121) }] },
      },
    },
    {
      name: "reference-list note",
      cap: 120,
      element: {
        type: "reference-list",
        props: { items: [{ id: "a", title: "Catalogs", url: "https://json-render.dev/docs", note: words(121) }] },
      },
    },
    {
      name: "metric label",
      cap: 32,
      element: { type: "metric", props: { label: words(33), value: 4 } },
    },
    {
      name: "metric value",
      cap: MAX_METRIC_VALUE_CHARS,
      element: { type: "metric", props: { label: "Status", value: words(MAX_METRIC_VALUE_CHARS + 1) } },
    },
  ];

  for (const { name, cap, element } of cases) {
    it(`refuses ${name} over ${cap}`, () => {
      const over = issuesFor(pageOf({ status: { type: "metric", props: { label: "Status", value: "Open" } }, subject: element }))
        .find((issue) => issue.includes(`the cap is ${cap}`));
      expect(over, name).toBeDefined();
      expect(over).toContain(name);
      expect(over).toContain(`${cap + 1} characters`);
      expect(over).toContain("or move it to a second page");
    });
  }

  it("accepts each of those fields at exactly its cap", () => {
    for (const { cap, element, name } of cases) {
      const at = JSON.parse(JSON.stringify(element).replaceAll(words(cap + 1), words(cap))) as Element;
      expect(
        issuesFor(pageOf({ status: { type: "metric", props: { label: "Status", value: "Open" } }, subject: at })),
        name,
      ).toEqual([]);
    }
  });
});

describe("prose constraints", () => {
  const status: Element = { type: "metric", props: { label: "Status", value: "Open" } };

  it("caps one passage", () => {
    const issue = issuesFor(pageOf({ status, story: { type: "prose", props: { text: words(MAX_PROSE_CHARS + 1) } } }))
      .find((message) => message.includes("prose text"));
    expect(issue).toContain(`the cap is ${MAX_PROSE_CHARS}`);
  });

  it("allows one prose element and refuses the second", () => {
    const one = pageOf({ status, story: { type: "prose", props: { text: "The lease is signed." } } });
    expect(issuesFor(one)).toEqual([]);

    const two = pageOf({
      status,
      story: { type: "prose", props: { text: "The lease is signed." } },
      aside: { type: "prose", props: { text: "The movers are confirmed." } },
    });
    const issue = issuesFor(two).find((message) => message.includes("prose elements"));
    expect(issue).toContain("This page has 2 prose elements (aside, story); a page may have 1");
  });

  it("refuses prose as the root's first child", () => {
    const opening = pageOf({ lead: { type: "prose", props: { text: "Driftwood is the closest shipped thing." } }, status });
    const issue = issuesFor(opening).find((message) => message.includes("first child"));
    expect(issue).toContain('The root\'s first child "lead" is prose');
    expect(issue).toContain("a chart, timeline, comparison, or focused peer can lead");
    expect(issue).toContain("Preserve the explanation's qualifications in prose below it");
    expect(issue).toContain("do not invent a metric");
  });
});

describe("the answer field", () => {
  it("is required, and says how to add one", () => {
    const spec = pageOf({ status: { type: "metric", props: { label: "Status", value: "Open" } } }) as Record<string, unknown>;
    delete spec.answer;
    const issue = issuesFor(spec).find((message) => message.includes("`answer`"));
    expect(issue).toContain("This spec has no `answer`");
    expect(issue).toContain('"verdict"');
    expect(issue).toContain("not this write's summary");
  });

  it("holds the verdict to one line", () => {
    const spec = pageOf(
      { status: { type: "metric", props: { label: "Status", value: "Open" } } },
      { answer: { verdict: words(141) } },
    );
    expect(issuesFor(spec).join(" ")).toContain("at most 140 characters");
  });

  it("takes a verdict and nothing else - a dated answer states its day in the text", () => {
    const status = { status: { type: "metric", props: { label: "Status", value: "Open" } } };
    expect(issuesFor(pageOf(status, { answer: { verdict: "On track.", note: "extra" } })).length)
      .toBeGreaterThan(0);
    // `as_of` is not a field; dates belong in the verdict text.
    expect(issuesFor(pageOf(status, { answer: { verdict: "On track.", as_of: "2026-08-25" } })).length)
      .toBeGreaterThan(0);
  });
});

describe("write-edge refusals", () => {
  it("refuses a page whose root has no children", () => {
    const issues = issuesFor(pageOf({}));
    expect(issues.some((message) => message.includes("a message, not a page"))).toBe(true);
  });

  it("names the duplicated collection item id", () => {
    const issues = issuesFor(
      pageOf({
        "open-loops": {
          type: "status-list",
          props: {
            items: [
              { id: "wetsuit", label: "Reserve a wetsuit", status: "waiting-on-you" },
              { id: "wetsuit", label: "Reserve the other wetsuit", status: "blocked" },
            ],
          },
        },
      }),
    );
    expect(issues.some((message) => message.includes('item id "wetsuit" is duplicated'))).toBe(true);
  });

  it("bounds metric units to a short display label", () => {
    const issues = issuesFor(
      pageOf({
        metric: {
          type: "metric",
          props: { label: "Distance", value: { value: 42, unit: "u".repeat(33) } },
        },
      }),
    );
    expect(issues.some((message) => message.includes("<=32 characters"))).toBe(true);
  });

  it("names the shapes a display value accepts instead of saying \"Invalid input\"", () => {
    const issues = issuesFor(
      pageOf({
        facts: {
          type: "facts",
          props: { items: [{ id: "fare", label: "Fare", value: { amount: 240 } }] },
        },
      }),
    );
    expect(issues.some((message) => message.includes("money {amount, currency}"))).toBe(true);
    expect(issues).not.toContain("Invalid input");
  });

  it("says why a progress value has to be arithmetic", () => {
    const issues = issuesFor(
      pageOf({
        training: { type: "progress", props: { label: "Training", current: "8 hours", target: 11 } },
      }),
    );
    expect(issues.some((message) => message.includes("it has to be arithmetic"))).toBe(true);
  });

  it("sends JSON Render's own element fields back to where they belong", () => {
    const issues = issuesFor(
      pageOf({
        note: { type: "callout", props: { text: "Booked", visible: "$state.open", children: ["nope"] } },
      }),
    );
    expect(issues.some((message) => message.includes('"visible" is a JSON Render element field'))).toBe(true);
    expect(issues.some((message) => message.includes('"children" belongs beside "props"'))).toBe(true);
    // Misplaced element fields are not reported twice.
    expect(issues.filter((message) => message.includes("Unrecognized key"))).toEqual([]);
  });

  it("requires a bounded MIME type on attachments", () => {
    const issues = issuesFor(
      pageOf({
        files: {
          type: "attachment-list",
          props: {
            items: [{
              id: "plan",
              resource_id: "asset-plan",
              label: "Plan",
              kind: "document",
              media_type: "this is not a mime type",
            }],
          },
        },
      }),
    );
    expect(issues.some((message) => message.includes("MIME type"))).toBe(true);
  });
});
