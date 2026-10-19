import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GeneratedHeading, Section, SectionHeadingProvider } from "./view";

describe("generated heading hierarchy", () => {
  it("derives leaf headings from their section depth", () => {
    const html = renderToStaticMarkup(
      <SectionHeadingProvider level={2}>
        <Section title="Options">
          <GeneratedHeading>Morning</GeneratedHeading>
        </Section>
      </SectionHeadingProvider>,
    );

    expect(html).toContain("<h2");
    expect(html).toContain("Options</h2>");
    expect(html).toContain("<h3");
    expect(html).toContain("Morning</h3>");
    expect(html).not.toMatch(/<h[45]/);
  });
});
