import { describe, expect, it } from "vitest";

import type { StrataSpec } from "@/page-content/schema";

import { pageToMarkdown } from "./page-markdown";

const spec = {
  root: "root",
  answer: { verdict: "On track for the 14th; only the internet window is open." },
  elements: {
    root: { type: "section", props: { title: "Charlotte move" }, children: ["metrics", "status", "details", "sources"] },
    metrics: { type: "grid", props: {}, children: ["m1", "m2"] },
    m1: { type: "metric", props: { label: "Days left", value: 13 }, children: [] },
    m2: { type: "metric", props: { label: "Budget", value: { amount: 2400, currency: "USD" } }, children: [] },
    status: {
      type: "status-list",
      props: {
        items: [
          { id: "s1", label: "Internet install", status: "waiting-on-them", owner: "Spectrum", due_at: "2026-09-12" },
          { id: "s2", label: "Lease signed", status: "done" },
        ],
      },
      children: [],
    },
    details: {
      type: "section",
      props: { title: "Logistics" },
      children: ["table", "refs", "note"],
    },
    table: {
      type: "table",
      props: {
        columns: ["Item", "Cost"],
        rows: [{ id: "r1", cells: ["Movers", { amount: 800, currency: "USD" }] }],
      },
      children: [],
    },
    refs: {
      type: "reference-list",
      props: {
        items: [
          { id: "ref1", title: "Spectrum availability", source: "Spectrum", url: "https://www.spectrum.com/availability", note: "serviceable at the new address" },
        ],
      },
      children: [],
    },
    note: { type: "callout", props: { text: "Elevator reservation needed for move-in.", tone: "warning" }, children: [] },
    sources: { type: "section", props: { title: "Sources" }, children: ["reflist"] },
  },
} as unknown as StrataSpec;

describe("pageToMarkdown", () => {
  it("opens with the title and the standing answer", () => {
    const md = pageToMarkdown({ title: "Charlotte + Asheville", spec, updatedAt: "2026-08-31T20:00:00.000Z", url: "https://strata.example/share/pgk_abc" });
    expect(md.startsWith("# Charlotte + Asheville\n\n**TL;DR:** On track for the 14th; only the internet window is open.")).toBe(true);
    expect(md).toContain("Updated: 2026-08-31T20:00:00.000Z");
    expect(md).toContain("Source: https://strata.example/share/pgk_abc");
  });

  it("renders sections as headings and flattens layout containers", () => {
    const md = pageToMarkdown({ title: "T", spec, updatedAt: "2026-08-31T20:00:00.000Z" });
    expect(md).toContain("## Charlotte move");
    expect(md).toContain("### Logistics");
    expect(md).toContain("- **Days left:** 13");
    expect(md).toContain("- **Budget:** 2400 USD");
  });

  it("renders a status list with holder and due date", () => {
    const md = pageToMarkdown({ title: "T", spec, updatedAt: "2026-08-31T20:00:00.000Z" });
    expect(md).toContain("- **Internet install** — waiting-on-them (Spectrum) · due 2026-09-12");
    expect(md).toContain("- **Lease signed** — done");
  });

  it("renders a table as a table and escapes pipes", () => {
    const md = pageToMarkdown({ title: "T", spec, updatedAt: "2026-08-31T20:00:00.000Z" });
    expect(md).toContain("| Item | Cost |");
    expect(md).toContain("| Movers | 800 USD |");
  });

  it("renders sources as links with publisher and note", () => {
    const md = pageToMarkdown({ title: "T", spec, updatedAt: "2026-08-31T20:00:00.000Z" });
    expect(md).toContain("- [Spectrum availability](https://www.spectrum.com/availability) — Spectrum — serviceable at the new address");
  });

  it("renders a callout as a labelled blockquote", () => {
    const md = pageToMarkdown({ title: "T", spec, updatedAt: "2026-08-31T20:00:00.000Z" });
    expect(md).toContain("> **Warning:** Elevator reservation needed for move-in.");
  });

  it("keeps content when an element type is unknown", () => {
    const future = {
      root: "root",
      elements: {
        root: { type: "section", props: {}, children: ["new"] },
        new: { type: "hologram", props: { text: "x" }, children: ["kid"] },
        kid: { type: "prose", props: { text: "still here" }, children: [] },
      },
    } as unknown as StrataSpec;
    const md = pageToMarkdown({ title: "T", spec: future, updatedAt: "2026-08-31T20:00:00.000Z" });
    expect(md).toContain("still here");
  });

  it("does not spend a heading level on an untitled section", () => {
    const wrapped = {
      root: "root",
      elements: {
        root: { type: "section", props: {}, children: ["s"] },
        s: { type: "section", props: { title: "Real heading" }, children: ["p"] },
        p: { type: "prose", props: { text: "body" }, children: [] },
      },
    } as unknown as StrataSpec;
    const md = pageToMarkdown({ title: "T", spec: wrapped, updatedAt: "2026-08-31T20:00:00.000Z" });
    expect(md).toContain("## Real heading");
    expect(md).not.toContain("### Real heading");
  });
});

