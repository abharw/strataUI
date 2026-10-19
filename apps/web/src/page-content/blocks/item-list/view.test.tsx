import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "@/page-content/test-format";
import { groupByDay, initialDay, ItemList } from "./view";
import { schema } from "./schema";

/** Extracts the balanced `<div …>…</div>` starting at `openTagNeedle` from static markup. */
function extractBalancedDiv(html: string, openTagNeedle: string): string {
  const start = html.indexOf(openTagNeedle);
  if (start === -1) throw new Error(`not found: ${openTagNeedle}`);
  // `start` is already past this div's `<div`, so it counts as the open div.
  let depth = 1;
  let i = start;
  while (i < html.length && depth > 0) {
    if (html.startsWith("<div", i)) {
      depth += 1;
      i += 4;
    } else if (html.startsWith("</div>", i)) {
      depth -= 1;
      i += 6;
    } else {
      i += 1;
    }
  }
  return html.slice(start, i);
}

describe("item-list presentations", () => {
  it("renders rows with a title, description and value", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ItemList
          items={[
            {
              id: "unit-4b",
              title: "Unit 4B",
              description: "2BR, top floor",
              value: { amount: 2150, currency: "USD" },
            },
          ]}
        />
      </TestViewerFormatting>,
    );
    expect(html).toContain("Unit 4B");
    expect(html).toContain("2BR, top floor");
    expect(html).toContain("$2,150");
  });

  it("renders each row as a bordered tile in a one-column stack under cards", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ItemList
          presentation="cards"
          items={[
            { id: "a", title: "First" },
            { id: "b", title: "Second" },
          ]}
        />
      </TestViewerFormatting>,
    );
    expect(html.match(/rounded-contained/g)?.length).toBeGreaterThanOrEqual(2);
    // Cards are not hairline-divided rows: no separator between them.
    expect(html).not.toContain('data-slot="item-separator"');
  });

  it("renders a plain divider-separated list under rows, the default", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ItemList
          items={[
            { id: "a", title: "First" },
            { id: "b", title: "Second" },
          ]}
        />
      </TestViewerFormatting>,
    );
    expect(html).toContain('data-slot="item-separator"');
  });
});

describe("item-list day grouping", () => {
  it("groups rows by day, ascending, only when every row carries one", () => {
    const items = [
      { id: "c", title: "C", on: "2026-09-14" },
      { id: "a", title: "A", on: "2026-09-12" },
      { id: "b", title: "B", on: "2026-09-12" },
    ];
    expect(groupByDay(items)).toEqual([
      { day: "2026-09-12", items: [items[1], items[2]] },
      { day: "2026-09-14", items: [items[0]] },
    ]);
  });

  it("does not group when only some rows carry a day", () => {
    const items = [
      { id: "a", title: "A", on: "2026-09-12" },
      { id: "b", title: "B" },
    ];
    expect(groupByDay(items)).toBeNull();
  });

  it("renders a date heading per group, in ascending order", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ItemList
          items={[
            { id: "sintra", title: "Pena Palace", on: "2026-09-14" },
            { id: "arrival", title: "Land at LIS", on: "2026-09-12" },
          ]}
        />
      </TestViewerFormatting>,
    );
    const arrivalIndex = html.indexOf("Sat, Sep 12");
    const sintraIndex = html.indexOf("Mon, Sep 14");
    expect(arrivalIndex).toBeGreaterThan(-1);
    expect(sintraIndex).toBeGreaterThan(arrivalIndex);
  });
});

