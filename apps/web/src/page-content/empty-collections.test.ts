/** An items array may be empty only when `empty` is set, and `empty` is refused beside items. */
import { describe, expect, it } from "vitest";

import { schema as attachmentList } from "@/page-content/blocks/attachment-list/schema";
import { schema as breakdown } from "@/page-content/blocks/breakdown/schema";
import { schema as chart } from "@/page-content/blocks/chart/schema";
import { schema as checklist } from "@/page-content/blocks/checklist/schema";
import { schema as comparison } from "@/page-content/blocks/comparison/schema";
import { schema as facts } from "@/page-content/blocks/facts/schema";
import { schema as itemList } from "@/page-content/blocks/item-list/schema";
import { schema as referenceList } from "@/page-content/blocks/reference-list/schema";
import { schema as statusList } from "@/page-content/blocks/status-list/schema";
import { schema as streakGrid } from "@/page-content/blocks/streak-grid/schema";
import { schema as table } from "@/page-content/blocks/table/schema";
import { schema as timeline } from "@/page-content/blocks/timeline/schema";

const CASES: [string, unknown, Record<string, unknown>, Record<string, unknown>][] = [
  ["attachment-list", attachmentList, { items: [] }, { items: [{ id: "a", resource_id: "asset_1", label: "A", kind: "document" }] }],
  ["breakdown", breakdown, { parts: [] }, { parts: [{ id: "a", label: "A", value: 1 }] }],
  ["checklist", checklist, { items: [] }, { items: [{ id: "a", label: "A", done: false }] }],
  ["comparison", comparison, { items: [] }, { items: [{ id: "a", label: "A", before: "x", after: "y" }] }],
  ["facts", facts, { items: [] }, { items: [{ id: "a", label: "A", value: "B" }] }],
  ["item-list", itemList, { items: [] }, { items: [{ id: "a", title: "A" }] }],
  ["reference-list", referenceList, { items: [] }, { items: [{ id: "a", title: "A", url: "https://example.com/a" }] }],
  ["status-list", statusList, { items: [] }, { items: [{ id: "a", label: "A", status: "waiting-on-you" }] }],
  ["table", table, { columns: ["A"], rows: [] }, { columns: ["A"], rows: [{ id: "a", cells: ["B"] }] }],
  ["timeline", timeline, { order: "as-provided", events: [] }, { order: "as-provided", events: [{ id: "a", title: "A" }] }],
];

describe("empty collections require `empty`, not a bare zero length", () => {
  for (const [name, schema, empty, oneItem] of CASES) {
    it(`refuses a bare empty ${name}, naming the remedy`, () => {
      const result = (schema as { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }).safeParse(empty);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error?.issues[0]?.message).toContain("set empty");
      }
    });

    it(`accepts an empty ${name} once empty is set`, () => {
      expect((schema as { safeParse: (v: unknown) => { success: boolean } }).safeParse({ ...empty, empty: "Nothing here yet." }).success).toBe(true);
    });

    it(`refuses empty beside a non-empty ${name}`, () => {
      const result = (schema as { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }).safeParse({ ...oneItem, empty: "Nothing here yet." });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error?.issues.some((issue) => issue.message.includes("empty is shown only when"))).toBe(true);
      }
    });

    it(`accepts a ${name} with one item and no empty`, () => {
      expect((schema as { safeParse: (v: unknown) => { success: boolean } }).safeParse(oneItem).success).toBe(true);
    });
  }

  it("refuses an empty streak-grid, naming the remedy", () => {
    const result = streakGrid.safeParse({ cells: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain("set empty");
    expect(streakGrid.safeParse({ cells: [], empty: "No activity yet." }).success).toBe(true);
  });

  it("refuses an empty chart without data unless empty is set", () => {
    expect(chart.safeParse({ labels: [], series: [] }).success).toBe(false);
    expect(chart.safeParse({ labels: [], series: [], empty: "No data yet." }).success).toBe(true);
  });
});
