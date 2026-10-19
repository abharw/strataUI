import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BundlePageViewer } from "@/shared/navigation/viewer";
import type { FormatEnvironment } from "@/shared/formatting/display";
import type { StrataSpec } from "@/page-content/schema";
import { FixedViewerFormattingProvider } from "@/shared/formatting/viewer";

import { BundlePageFrame } from "./page-frame";

const ENVIRONMENT: FormatEnvironment = {
  locale: "en-US",
  timeZone: "America/New_York",
  now: Date.parse("2026-08-27T12:00:00-04:00"),
};

const SPEC = {
  root: "body",
  answer: { verdict: "Ready for review." },
  elements: {
    body: {
      type: "callout",
      props: { text: "The durable page body." },
      children: [],
    },
  },
} satisfies StrataSpec;

function renderFormatted(child: React.ReactNode): string {
  return renderToStaticMarkup(
    <FixedViewerFormattingProvider environment={ENVIRONMENT}>
      {child}
    </FixedViewerFormattingProvider>,
  );
}

describe("shared document frames", () => {
  it("gives a nested bundle page a 44px, truncating Space back link", () => {
    const viewer: BundlePageViewer = {
      kind: "bundle",
      space: {
        name: `Product launch ${"working group ".repeat(12)}`,
        url: "/share/spk_bundle",
      },
    };
    const html = renderFormatted(
      <BundlePageFrame
        viewer={viewer}
        title="Launch brief"
        spec={SPEC}
        updatedAt="2026-08-26T14:00:00Z"
      />,
    );

    expect(html).toContain('href="/share/spk_bundle"');
    expect(html).toContain("min-h-control");
    expect(html).toContain("truncate");
    expect(html).toContain("Ready for review.");
  });

  it("draws the sequence a bundle reader may follow, inside the bundle", () => {
    const viewer: BundlePageViewer = {
      kind: "bundle",
      space: { name: "Training", url: "/share/spk_bundle" },
    };
    const html = renderFormatted(
      <BundlePageFrame
        viewer={viewer}
        title="Day 2"
        spec={SPEC}
        updatedAt="2026-08-26T14:00:00Z"
        sequence={{
          previous: { href: "/share/spk_bundle/pages/day-1", title: "Day 1" },
          next: { href: "/share/spk_bundle/pages/day-3", title: "Day 3" },
          up: { href: "/share/spk_bundle/pages/week-1", title: "Week 1" },
        }}
      />,
    );

    // Every arrow stays inside the key the reader already holds.
    expect(html).toContain('aria-label="Sequence"');
    expect(html).toContain('href="/share/spk_bundle/pages/week-1"');
    expect(html).toContain('href="/share/spk_bundle/pages/day-1"');
    expect(html).toContain('href="/share/spk_bundle/pages/day-3"');
    expect(html).toContain("Week 1");
  });
});
