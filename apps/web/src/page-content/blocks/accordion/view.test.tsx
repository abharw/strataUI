import { describe, expect, it } from "vitest";

import { meta, schema } from "./schema";

describe("accordion", () => {
  it("accepts the manifest's own example", () => {
    expect(schema.safeParse(meta.example).success).toBe(true);
  });

  it("refuses a single row: one folded sentence is prose, not an accordion", () => {
    expect(schema.safeParse({ items: [{ id: "a1", title: "Only", body: "row" }] }).success).toBe(false);
  });

  it("refuses more than 8 rows", () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ id: `a${i}`, title: `Row ${i}`, body: "body" }));
    expect(schema.safeParse({ items }).success).toBe(false);
  });
});