describe("item-list by-day", () => {
  const week = [
    { id: "mon", title: "Easy run", value: "5 km", on: "2026-09-14" },
    { id: "tue", title: "Lift", on: "2026-09-15" },
    { id: "tue-2", title: "Mobility", on: "2026-09-15" },
    { id: "thu", title: "Tempo", value: "6 km", on: "2026-09-17" },
  ];

  it("opens on today, else the first day ahead, else the last day", () => {
    const days = ["2026-09-14", "2026-09-15", "2026-09-17"];
    expect(initialDay(days, "2026-09-15")).toBe("2026-09-15");
    expect(initialDay(days, "2026-09-16")).toBe("2026-09-17");
    expect(initialDay(days, "2026-09-01")).toBe("2026-09-14");
    expect(initialDay(days, "2026-10-01")).toBe("2026-09-17");
  });

  it("renders one day's rows with a previous/next pair and the day's place in the set", () => {
    // TestViewerFormatting pins the clock, so exactly one day's rows render.
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ItemList items={week} presentation="by-day" />
      </TestViewerFormatting>,
    );
    expect(html).toContain('aria-label="Previous day"');
    expect(html).toContain('aria-label="Next day"');
    const shown = /data-day="(\d{4}-\d{2}-\d{2})"/.exec(html)?.[1];
    expect(shown).toBeDefined();
    const onScreen = week.filter((item) => item.on === shown).map((item) => item.title);
    const offScreen = week.filter((item) => item.on !== shown).map((item) => item.title);
    for (const title of onScreen) expect(html).toContain(title);
    for (const title of offScreen) expect(html).not.toContain(title);
    expect(html).toMatch(/[123] \/ 3/);
  });

  it("is refused by the schema when any row lacks a day", () => {
    const dated = schema.safeParse({ items: week, presentation: "by-day" });
    expect(dated.success).toBe(true);

    const undated = schema.safeParse({
      items: [...week, { id: "note", title: "Undated" }],
      presentation: "by-day",
    });
    expect(undated.success).toBe(false);
    if (!undated.success) {
      expect(undated.error.issues.some((issue) => issue.message.includes("every row needs an on date"))).toBe(true);
    }
  });
});

describe("item-list link rendering", () => {
  it("wraps a resolved page link in a client Link with a chevron", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ItemList items={[{ id: "a", title: "Day 1", link: { page: "11111111-1111-1111-1111-111111111111", href: "/pages/day-1" } }]} />
      </TestViewerFormatting>,
    );
    expect(html).toContain('href="/pages/day-1"');
    // The chevron is the affordance for a followable internal link.
    expect(html.match(/<svg/g)?.length).toBeGreaterThan(0);
  });

  it("opens an external link in a new tab and says so once", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ItemList items={[{ id: "a", title: "Book now", link: { url: "https://example.com/book" } }]} />
      </TestViewerFormatting>,
    );
    expect(html).toContain('href="https://example.com/book"');
    expect(html).toContain('target="_blank"');
    expect(html.match(/\(opens in a new tab\)/g)).toHaveLength(1);
  });

  // The external icon must sit inside the row's trailing flex group so it wraps with the value
  // instead of dropping to its own line.
  it("keeps the external-link icon inside the row's trailing group, not appended after it", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ItemList
          items={[
            {
              id: "a",
              title: "A very long row title that could otherwise push the icon off the line",
              value: 42,
              link: { url: "https://example.com/book" },
            },
          ]}
        />
      </TestViewerFormatting>,
    );

    const actions = extractBalancedDiv(html, 'data-slot="item-actions"');
    // The icon is a DOM descendant of item-actions, not a sibling after the row.
    expect(actions).toContain("42");
    expect(actions).toContain('data-icon="row-external"');
    expect(actions).toContain('data-icon="inline-end"');

    // Nothing about the icon comes after the trailing group closes.
    const afterActions = html.slice(html.indexOf(actions) + actions.length);
    expect(afterActions).not.toContain('data-icon="row-external"');
  });

  it("renders an unresolved page link as plain content with no tap affordance", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ItemList items={[{ id: "a", title: "Private day", link: { page: "11111111-1111-1111-1111-111111111111" } }]} />
      </TestViewerFormatting>,
    );
    expect(html).toContain('data-page-id="11111111-1111-1111-1111-111111111111"');
    expect(html).not.toContain("<a ");
  });
});

describe("item-list empty state", () => {
  it("renders the empty sentence instead of a blank shell", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ItemList items={[]} empty="No items yet." />
      </TestViewerFormatting>,
    );
    expect(html).toContain("No items yet.");
  });
});
