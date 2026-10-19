/** Guidance checks: advisories stay soft; objective failures require repair. */
import { describe, expect, it } from "vitest";

import type { StrataSpec } from "@/page-content/schema";
import { specSchemaFor } from "@/page-content/schema";
import { move, triathlon } from "@/page-content/document/fixtures";
import { addressDrift, guidanceIssues, guidanceWarnings, repairRequiredIssues } from "./guidance";

type Element = { type: string; props: Record<string, unknown>; children?: string[] };

/** Build a page and hold it to the same schema a write would. */
function accepted(elements: Record<string, Element>, children = Object.keys(elements)): StrataSpec {
  const result = specSchemaFor("living").safeParse({
    answer: { verdict: "Everything is where it should be." },
    root: "root",
    elements: {
      root: { type: "section", props: {}, children },
      ...elements,
    },
  });
  if (!result.success) {
    throw new Error(`fixture is not a legal page: ${result.error.issues.map((issue) => issue.message).join("; ")}`);
  }
  return result.data;
}

const STATUS: Element = { type: "metric", props: { label: "Status", value: "Open" } };
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const VALUES = [5.5, 6.6, 9.6, 5, 6, 8, 9];

function facts(id: string, sentence: string): Element {
  return { type: "facts", props: { items: [{ id: `${id}-fact`, label: "Fact", value: sentence }] } };
}

/** Wrap a leaf in a card, as carousel children require. */
function card(id: string, child: Element): Record<string, Element> {
  return {
    [id]: { type: "card", props: {}, children: [`${id}-content`] },
    [`${id}-content`]: child,
  };
}

describe("opening choice", () => {
  it("does not infer the reader's task from an opening component type", () => {
    const spec = accepted({
      intro: { type: "callout", props: { text: "Some context first." } },
      caveat: { type: "callout", props: { text: "And a caveat." } },
      status: STATUS,
    });
    expect(guidanceWarnings(spec, "Added the caveat.")).toEqual([]);
    expect(repairRequiredIssues(spec, "Added the caveat.")).toEqual([]);
  });

  it("accepts a chart opening with the same weekly values as a one-row table", () => {
    const spec = accepted({
      week: {
        type: "chart",
        props: { presentation: "bar", labels: DAYS, series: [{ name: "Measured", values: VALUES }] },
      },
    });
    expect(guidanceIssues(spec, "Added the weekly measurements.")).toEqual([]);
  });

  it("accepts a timeline opening", () => {
    const spec = accepted({
      itinerary: {
        type: "timeline",
        props: {
          events: [
            { id: "departure", time: "08:00", title: "Leave the hotel" },
            { id: "arrival", time: "09:00", title: "Arrive at the station" },
          ],
        },
      },
    });
    expect(guidanceIssues(spec, "Set the departure and arrival times.")).toEqual([]);
  });
});

