import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FixedViewerFormattingProvider } from "@/shared/formatting/viewer";
import type { AttachmentResources } from "@/page-content/attachments/resources";
import { AttachmentResolverProvider } from "@/page-content/blocks/attachment-list/resolver";

import { PageSteps } from "./page-steps";

const ENVIRONMENT = {
  locale: "en-US",
  timeZone: "America/New_York",
  now: Date.parse("2026-08-27T16:00:00-04:00"),
};

const steps = [
  { version: 2, summary: "Opened the booking form.", at: "2026-08-27T15:00:00-04:00" },
  {
    version: 3,
    summary: "Filled the passenger details.",
    at: "2026-08-27T15:57:00-04:00",
    assetRefs: ["asset_shot", "asset_pending"],
  },
];

function html(over: { open?: boolean; assets?: AttachmentResources } = {}) {
  return renderToStaticMarkup(
    <FixedViewerFormattingProvider environment={ENVIRONMENT}>
      <AttachmentResolverProvider assets={over.assets ?? {}}>
        <PageSteps steps={steps} defaultOpen={over.open ?? false} />
      </AttachmentResolverProvider>
    </FixedViewerFormattingProvider>,
  );
}

describe("the View steps section", () => {
  it("arrives folded, with the count on the fold and no rows rendered", () => {
    const closed = html();
    expect(closed).toContain("View steps");
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain("2 steps");
    expect(closed).not.toContain("Opened the booking form.");
    // The caret is the affordance; no visible text spells out the act.
    const visible = closed.replace(/<[^>]+>/gu, " ");
    expect(visible).not.toMatch(/expand|collapse/iu);
    expect(visible).not.toMatch(/VIEW STEPS/u);
  });

  it("lists the newest step first, with the version behind the time", () => {
    const open = html({ open: true });
    expect(open.indexOf("Filled the passenger details.")).toBeLessThan(open.indexOf("Opened the booking form."));
    expect(open).toContain('dateTime="2026-08-27T15:57:00-04:00"');
    // The version is in the tooltip and screen-reader text, not the visible line.
    expect(open).toMatch(/title="v3 · /u);
    expect(open).toContain("Version 3: ");
  });

  it("draws the run on the page's own timeline: gray rail, hollow ring, no accent", () => {
    const open = html({ open: true });
    expect(open).toContain('data-slot="timeline"');
    expect(open).toContain('role="list"');
    // Same rail and ring as the registry timeline.
    expect(open).toMatch(/timeline-separator[^>]*bg-muted-foreground|bg-muted-foreground[^>]*timeline-separator/u);
    expect(open).toMatch(/timeline-indicator[^>]*border-muted-foreground|border-muted-foreground[^>]*timeline-indicator/u);
    expect(open).not.toContain('data-completed="true"');
    expect(open).not.toMatch(/<h[1-6][^>]*>Filled the passenger details/u);
  });

  it("draws a step's files through the page's attachment resolver", () => {
    const open = html({
      open: true,
      assets: {
        asset_shot: {
          href: "/pages/p1/assets/asset_shot",
          thumb_url: "/pages/p1/assets/asset_shot?w=thumb",
          thumb_width: 640,
          thumb_height: 400,
          filename: "step-3.png",
          media_type: "image/png",
          size_bytes: 1024,
          width: 1280,
          height: 800,
        },
      },
    });
    // The tile uses the thumbnail; the tap opens the full file.
    expect(open).toContain('src="/pages/p1/assets/asset_shot?w=thumb"');
    expect(open).toContain('href="/pages/p1/assets/asset_shot"');
    expect(open).toContain('width="640"');
    expect(open).toContain("Not available yet");
  });

  it("follows nothing but host-minted relative links", () => {
    const open = html({
      open: true,
      assets: {
        asset_shot: {
          href: "https://elsewhere.example/shot.png",
          filename: "step-3.png",
          media_type: "image/png",
          size_bytes: 1024,
        },
      },
    });
    expect(open).not.toContain("elsewhere.example");
    expect(open).toContain("Not available yet");
  });
});
