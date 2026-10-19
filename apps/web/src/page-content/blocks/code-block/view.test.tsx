import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CodeBlock } from "./view";

describe("code-block", () => {
  it("renders exact text as escaped, keyboard-scrollable code", () => {
    const html = renderToStaticMarkup(
      <CodeBlock
        code={'<script>alert("no")</script>\n  indented'}
        language="html"
        filename="example.html"
      />,
    );
    expect(html).toContain("<pre");
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('<script>alert("no")');
    expect(html).toContain("  indented");
  });

  it("offers no scroll instruction before anything has been measured", () => {
    const html = renderToStaticMarkup(<CodeBlock code="short()" language="ts" />);

    expect(html).not.toContain("Scroll horizontally");
    expect(html).not.toContain("aria-describedby");
  });
});