describe("shape-monotony lint", () => {
  it("warns when four elements share one type", () => {
    const spec = accepted({
      status: STATUS,
      one: facts("one", "The lease is signed."),
      two: facts("two", "The movers are booked."),
      three: facts("three", "The elevator is reserved."),
      four: facts("four", "The insurance is filed."),
    });
    const warning = guidanceWarnings(spec, "Filed the insurance certificate.")
      .find((message) => message.includes("uses facts 4 times"));
    expect(warning).toContain("Repetition can make related content easier to scan");
    expect(warning).toContain("otherwise keep the consistent shape");
  });

  it("does not count the metrics a grid owns", () => {
    const result = specSchemaFor("living").safeParse({
      answer: { verdict: "Everything is where it should be." },
      root: "root",
      elements: {
        root: { type: "section", props: {}, children: ["glance"] },
        glance: { type: "grid", props: {}, children: ["one", "two", "three", "four"] },
        one: { type: "metric", props: { label: "Booked", value: 4 } },
        two: { type: "metric", props: { label: "Open", value: 2 } },
        three: { type: "metric", props: { label: "Days", value: 9 } },
        four: { type: "metric", props: { label: "Spent", value: 720 } },
      },
    });
    if (!result.success) throw new Error("fixture is not a legal page");
    expect(guidanceWarnings(result.data, "Booked the fourth leg.")).toEqual([]);
  });

  it("still counts metrics a grid does not own", () => {
    const spec = accepted({
      one: { type: "metric", props: { label: "Booked", value: 4 } },
      two: { type: "metric", props: { label: "Open", value: 2 } },
      three: { type: "metric", props: { label: "Days", value: 9 } },
      four: { type: "metric", props: { label: "Spent", value: 720 } },
    });
    expect(guidanceWarnings(spec, "Booked the fourth leg.")
      .some((message) => message.includes("uses metric 4 times"))).toBe(true);
  });

  it("accepts a carousel opening without warning about the required peer repetition", () => {
    // Metrics two levels down (carousel > card > metric) are still exempt.
    const cards = DAYS.reduce<Record<string, Element>>((acc, day, index) => ({
      ...acc,
      ...card(day.toLowerCase(), { type: "metric", props: { label: day, value: VALUES[index] } }),
    }), {});
    const spec = accepted({
      days: { type: "carousel", props: {}, children: DAYS.map((day) => day.toLowerCase()) },
      ...cards,
    }, ["days"]);
    expect(guidanceIssues(spec, "Added the daily measurements.")).toEqual([]);
  });

  it("does not warn about text share from coherent cards owned by a carousel", () => {
    const routeText = [
      "The first route follows the river before returning through the park. Start at the southern entrance, "
        + "where there is room to meet the group. The path is paved and has several places to rest along the water.",
      "The second route climbs through the woods and returns by the upper trail. Start at the northern gate, "
        + "where the route map shows the fork. The path is uneven in places, with benches near the summit.",
      "The third route crosses the meadow and returns by the lake. Start at the western car park, where "
        + "the trail begins beside the visitor centre. There is little shade after the first turn, so bring water.",
    ];
    const cards = routeText.reduce<Record<string, Element>>((acc, text, index) => ({
      ...acc,
      ...card(`route-${index}`, { type: "callout", props: { text } }),
    }), {});
    const spec = accepted({
      routes: { type: "carousel", props: {}, children: routeText.map((_, index) => `route-${index}`) },
      ...cards,
    }, ["routes"]);
    expect(guidanceIssues(spec, "Added three route descriptions.")).toEqual([]);
  });

  it("does not count approvals: five open questions are five approvals", () => {
    const ask = (id: string, question: string): Element => ({
      type: "approval",
      props: {
        id,
        question,
        options: [
          { id: `${id}-yes`, label: "Yes" },
          { id: `${id}-no`, label: "No" },
        ],
      },
    });
    const spec = accepted({
      one: ask("one", "Book the early flight?"),
      two: ask("two", "Take the aisle seat?"),
      three: ask("three", "Add a checked bag?"),
      four: ask("four", "Prepay the hotel?"),
      five: ask("five", "Buy the rail pass?"),
    });
    expect(guidanceWarnings(spec, "Asked the five open booking questions.")
      .some((message) => message.includes("uses approval"))).toBe(false);
  });

  it("is quiet at three", () => {
    const spec = accepted({
      status: STATUS,
      one: facts("one", "The lease is signed."),
      two: facts("two", "The movers are booked."),
      three: facts("three", "The elevator is reserved."),
    });
    expect(guidanceWarnings(spec, "Reserved the elevator.")).toEqual([]);
  });

  it("warns when one type holds more than half the page's text", () => {
    const spec = accepted({
      status: STATUS,
      story: {
        type: "prose",
        props: {
          text: "The consulate confirmed the appointment for the fourteenth, and they want the original lease rather "
            + "than a scan, so the deposit has to clear before the courier can go out on Thursday morning.\n\n"
            + "Nothing else is blocked: the movers hold the slot until Friday and the building has the certificate "
            + "it asked for, so the open question is only whether the lease arrives in time.",
        },
      },
      loops: {
        type: "status-list",
        props: {
          items: [
            { id: "lease", label: "Original lease in the courier's hands", status: "waiting-on-them", owner: "Consulate" },
            { id: "deposit", label: "Deposit cleared", status: "waiting-on-you" },
            { id: "certificate", label: "Insurance certificate filed with the building", status: "done" },
            { id: "keys", label: "Keys collected from the letting agent", status: "waiting-on-them", owner: "Agent" },
          ],
        },
      },
    });
    const warning = guidanceWarnings(spec, "Confirmed the appointment.")
      .find((message) => message.includes("of this page's text"));
    expect(warning).toContain("prose holds");
    expect(warning).toContain("That may suit the reader's task");
    expect(warning).toContain("do not add variety solely to lower this share");
  });
});

