import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Carousel, slideHidden } from "./view";

const slides = (html: string) => html.match(/<div[^>]*aria-roledescription="slide"[^>]*>/g) ?? [];

describe("carousel", () => {
  it("keeps labelled 44px previous and next controls in the mobile markup", () => {
    const html = renderToStaticMarkup(
      <Carousel>
        <article>First</article>
        <article>Second</article>
      </Carousel>,
    );

    expect(html).toContain('aria-label="Previous card"');
    expect(html).toContain('aria-label="Next card"');
    expect(html.match(/size-control/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("1 / 2");
  });

  // Before Embla measures, nothing may be `inert`: desktop CSS already shows two cards.
  it("hides nothing before the carousel has measured, and scrolls so every card is reachable", () => {
    const html = renderToStaticMarkup(
      <Carousel>
        <article>First</article>
        <article>Second</article>
        <article>Third</article>
      </Carousel>,
    );

    expect(slides(html)).toHaveLength(3);
    expect(html).not.toContain("inert");
    expect(slides(html).some((slide) => slide.includes("aria-hidden"))).toBe(false);
    expect(html).toContain("First");
    expect(html).toContain("Third");
    // The viewport scrolls natively until Embla takes over, with the same layout, so nothing jumps.
    expect(html).toContain("overflow-x-auto");
    expect(html).not.toContain("flex-wrap");
  });
});

describe("slide inertness", () => {
  it("treats an unmeasured carousel as one where nothing is offscreen", () => {
    expect(slideHidden(null, 0)).toBe(false);
    expect(slideHidden(null, 4)).toBe(false);
  });

  it("takes only measured offscreen slides out of the page", () => {
    expect(slideHidden([0, 1], 0)).toBe(false);
    expect(slideHidden([0, 1], 1)).toBe(false);
    expect(slideHidden([0, 1], 2)).toBe(true);
  });
});
