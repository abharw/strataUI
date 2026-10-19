import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FixedViewerFormattingProvider } from "@/shared/formatting/viewer";
import { newestFirst, PageChangesPopover } from "./page-changes";

const ENVIRONMENT = {
  locale: "en-US",
  timeZone: "America/New_York",
  now: Date.parse("2026-08-27T16:00:00-04:00"),
};

describe("page changes popover", () => {
  it("has no entrance on first paint: the trigger was always there", () => {
    const html = renderToStaticMarkup(
      <FixedViewerFormattingProvider environment={ENVIRONMENT}>
        <PageChangesPopover
          announcementVersion={null}
          updatedAt="2026-08-27T15:57:00-04:00"
          changes={[{ version: 2, summary: "Updated.", at: "2026-08-27T15:57:00-04:00" }]}
        />
      </FixedViewerFormattingProvider>,
    );

    expect(html).not.toContain("strata-strip-in");
  });

  it("lists the newest change first, nearest the trigger", () => {
    // The store appends, so its last entry is the newest.
    const changes = [
      { version: 2, summary: "The older one.", at: "2026-08-27T15:00:00-04:00" },
      { version: 3, summary: "The newer one.", at: "2026-08-27T15:57:00-04:00" },
    ];
    expect(newestFirst(changes).map((change) => change.version)).toEqual([3, 2]);
    expect(changes.map((change) => change.version)).toEqual([2, 3]);
  });

  it("announces a newly arrived update in a dedicated live region", () => {
    const html = renderToStaticMarkup(
      <FixedViewerFormattingProvider environment={ENVIRONMENT}>
        <PageChangesPopover
          announcementVersion={2}
          updatedAt="2026-08-27T15:57:00-04:00"
          changes={[{
            version: 2,
            summary: "Venue availability was updated.",
            at: "2026-08-27T15:57:00-04:00",
          }]}
        />
      </FixedViewerFormattingProvider>,
    );

    expect(html).toContain('data-slot="page-update-announcement"');
    expect(html).toContain('role="status"');
    expect(html).toContain("New update available.");
    expect(html).not.toContain('aria-live="assertive"');
  });
});