describe("summary-duplication lint", () => {
  const spec = accepted({
    status: STATUS,
    note: {
      type: "callout",
      props: { text: "The lease is signed and the movers are confirmed for the fourteenth of September." },
    },
  });

  it("warns when the summary is the body said twice", () => {
    const warning = guidanceWarnings(spec, "The lease is signed and the movers are confirmed for the fourteenth of September.")
      .find((message) => message.includes("repeated verbatim in the page body"));
    expect(warning).toContain("100% of this write's summary");
    expect(warning).toContain("the body is the state now");
  });

  it("is quiet when the summary is the delta and the body is the state", () => {
    expect(guidanceWarnings(spec, "Signed the lease; movers confirmed.")).toEqual([]);
  });

  it("is quiet when there is no narrative body to duplicate", () => {
    const bare = accepted({ status: STATUS });
    expect(guidanceWarnings(bare, "Everything is where it should be right now.")).toEqual([]);
  });

  it("keeps partial shingle overlap advisory unless the whole summary is copied in sequence", () => {
    const partial = accepted({
      status: STATUS,
      note: {
        type: "callout",
        props: { text: "The lease is signed. The elevator is reserved, and the keys stay pending." },
      },
    });
    const summary = "The lease is signed while the keys stay pending.";
    expect(guidanceIssues(partial, summary)).toEqual([
      expect.objectContaining({ code: "summary_body_duplication", level: "advisory" }),
    ]);
    expect(repairRequiredIssues(partial, summary)).toEqual([]);
  });

  it("does not invent verbatim duplication across two rendered passages", () => {
    const split = accepted({
      status: STATUS,
      lease: { type: "callout", props: { text: "The lease is signed." } },
      movers: { type: "callout", props: { text: "Movers are booked." } },
    });
    const summary = "The lease is signed; movers are booked.";
    expect(guidanceIssues(split, summary)).toEqual([
      expect.objectContaining({ code: "summary_body_duplication", level: "advisory" }),
    ]);
    expect(repairRequiredIssues(split, summary)).toEqual([]);
  });
});

describe("advisory lints stay advisory", () => {
  it("returns advisory issues for a monotonous page the schema accepts", () => {
    const monotonous = accepted({
      intro: { type: "callout", props: { text: "Context for the plan." } },
      one: facts("one", "The lease is signed."),
      two: facts("two", "The movers are booked."),
      three: facts("three", "The elevator is reserved."),
      four: facts("four", "The insurance is filed."),
    });
    // Repetition is advisory, never blocking.
    expect(guidanceWarnings(monotonous, "Filed the insurance certificate.").length).toBe(1);
    expect(guidanceIssues(monotonous, "Filed the insurance certificate.").map(({ level }) => level))
      .toEqual(["advisory"]);
    expect(repairRequiredIssues(monotonous, "Filed the insurance certificate.")).toEqual([]);
    expect(specSchemaFor("living").safeParse(monotonous).success).toBe(true);
  });

  it("says nothing about the shipped fixtures except what is true of them", () => {
    expect(guidanceWarnings(move.spec, "Booked the freight elevator for the morning.")).toEqual([]);
    // The carousel's eight weekly checklists are coherent peers, not monotony.
    expect(guidanceWarnings(triathlon.spec, "Logged week 3's long ride."))
      .toEqual([]);
    expect(repairRequiredIssues(triathlon.spec, "Logged week 3's long ride.")).toEqual([]);
  });
});

