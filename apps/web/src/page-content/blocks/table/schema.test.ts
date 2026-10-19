import { describe, expect, it } from "vitest";

import { schema } from "./schema";

const base = {
  columns: ["Code", "Name"],
  rows: [{ id: "r", cells: ["A1B2", "Ada"] }],
};

describe("table schema", () => {
  it("dedupes repeated copyable columns rather than refusing them", () => {
    const result = schema.safeParse({ ...base, copyable_columns: [0, 0, 1, 0] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.copyable_columns).toEqual([0, 1]);
  });

  it("refuses a copyable column that is not there", () => {
    const result = schema.safeParse({ ...base, copyable_columns: [0, 5] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(({ message }) => message.includes("outside 2 columns"))).toBe(true);
    }
  });

  it("leaves row-id uniqueness to the page-wide check", () => {
    // Id uniqueness is enforced page-wide by `page-content/schema.ts`, not by this schema.
    const result = schema.safeParse({
      ...base,
      rows: [
        { id: "same", cells: ["A1B2", "Ada"] },
        { id: "same", cells: ["C3D4", "Grace"] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("refuses a ragged row and an out-of-range highlight", () => {
    expect(schema.safeParse({ ...base, rows: [{ id: "r", cells: ["A1B2"] }] }).success).toBe(false);
    expect(schema.safeParse({ ...base, highlight_column: 2 }).success).toBe(false);
  });
});
