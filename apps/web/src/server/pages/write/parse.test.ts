/** The pure write-edge checks: the 422s an authoring agent receives, and accepted-page telemetry. */
import { describe, expect, it } from "vitest";

import { triathlon } from "@/page-content/document/fixtures";
import { textWall } from "@/test/fixtures/text-wall";
import { pageTextChars } from "@/page-content/document/text";
import type { ApiError } from "@/shared/api/types";
import { MAX_APPROVAL_CONTEXT_CHARS, MAX_SUMMARY_CHARS, PAGE_TEXT_BUDGET } from "@/page-content/document/limits";
import { parseSpec, requireSummary, textTelemetry } from "./parse";

function refusal(spec: unknown, kind: "living" | "standing" = "living"): { status: number; body: ApiError } {
  const result = parseSpec(spec, kind);
  if (!("status" in result)) throw new Error("expected a refusal, got a spec");
  return { status: result.status, body: result.body as unknown as ApiError };
}

describe("the text wall", () => {
  const { status, body } = refusal(textWall);

  it("is refused, not stored", () => {
    expect(status).toBe(422);
    expect(body.code).toBe("invalid_spec");
    expect(body.next).toEqual(["get_guide", "get_manifest", "put_page"]);
  });

  it("leads with the budget it blew and what to do about it", () => {
    expect(body.path).toBe("/spec");
    expect(body.error).toContain(`characters of visible text; a living page's budget is ${PAGE_TEXT_BUDGET.living.toLocaleString("en-US")}`);
    expect(body.error).toContain("Text is the scarce resource, not elements");
    expect(body.error).toContain("compress repetition");
    expect(body.error).toContain("move the background or the full account to a second page");
    // The way out is not "make it a standing page".
    expect(body.error).toContain("a cadence change is not a way around this");
  });

  it("names every other cap it broke in the same response", () => {
    const errors = body.errors ?? [];
    const messages = errors.map((error) => error.error);
    expect(messages.some((message) => message.includes("one collection may hold 600"))).toBe(true);
    expect(messages.some((message) => message.includes("facts value in"))).toBe(true);
    expect(messages.some((message) => message.includes("is prose"))).toBe(true);
    expect(messages.some((message) => message.includes("no `answer`"))).toBe(true);
    // Each error has a pointer into the spec and a code.
    for (const error of errors) {
      expect(error.code).toBe("invalid_spec");
      expect(error.path ?? "").toMatch(/^\/spec\//);
      expect(error.next).toEqual(["get_guide", "get_manifest", "put_page"]);
    }
  });

  it("points at the collection that holds the wall", () => {
    const collection = (body.errors ?? []).find((error) => error.error.includes("one collection may hold"));
    expect(collection?.path).toMatch(/^\/spec\/elements\/[a-z-]+\/props\/items$/);
  });
});

describe("candidate-document pointers", () => {
  const missingAnswer = {
    root: "root",
    elements: {
      root: { type: "section", props: {}, children: ["status"] },
      status: { type: "metric", props: { label: "Status", value: "Open" } },
    },
  };

  it("prefixes a create or rewrite candidate nested under /spec", () => {
    const result = parseSpec(missingAnswer, "living", { pathPrefix: "/spec", next: "rewrite_page_spec" });
    expect("status" in result).toBe(true);
    if ("status" in result) {
      expect(result.body).toMatchObject({ path: "/spec/answer", next: ["get_guide", "get_manifest", "rewrite_page_spec"] });
    }
  });

  it("returns a patch's directly actionable document pointer", () => {
    const result = parseSpec(missingAnswer, "living", { pathPrefix: "", next: "patch_page_spec" });
    expect("status" in result).toBe(true);
    if ("status" in result) {
      expect(result.body).toMatchObject({ path: "/answer", next: ["get_guide", "get_manifest", "patch_page_spec"] });
    }
  });

  it("maps a root-level oversized patch after-image to actionable /elements", () => {
    const result = parseSpec(textWall, "living", { pathPrefix: "", next: "patch_page_spec" });
    expect("status" in result).toBe(true);
    if ("status" in result) {
      expect(result.body).toMatchObject({ path: "/elements", next: ["get_guide", "get_manifest", "patch_page_spec"] });
      expect(String(result.body.error)).toContain("characters of visible text");
    }
  });

  it("preserves every nested props segment as a canonical pointer", () => {
    const badChart = {
      answer: { verdict: "The trend is incomplete." },
      root: "root",
      elements: {
        root: { type: "section", props: {}, children: ["chart"] },
        chart: {
          type: "chart",
          props: {
            labels: ["Mon", "Tue"],
            series: [{ name: "Volume", values: [4] }],
          },
        },
      },
    };
    const patch = parseSpec(badChart, "living", { pathPrefix: "", next: "patch_page_spec" });
    expect("status" in patch).toBe(true);
    if ("status" in patch) {
      expect(patch.body.path).toBe("/elements/chart/props/series/0/values");
    }
    const rewrite = parseSpec(badChart, "living", { pathPrefix: "/spec", next: "rewrite_page_spec" });
    expect("status" in rewrite).toBe(true);
    if ("status" in rewrite) {
      expect(rewrite.body.path).toBe("/spec/elements/chart/props/series/0/values");
    }
  });

  it("RFC 6901-escapes raw Zod path segments at the API edge", () => {
    const result = parseSpec({
      answer: { verdict: "The valid status remains open." },
      root: "root",
      elements: {
        root: { type: "section", props: {}, children: ["status"] },
        status: { type: "metric", props: { label: "Status", value: "Open" } },
        "bad/id~x": { type: "callout", props: { text: "Unreachable invalid id." } },
      },
    }, "living", { pathPrefix: "", next: "patch_page_spec" });
    expect("status" in result).toBe(true);
    if ("status" in result) {
      expect(result.body.path).toBe("/elements/bad~1id~0x");
    }
  });
});

describe("a spec whose shape is wrong before its content is", () => {
  const badShape = {
    answer: { verdict: "The shape is what breaks first." },
    root: "root",
    elements: {
      root: { type: "section", props: {}, children: ["status"] },
      status: { type: "metric", props: { label: "Status", value: "Open" }, children: 3 },
    },
  };

  it("says the other rules were not evaluated, because zod never ran them", () => {
    const { body } = refusal(badShape);
    expect(body.path).toBe("/spec/elements/status/children");
    expect(body.error).toContain("was not evaluated against this candidate");
  });

  it("stays quiet about that when the refinements did run", () => {
    expect(refusal(textWall).body.error).not.toContain("was not evaluated");
  });

  it("spells out the element id grammar zod hides under \"Invalid key in record\"", () => {
    const { body } = refusal({
      answer: { verdict: "The id is not an id." },
      root: "root",
      elements: {
        root: { type: "section", props: {}, children: [] },
        "My Element": { type: "callout", props: { text: "Named like a heading." } },
      },
    });
    expect(body.path).toBe("/spec/elements/My Element");
    expect(body.error).toContain("an element id is a lowercase letter");
    expect(body.error).toContain("flight-status");
  });
});

describe("a lean page", () => {
  it("parses, and comes back as the spec the writer sent", () => {
    const parsed = parseSpec(triathlon.spec, "living");
    expect("status" in parsed).toBe(false);
    if ("status" in parsed) return;
    expect(parsed.answer?.verdict).toContain("Week 3 of 8");
    expect(Object.keys(parsed.elements)).toContain("open-loops");
  });
});

describe("write telemetry", () => {
  it("reports what the page spent and what is left", () => {
    const chars = pageTextChars(triathlon.spec);
    expect(textTelemetry(triathlon.spec, "living")).toEqual({
      text_chars: chars,
      budget_remaining: PAGE_TEXT_BUDGET.living - chars,
    });
  });

  it("measures the remainder against the page's own cadence", () => {
    const living = textTelemetry(triathlon.spec, "living");
    const standing = textTelemetry(triathlon.spec, "standing");
    expect(standing.text_chars).toBe(living.text_chars);
    expect(standing.budget_remaining - living.budget_remaining)
      .toBe(PAGE_TEXT_BUDGET.standing - PAGE_TEXT_BUDGET.living);
  });

  it("floors the remainder at zero rather than reporting a debt", () => {
    const spent = textTelemetry(textWall, "living");
    expect(spent.text_chars).toBeGreaterThan(PAGE_TEXT_BUDGET.living);
    expect(spent.budget_remaining).toBe(0);
  });
});

describe("numeric text walls", () => {
  it("refuses 500 long numeric table cells instead of accepting the old five-character header count", () => {
    const spec = {
      answer: { verdict: "The ledger has a complete numeric record." },
      root: "root",
      elements: {
        root: { type: "section", props: {}, children: ["ledger"] },
        ledger: {
          type: "table",
          props: {
            columns: ["Value"],
            rows: Array.from({ length: 500 }, (_, index) => ({
              id: `row-${index}`,
              cells: [100_000_000_000 + index],
            })),
          },
        },
      },
    };

    // This shape must spend more than the five characters in its header.
    expect(pageTextChars(spec)).toBe(6_005);
    const result = parseSpec(spec, "living");
    expect("status" in result).toBe(true);
    if (!("status" in result)) return;
    expect(result.status).toBe(422);
    expect((result.body as unknown as ApiError).error).toContain("characters of visible text");
    expect((result.body as unknown as ApiError).errors?.some((error) =>
      error.error.includes("one collection may hold 600"),
    )).toBe(true);
  });
});

describe("the summary cap", () => {
  it.each([["an empty summary", ""], ["a missing summary", undefined], ["whitespace", "   "]])(
    "refuses %s with the code the recovery table publishes",
    (_label, summary) => {
      const result = requireSummary(summary, "put_page");
      expect(typeof result).not.toBe("string");
      if (typeof result === "string") return;
      expect(result.status).toBe(422);
      expect((result.body as unknown as ApiError).code).toBe("summary_required");
    },
  );

  it("refuses a summary that outgrew the chrome strip", () => {
    const long = "x".repeat(MAX_SUMMARY_CHARS + 1);
    const result = requireSummary(long, "put_page");
    expect(typeof result).not.toBe("string");
    if (typeof result === "string") return;
    expect(result.status).toBe(422);
    const body = result.body as unknown as ApiError;
    expect(body.code).toBe("summary_too_long");
    expect(body.error).toContain(`${MAX_SUMMARY_CHARS + 1} characters`);
    expect(body.error).toContain("the account of it belongs in the page body");
  });

  it("returns the summary trimmed, so no caller trims it again", () => {
    expect(requireSummary("  Cut the page to the budget.  ", "put_page")).toBe("Cut the page to the budget.");
  });
});

describe("the exemptions are bounded too", () => {
  function pageWith(element: Record<string, unknown>): unknown {
    return {
      answer: { verdict: "One line of standing state." },
      root: "root",
      elements: {
        root: { type: "section", props: {}, children: ["only"] },
        only: element,
      },
    };
  }

  it("refuses an approval context that became the wall it was exempt from", () => {
    const result = parseSpec(pageWith({
      type: "approval",
      props: {
        id: "call",
        question: "Ship it?",
        context: "x".repeat(MAX_APPROVAL_CONTEXT_CHARS + 1),
        options: [
          { id: "yes", label: "Ship" },
          { id: "no", label: "Hold" },
        ],
      },
    }), "living");
    expect("status" in result).toBe(true);
    if ("status" in result) {
      expect(result.status).toBe(422);
      expect((result.body as unknown as ApiError).error).toContain(`${MAX_APPROVAL_CONTEXT_CHARS} characters at most`);
    }
  });

  it("still accepts a bounded approval context", () => {
    const result = parseSpec(pageWith({
      type: "approval",
      props: {
        id: "call",
        question: "Ship it?",
        context: "The quote holds until Friday.",
        options: [
          { id: "yes", label: "Ship" },
          { id: "no", label: "Hold" },
        ],
      },
    }), "living");
    expect("status" in result).toBe(false);
  });
});

describe("grid geometry", () => {
  function gridPage(children: number): unknown {
    return {
      answer: { verdict: "One line of standing state." },
      root: "root",
      elements: {
        root: { type: "section", props: {}, children: ["grid"] },
        "grid": {
          type: "grid",
          props: {},
          children: Array.from({ length: children }, (_, index) => `m${index}`),
        },
        ...Object.fromEntries(Array.from({ length: children }, (_, index) => [
          `m${index}`,
          { type: "metric", props: { label: `M${index}`, value: `${index}` } },
        ])),
      },
    };
  }

  it("refuses more than 8 children, naming the cap", () => {
    const result = parseSpec(gridPage(9), "living");
    expect("status" in result).toBe(true);
    if ("status" in result) {
      const body = result.body as unknown as ApiError;
      expect(body.error).toContain("grid has 9 children");
    }
  });

  it("accepts any count up to 8 - the arity rule is gone", () => {
    for (const n of [1, 2, 3, 8]) {
      expect("status" in parseSpec(gridPage(n), "living")).toBe(false);
    }
  });
});

describe("fenced code", () => {
  it("refuses a code-block whose first line is a Markdown fence", () => {
    const result = parseSpec({
      answer: { verdict: "One line of standing state." },
      root: "root",
      elements: {
        root: { type: "section", props: {}, children: ["code"] },
        code: { type: "code-block", props: { code: "```ts\nconst x = 1;\n```", language: "ts" } },
      },
    }, "living");
    expect("status" in result).toBe(true);
    if ("status" in result) {
      expect((result.body as unknown as ApiError).error).toContain("Markdown fence");
    }
  });

  it("accepts bare code", () => {
    const result = parseSpec({
      answer: { verdict: "One line of standing state." },
      root: "root",
      elements: {
        root: { type: "section", props: {}, children: ["code"] },
        code: { type: "code-block", props: { code: "const x = 1;", language: "ts" } },
      },
    }, "living");
    expect("status" in result).toBe(false);
  });
});