describe("component-choice advisory", () => {
  it("flags the one-row weekly table for reconsideration while accepting its exact values", () => {
    const spec = accepted({
      week: { type: "table", props: { columns: DAYS, rows: [{ id: "measurements", cells: VALUES }] } },
    });
    const issues = guidanceIssues(spec, "Added the weekly measurements.");
    expect(issues).toEqual([
      expect.objectContaining({ code: "component_choice", level: "advisory", path: "/elements/week/props/rows" }),
    ]);
    expect(issues[0].message).toContain("no comparison between rows");
    expect(issues[0].message).toContain("facts block");
    expect(issues[0].message).toContain("item-list");
    expect(issues[0].message).toContain("Keep this table if the reader really is comparing across");
    expect(spec.elements.week.props.rows).toEqual([{ id: "measurements", cells: VALUES }]);
    expect(repairRequiredIssues(spec, "Added the weekly measurements.")).toEqual([]);
  });

  it("makes the same observation for a singleton table outside daily data", () => {
    const spec = accepted({
      dimensions: {
        type: "table",
        props: { columns: ["Height", "Width"], rows: [{ id: "package", cells: [20, 30] }] },
      },
    });
    expect(guidanceIssues(spec, "Recorded package dimensions.")).toEqual([
      expect.objectContaining({ code: "component_choice", level: "advisory", path: "/elements/dimensions/props/rows" }),
    ]);
    expect(repairRequiredIssues(spec, "Recorded package dimensions.")).toEqual([]);
  });

  it("points a two-column table at item-list, the block catalog v2 built for that shape", () => {
    const spec = accepted({
      measurements: {
        type: "table",
        props: {
          columns: ["Day", "Measured"],
          rows: DAYS.map((day, index) => ({ id: day.toLowerCase(), cells: [day, VALUES[index]] })),
        },
      },
    });
    const issues = guidanceIssues(spec, "Added the weekly measurements.");
    expect(issues).toEqual([
      expect.objectContaining({
        code: "component_choice",
        level: "advisory",
        path: "/elements/measurements/props/columns",
      }),
    ]);
    expect(issues[0].message).toContain("item-list");
    expect(issues[0].message).toContain("Keep the table if both columns are values the reader compares");
    expect(repairRequiredIssues(spec, "Added the weekly measurements.")).toEqual([]);
  });

  it("is quiet for a table that genuinely compares records on several shared fields", () => {
    const spec = accepted({
      quotes: {
        type: "table",
        props: {
          columns: ["Vendor", "Quote", "Lead time"],
          rows: [
            { id: "north", cells: ["North Shore", 2400, "3 weeks"] },
            { id: "harbor", cells: ["Harbor Cabinet", 2650, "10 days"] },
          ],
        },
      },
    });
    expect(guidanceIssues(spec, "Added the two quotes.")).toEqual([]);
  });

  it("names comparison when a table's other two columns are a before and an after", () => {
    const spec = accepted({
      rework: {
        type: "table",
        props: {
          columns: ["Line item", "Was", "Now"],
          rows: [
            { id: "cabinets", cells: ["Cabinets", "$2,400", "$2,650"] },
            { id: "counters", cells: ["Counters", "$1,900", "$1,750"] },
          ],
        },
      },
    });
    const issues = guidanceIssues(spec, "Repriced the two line items.");
    expect(issues).toEqual([
      expect.objectContaining({ code: "component_choice", level: "advisory", path: "/elements/rework/props/columns" }),
    ]);
    expect(issues[0].message).toContain("comparison");
    expect(issues[0].message).toContain("stacks each pair on a phone");
    expect(repairRequiredIssues(spec, "Repriced the two line items.")).toEqual([]);
  });

  it("leaves an ordinary single-series chart alone and only flags a percent stack with nothing to stack", () => {
    // Only a one-series percent stack is flagged; it draws every label at 100%.
    const ordinary = accepted({
      load: {
        type: "chart",
        props: {
          labels: ["Swim", "Ride", "Run", "Brick"],
          series: [{ name: "Minutes", values: [55, 165, 48, 120] }],
        },
      },
    });
    expect(guidanceIssues(ordinary, "Added this week's session load.")).toEqual([]);

    const degenerate = accepted({
      spend: {
        type: "chart",
        props: {
          stack: "percent",
          labels: ["Rent", "Food", "Transit"],
          series: [{ name: "Share", values: [1200, 400, 180] }],
        },
      },
    });
    const issues = guidanceIssues(degenerate, "Added the monthly split.");
    expect(issues).toEqual([
      expect.objectContaining({ code: "component_choice", level: "advisory", path: "/elements/spend/props/stack" }),
    ]);
    expect(issues[0].message).toContain("breakdown");
    expect(repairRequiredIssues(degenerate, "Added the monthly split.")).toEqual([]);
  });

  it("is quiet for a facts block mixing copyable and read-only values", () => {
    const spec = accepted({
      status: STATUS,
      booking: {
        type: "facts",
        props: {
          items: [
            { id: "locator", label: "Record locator", value: "ABC123", copyable: true },
            { id: "hotel", label: "Hotel", value: "Casa do Bairro" },
          ],
        },
      },
    });
    expect(guidanceIssues(spec, "Added the record locator.").some(({ code }) => code === "component_choice"))
      .toBe(false);
  });
});

