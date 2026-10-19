import { describe, expect, it } from "vitest";

import { COMPONENT_NAMES } from "@/page-content/catalog";
import { elementTextSpans, pageTextChars, TEXT_RULES } from "./text";

describe("visible text accounting", () => {
  it("counts semantic numeric, quantity, money, and boolean display values without using a viewer locale", () => {
    const spec = {
      root: "root",
      elements: {
        root: { type: "section", props: {}, children: [] },
        metric: { type: "metric", props: { label: "Distance", value: { value: 12.5, unit: "km" } } },
        money: { type: "metric", props: { label: "Budget", value: { amount: 1200, currency: "USD" } } },
        state: { type: "metric", props: { label: "Ready", value: true } },
        progress: { type: "progress", props: { label: "Migration", current: 72, target: 100 } },
      },
    };

    expect(elementTextSpans("metric", spec.elements.metric).map((span) => span.text)).toEqual([
      "Distance",
      "12.5 km",
    ]);
    expect(pageTextChars(spec)).toBe(
      "Distance".length + "12.5 km".length
      + "Budget".length + "1200 USD".length
      + "Ready".length + "true".length
      + "Migration".length + "72".length + "100".length,
    );
  });

  it("keeps date and URL metadata out of the reading budget", () => {
    const spans = elementTextSpans("facts", {
      type: "facts",
      props: {
        items: [
          { id: "date", label: "Check-in", value: "2026-09-12" },
          { id: "url", label: "Source", value: "https://example.com/plan" },
        ],
      },
    });

    expect(spans.map((span) => span.text)).toEqual(["Check-in", "Source"]);
  });

  it("counts a nested field through parent (phases target label)", () => {
    const target = elementTextSpans("plan", {
      type: "phases",
      props: {
        stages: [{ id: "s", name: "Base", start: "2026-08-01", end: "2026-09-01" }],
        target: { label: "Race day", at: "2026-10-04" },
      },
    });
    expect(target.map((span) => span.text)).toContain("Race day");
    expect(target.find((span) => span.text === "Race day")?.field).toBe("phases target label");
  });

  it("gives every catalog component a text-rules entry, so a new block cannot silently contribute zero", () => {
    expect(Object.keys(TEXT_RULES).sort()).toEqual([...COMPONENT_NAMES]);
  });
});
