import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "@/page-content/test-format";
import { defaultTablePresentation, numericColumns, recordKeyIndex, Table } from "./view";

describe("table accessibility", () => {
  it("names the horizontal scroll region and makes it keyboard focusable", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Table columns={["Name", "Value"]} rows={[{ id: "one", cells: ["One", 1] }]} />
      </TestViewerFormatting>,
    );

    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Data table"');
    expect(html).toContain('tabindex="0"');
  });

  it("uses the first cell as a row header and names a highlighted column", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Table
          columns={["Name", "Value"]}
          rows={[{ id: "one", cells: ["One", 1] }]}
          highlight_column={1}
        />
      </TestViewerFormatting>,
    );

    expect(html).toContain('<th scope="row"');
    expect(html).toContain('Value<span class="sr-only"> (highlighted column)</span>');
  });
});

describe("figure columns", () => {
  const rows = [
    { id: "a", cells: ["Rent", { amount: 1200, currency: "USD" }, 12, "monthly", ""] },
    { id: "b", cells: ["Power", { amount: 80, currency: "USD" }, "", "monthly", ""] },
    { id: "c", cells: ["Water", { amount: 30, currency: "USD" }, 4, "n/a", ""] },
  ];

  it("reads sums and counts as figures, words and the row label as text", () => {
    // Column 3 mixes a number with a word, so it stays text; column 4 is
    // empty throughout and has no figures to line up.
    expect(numericColumns(["Item", "Cost", "Units", "Cadence", "Note"], rows, new Set())).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
  });

  it("keeps a copyable column left so its copy control lines up", () => {
    expect(numericColumns(["Item", "Cost", "Units"], rows, new Set([1]))).toEqual([false, false, true]);
  });

  it("sets figure columns flush right in both header and cells", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Table columns={["Item", "Cost"]} rows={[{ id: "a", cells: ["Rent", { amount: 1200, currency: "USD" }] }]} />
      </TestViewerFormatting>,
    );
    expect(html.match(/text-right/g)).toHaveLength(2);
  });
});

describe("records presentation", () => {
  it("defaults to grid up to three columns and records beyond that", () => {
    expect(defaultTablePresentation(1)).toBe("grid");
    expect(defaultTablePresentation(3)).toBe("grid");
    expect(defaultTablePresentation(4)).toBe("records");
  });

  it("keys each record on the named column, or the first column when unnamed", () => {
    expect(recordKeyIndex(["Restaurant", "Cuisine", "Price"], "Cuisine")).toBe(1);
    expect(recordKeyIndex(["Restaurant", "Cuisine", "Price"], undefined)).toBe(0);
    // A key_column that does not name a real column falls back rather than throwing.
    expect(recordKeyIndex(["Restaurant", "Cuisine"], "Rating")).toBe(0);
  });

  it("renders each row as a block headed by its key column value", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Table
          presentation="records"
          key_column="Restaurant"
          columns={["Restaurant", "Cuisine", "Price"]}
          rows={[{ id: "a", cells: ["Taberna da Rua das Flores", "Portuguese", { amount: 38, currency: "EUR" }] }]}
        />
      </TestViewerFormatting>,
    );
    expect(html).toContain("Taberna da Rua das Flores");
    expect(html).toContain("Cuisine");
    expect(html).toContain("Portuguese");
    expect(html).toContain("€38");
    // No horizontal scroll region in the stacked reading.
    expect(html).not.toContain('aria-label="Data table"');
  });

  it("keeps a wide table on grid when the agent pins it", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Table
          presentation="grid"
          columns={["", "A", "B", "C"]}
          rows={[{ id: "r", cells: ["Price", 1, 2, 3] }]}
        />
      </TestViewerFormatting>,
    );
    expect(html).toContain('aria-label="Data table"');
  });

  it("gives a copyable column its copy control in records too", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Table
          presentation="records"
          key_column="Restaurant"
          copyable_columns={[1]}
          columns={["Restaurant", "Reservation", "Price"]}
          rows={[{ id: "a", cells: ["Belcanto", "RES-2201", { amount: 150, currency: "EUR" }] }]}
        />
      </TestViewerFormatting>,
    );
    expect(html).toContain('aria-label="Copy RES-2201"');
  });
});

describe("table empty state", () => {
  it("renders the empty sentence instead of a header over nothing", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Table columns={["Name"]} rows={[]} empty="No records yet." />
      </TestViewerFormatting>,
    );
    expect(html).toContain("No records yet.");
    expect(html).not.toContain('aria-label="Data table"');
  });
});