describe("repair-required authoring issues", () => {
  it("requires repair when prose carries markers that render literally", () => {
    const spec = accepted({
      status: STATUS,
      body: { type: "prose", props: { text: "The gate is **blocked** on two fronts - see the list." } },
    });
    expect(repairRequiredIssues(spec, "Updated the gate status.")).toEqual([
      expect.objectContaining({ code: "literal_markup", level: "repair_required", path: "/elements/body/props/text" }),
    ]);
  });

  it.each([
    ["The gate is *blocked*.", "italic markers"],
    ["The gate is _blocked_.", "italic markers"],
    ["The gate is ~~blocked~~.", "strikethrough markers"],
    ["Status\n---\nBlocked", "a Markdown thematic break"],
    ["Status\n===", "a Markdown Setext heading"],
    ["~~~text\nblocked\n~~~", "a Markdown code fence"],
    ["| Item | State |\n|---|---|\n| Gate | Blocked |", "a Markdown table"],
    ["Open <https://example.com/status>.", "a Markdown autolink"],
  ])("requires repair for %s", (text, marker) => {
    const spec = accepted({
      status: STATUS,
      body: { type: "callout", props: { text } },
    });
    const issues = repairRequiredIssues(spec, "Updated the gate status.");
    expect(issues).toEqual([
      expect.objectContaining({ code: "literal_markup", path: "/elements/body/props/text" }),
    ]);
    expect(issues[0].message).toContain(marker);
  });

  it.each([
    "The trip_id stays stable.",
    "Multiply price * tax before rounding.",
    "Version === 2 remains current.",
    "Compare A | B in the sentence.",
    "Use https://example.com/status as the source.",
  ])("does not mistake plain punctuation for Markdown in %s", (text) => {
    const spec = accepted({
      status: STATUS,
      body: { type: "callout", props: { text } },
    });
    expect(repairRequiredIssues(spec, "Updated the gate status.")).toEqual([]);
  });

  it("leaves code-block exact text alone", () => {
    const spec = accepted({
      status: STATUS,
      code: { type: "code-block", props: { code: "<script>\n# heading\n- item\n**not markdown, just text**", language: "text" } },
    });
    const warnings = guidanceWarnings(spec, "Added the snippet.");
    expect(warnings.some((warning) => warning.includes("renders literally"))).toBe(false);
  });

  it("checks the TLDR and write-summary chrome as visible text too", () => {
    const spec = accepted({ status: STATUS });
    spec.answer!.verdict = "# Current status";
    expect(repairRequiredIssues(spec, "Updated the status.")).toEqual([
      expect.objectContaining({ code: "literal_markup", path: "/answer/verdict" }),
    ]);

    spec.answer!.verdict = "Current status";
    expect(repairRequiredIssues(spec, "Updated **the status**.")).toEqual([
      expect.objectContaining({ code: "literal_markup", path: "/summary" }),
    ]);
  });

  it("catches generic HTML tags such as script, not only a tag allowlist", () => {
    const spec = accepted({
      status: STATUS,
      body: { type: "callout", props: { text: "Review <script>alert('x')</script> before deciding." } },
    });
    expect(repairRequiredIssues(spec, "Added the security warning.")).toEqual([
      expect.objectContaining({ code: "literal_markup", path: "/elements/body/props/text" }),
    ]);
  });

  it("checks budget-exempt approval context because it is still visible", () => {
    const spec = accepted({
      status: STATUS,
      call: {
        type: "approval",
        props: {
          id: "ship",
          question: "Ship it?",
          context: "**Important:** review the release candidate before deciding.",
          options: [{ id: "yes", label: "Ship" }, { id: "no", label: "Hold" }],
        },
      },
    });
    expect(repairRequiredIssues(spec, "Added the shipping call.")).toEqual([
      expect.objectContaining({ code: "literal_markup", path: "/elements/call/props/context" }),
    ]);
  });

  it("checks the model-authored page title in the same quality context", () => {
    const spec = accepted({ status: STATUS });
    expect(repairRequiredIssues(spec, {
      summary: "Renamed the page.",
      title: "<script>Roadmap</script>",
    })).toEqual([
      expect.objectContaining({ code: "literal_markup", path: "/title" }),
    ]);
  });

  it("requires repair for a second quote because the catalog promises one", () => {
    const spec = accepted({
      status: STATUS,
      first: { type: "quote", props: { text: "Keep the page quiet.", attribution: "A" } },
      second: { type: "quote", props: { text: "Make the answer obvious.", attribution: "B" } },
    });
    expect(repairRequiredIssues(spec, "Added two perspectives.")).toEqual([
      expect.objectContaining({ code: "multiple_quotes", level: "repair_required", path: "/elements/second" }),
    ]);
  });

  it("preserves warning-string compatibility for structured issues", () => {
    const spec = accepted({
      status: STATUS,
      body: { type: "callout", props: { text: "The lease is signed and the keys are ready." } },
    });
    const issues = guidanceIssues(spec, "The lease is signed and the keys are ready.");
    expect(issues).toEqual([
      expect.objectContaining({ code: "summary_body_duplication", level: "repair_required", path: "/summary" }),
    ]);
    expect(guidanceWarnings(spec, "The lease is signed and the keys are ready."))
      .toEqual(issues.map(({ message }) => message));
  });
});

