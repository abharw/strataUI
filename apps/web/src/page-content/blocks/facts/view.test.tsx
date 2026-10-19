import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestViewerFormatting } from "@/page-content/test-format";
import { defaultFactsPresentation, Facts } from "./view";

describe("facts device default", () => {
  it("stays inline when every rendered value is short", () => {
    expect(
      defaultFactsPresentation(
        [{ id: "a", label: "Seats", value: "14A, 14B" }],
        (value) => String(value),
      ),
    ).toBe("inline");
  });

  it("goes stacked once a rendered value runs past 40 characters", () => {
    expect(
      defaultFactsPresentation(
        [{ id: "a", label: "Note", value: "a".repeat(41) }],
        (value) => String(value),
      ),
    ).toBe("stacked");
  });
});

describe("facts presentations", () => {
  it("renders the compact two-column look for inline", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Facts presentation="inline" items={[{ id: "seats", label: "Seats", value: "14A, 14B" }]} />
      </TestViewerFormatting>,
    );
    expect(html).toContain("Seats");
    expect(html).toContain("14A, 14B");
    expect(html).toContain('<dl class="');
  });

  // The inline row stacks via a container query on the card's `@container/card`. jsdom cannot
  // evaluate container queries, so this only checks the classes.
  it("carries container-query classes that stack the inline row once its card gets narrow", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Facts
          presentation="inline"
          items={[
            { id: "check-in", label: "Check-in", value: "3:00 PM" },
            { id: "rate", label: "Per night", value: "$210" },
          ]}
        />
      </TestViewerFormatting>,
    );

    expect(html).toContain("@max-[220px]/card:flex-col");
    expect(html).toContain("@max-[220px]/card:w-full");
  });

  it("gives a stacked row full width for a long value", () => {
    const long = "A very long note that would not fit a compact two-column row without wrapping badly.";
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Facts presentation="stacked" items={[{ id: "note", label: "Note", value: long }]} />
      </TestViewerFormatting>,
    );
    expect(html).toContain(long);
  });

  it("picks the device default from the rendered value length when presentation is null", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Facts items={[{ id: "hotel", label: "Hotel", value: "Casa do Beco, Alfama" }]} />
      </TestViewerFormatting>,
    );
    expect(html).toContain("Casa do Beco, Alfama");
  });
});

describe("facts hierarchy", () => {
  it("makes the label the anchor in inline: foreground, medium weight, and never smaller than the value", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Facts
          presentation="inline"
          items={[{ id: "flight", label: "Flight out", value: "ANA nonstop JFK to HND, Nov 12" }]}
        />
      </TestViewerFormatting>,
    );

    expect(html).toContain('class="min-w-0 flex-[0.85] break-words text-ui font-medium leading-5 text-foreground');
    // The value is foreground, regular weight, one size below the label.
    expect(html).toContain('class="min-w-0 flex-[1.15] break-words text-right text-supporting font-normal leading-5 text-foreground');
    expect(html).not.toContain("text-muted-foreground");
  });

  it("keeps the label and value the same size in stacked, value underneath", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Facts
          presentation="stacked"
          items={[{ id: "flight", label: "Flight out", value: "ANA nonstop JFK to HND, Nov 12" }]}
        />
      </TestViewerFormatting>,
    );

    expect(html).toContain('class="min-w-0 break-words text-ui font-medium leading-5 text-foreground">Flight out<');
    expect(html).toContain('class="mt-1 min-w-0 break-words text-ui font-normal leading-5 text-foreground tabular-nums');
  });
});

describe("facts copyable fields", () => {
  it("gives a copyable fact the tap-to-copy control instead of plain text", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Facts
          items={[{ id: "record-locator", label: "Record locator", value: "ABC123", copyable: true }]}
        />
      </TestViewerFormatting>,
    );
    expect(html).toContain('aria-label="Copy Record locator"');
    expect(html).toContain("ABC123");
  });

  it("leaves a non-copyable fact as plain formatted text", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Facts items={[{ id: "airline", label: "Airline", value: "TAP Air Portugal" }]} />
      </TestViewerFormatting>,
    );
    expect(html).not.toContain("aria-label=\"Copy Airline\"");
    expect(html).toContain("TAP Air Portugal");
  });
});

describe("facts empty state", () => {
  it("renders the empty sentence instead of a blank shell", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <Facts items={[]} empty="No confirmation details yet." />
      </TestViewerFormatting>,
    );
    expect(html).toContain("No confirmation details yet.");
  });
});
