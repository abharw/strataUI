import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlusIcon } from "@phosphor-icons/react/dist/ssr/Plus";

import { EmptyState } from "./empty-state";

describe("the one empty pattern", () => {
  it("renders a list slot as a muted line at row height, without the caller's gutter", () => {
    const html = renderToStaticMarkup(<EmptyState title="No Pages yet." />);

    expect(html).toContain("min-h-control");
    expect(html).toContain("py-2.5");
    expect(html).toContain("text-body");
    expect(html).toContain("text-product-muted-foreground");
    expect(html).toMatch(/>\s*No Pages yet\.\s*</u);
    // Horizontal padding belongs to the caller so the line aligns with the rows.
    expect(html).not.toMatch(/\bpx-\d/u);
    expect(html).not.toContain("uppercase");
  });

  it("keeps a row free of the glyph even when one is passed", () => {
    const html = renderToStaticMarkup(
      <EmptyState icon={PlusIcon} title="No signed-in devices." />,
    );

    // A glyph in a list row would read as an item.
    expect(html).not.toContain("<svg");
    expect(html).not.toContain('data-slot="empty-icon"');
  });

  it("carries the icon, description and action when a whole surface is empty", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        size="screen"
        icon={PlusIcon}
        title="Nothing here yet."
        description="Create a Space to keep your first Pages in."
        action={<button type="button">Create a Space</button>}
      />,
    );

    expect(html).toContain('data-slot="empty"');
    expect(html).toContain('data-variant="icon"');
    expect(html).toContain("<svg");
    expect(html).toContain('data-slot="empty-title"');
    expect(html).toContain('data-slot="empty-description"');
    expect(html).toContain('data-slot="empty-content"');
    expect(html).toMatch(/>\s*Create a Space\s*</u);
    expect(html).toContain("max-w-md");
    expect(html).toContain("py-10");
    expect(html).toContain("sm:py-14");
    expect(html).not.toContain("uppercase");
  });
});