describe("rewrite address drift", () => {
  const before = accepted({
    status: STATUS,
    queue: { type: "status-list", props: { items: [{ id: "q1", label: "Waiting", status: "waiting-on-them", owner: "Consulate" }] } },
  });

  it("calls a kept-content rename a rename, not a drop", () => {
    const after = accepted({
      "status-v2": STATUS,
      queue: { type: "status-list", props: { items: [{ id: "q1", label: "Waiting", status: "waiting-on-them", owner: "Consulate" }] } },
    });
    const drift = addressDrift(before, after);
    expect(drift.elements_renamed).toBe(1);
    expect(drift.elements_dropped).toBe(0);
    expect(drift.warnings[0]).toContain('"status" became "status-v2"');
    expect(drift.warnings[0]).toContain("Reuse the existing ids");
    expect(guidanceWarnings(after, "Rebuilt the page.", drift).some((warning) => warning.includes("renamed 1 element"))).toBe(true);
  });

  it("counts true drops separately", () => {
    const after = accepted({ status: STATUS });
    const drift = addressDrift(before, after);
    expect(drift.elements_dropped).toBe(1);
    expect(drift.elements_renamed).toBe(0);
    expect(drift.warnings[0]).toContain("dropped 1 element outright");
  });

  it("is quiet when addresses hold", () => {
    const drift = addressDrift(before, before);
    expect(drift.elements_dropped).toBe(0);
    expect(drift.elements_renamed).toBe(0);
    expect(drift.warnings).toEqual([]);
  });
});
