import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { InventorySpace, ListPage } from "@/server/spaces/read/lists";

import type { HomeTreeSpace } from "./home-inventory";
import { HomeSelectionProvider } from "./home-selection";
import { PageRow, SelectablePageRow } from "./page-row";
import { groupRecentPages, RecentGroups } from "./recent-groups";
import { HomeSpaceRow } from "./space-row";

const parent: InventorySpace = {
  id: "space-field",
  slug: "field-notes",
  name: "Field notes",
  emoji: "🧭",
  activePageCount: 3,
  sharedPageCount: 1,
  privatePageCount: 2,
  updatedAt: new Date("2026-08-27T12:00:00.000Z"),
  shareUrl: null,
  sharedAt: null,
};

function page(id: string, extra: Partial<ListPage> = {}): ListPage {
  return {
    id,
    title: `Page ${id}`,
    answer: "Rain shell is the only item still missing.",
    updatedAt: new Date("2026-08-27T12:00:00.000Z"),
    lastViewedAt: null,
    pinned: false,
    kind: "living",
    url: null,
    shared: false,
    exposureActor: "system",
    spaceId: parent.id,
    spaceSlug: parent.slug,
    spaceName: parent.name,
    writer: null,
    lastSummary: null,
    ...extra,
  };
}

function tree(space: InventorySpace, pages: ListPage[]): HomeTreeSpace {
  return { space, allPages: pages, pages, matchesSpace: false };
}

/** An unseen Page is marked visually and in its description, never by colour alone. */
describe("an unseen Page row", () => {
  it("draws a dot, sets the title in the heavier weight, and says so in its description", () => {
    const html = renderToStaticMarkup(
      <ul><PageRow page={page("moved", { unseen: true })} context={parent.name} /></ul>,
    );

    // A 6px foreground mark, not a row tint.
    expect(html).toContain("size-1.5 shrink-0 rounded-full bg-foreground");
    expect(html).toContain("font-semibold");
    expect(html).toContain("updated since you last opened");
    // Announced via the existing description; the link's name is unchanged.
    expect(html).toContain('aria-describedby="page-moved-detail page-moved-time page-moved-unseen"');
    expect(html).toContain('id="page-moved-unseen"');
    expect(html).not.toContain("updated since you last opened</span></a>, updated since");
  });

  it("leaves a Page the owner has already opened exactly as it was", () => {
    const html = renderToStaticMarkup(
      <ul><PageRow page={page("read")} context={parent.name} /></ul>,
    );

    expect(html).not.toContain("bg-foreground");
    expect(html).not.toContain("font-semibold");
    expect(html).not.toContain("updated since you last opened");
    expect(html).toContain('aria-describedby="page-read-detail page-read-time"');
  });

  it("says the same thing while the row is a checkbox", () => {
    const pages = [page("moved", { unseen: true })];
    const html = renderToStaticMarkup(
      <HomeSelectionProvider spaces={[parent]} pages={pages} initialSelecting>
        <ul><SelectablePageRow page={pages[0]} context={parent.name} /></ul>
      </HomeSelectionProvider>,
    );

    expect(html).toContain("size-1.5 shrink-0 rounded-full bg-foreground");
    // The checkbox is still named by the title alone.
    expect(html).toContain('aria-label="Page moved"');
    expect(html).toContain('aria-describedby="page-moved-detail page-moved-time page-moved-unseen"');
  });

  it("comes to the Recent tab for free, because it is the same row", () => {
    const html = renderToStaticMarkup(
      <RecentGroups groups={groupRecentPages([page("moved", { unseen: true }), page("read")])} />,
    );

    expect(html).toContain("size-1.5 shrink-0 rounded-full bg-foreground");
    expect(html).toContain('id="page-moved-unseen"');
    expect(html).not.toContain('id="page-read-unseen"');
  });

  /** Rows use the server-computed flag so Home and the changes popover share one rule. */
  it("follows the flag the read layer computed, whatever the timestamps say", () => {
    const viewedBefore = page("flagged", { lastViewedAt: new Date("2026-08-20T12:00:00.000Z") });
    const unflagged = renderToStaticMarkup(<ul><PageRow page={viewedBefore} context={parent.name} /></ul>);
    expect(unflagged).not.toContain("updated since you last opened");

    const viewedAfter = page("flagged", {
      lastViewedAt: new Date("2026-08-28T12:00:00.000Z"),
      unseen: true,
    });
    const flagged = renderToStaticMarkup(<ul><PageRow page={viewedAfter} context={parent.name} /></ul>);
    expect(flagged).toContain("updated since you last opened");

    // The Space line counts what the read layer counted, not what its rows' timestamps imply.
    const space = renderToStaticMarkup(<ul><HomeSpaceRow entry={tree(parent, [viewedBefore])} /></ul>);
    expect(space).toContain("3 Pages · Not shared");
  });
});

describe("a Space status line", () => {
  it("counts the unseen Pages after the Page count, and says nothing when there are none", () => {
    const html = renderToStaticMarkup(
      <ul><HomeSpaceRow entry={tree({ ...parent, unseenPageCount: 2 }, [])} /></ul>,
    );
    expect(html).toContain("3 Pages · 2 updated · Not shared");

    const one = renderToStaticMarkup(
      <ul><HomeSpaceRow entry={tree({ ...parent, unseenPageCount: 1 }, [])} /></ul>,
    );
    expect(one).toContain("3 Pages · 1 updated · Not shared");

    const none = renderToStaticMarkup(
      <ul><HomeSpaceRow entry={tree(parent, [])} /></ul>,
    );
    expect(none).toContain("3 Pages · Not shared");
    expect(none).not.toContain("updated ·");
    expect(none).not.toContain("0 updated");
  });

  it("keeps the exposure clause of a shared Space whole", () => {
    const shared: InventorySpace = {
      ...parent,
      shareUrl: "https://strata.test/share/spk_field",
      sharedAt: new Date("2026-08-26T10:00:00.000Z"),
      unseenPageCount: 2,
    };
    const html = renderToStaticMarkup(<ul><HomeSpaceRow entry={tree(shared, [])} /></ul>);

    expect(html).toContain("1 of 3 Pages shared · 2 updated");
  });
});
