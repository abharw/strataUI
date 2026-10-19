import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ConfirmDialogProps } from "@/shared/ui/confirm-dialog";

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// The open dialog portals after hydration, so tests read what the toolbar asks it to say.
const confirmation = vi.hoisted(() => ({ props: null as ConfirmDialogProps | null }));
vi.mock("@/shared/ui/confirm-dialog", () => ({
  ConfirmDialog: (props: ConfirmDialogProps) => {
    confirmation.props = props;
    return null;
  },
}));

import type { InventorySpace, ListPage } from "@/server/spaces/read/lists";
import type { PageWriter } from "@/server/pages/read/provenance";
import { TooltipProvider } from "@/shared/ui/primitives/tooltip";

import { agentHue, agentMonogram } from "@/shared/ui/agent-avatar";
import { writerTooltipText } from "@/shared/ui/writer-mark";
import { HomeSearch } from "./home-search";
import { HomeSelectionProvider, useHomeSelection, type HomeSelectionValue } from "./home-selection";
import { filterHomeTree, groupRecentPages, HomeSpaceRow, HomeTree } from "./home-tree";
import { HomeSelectionToolbar, selectionCounts } from "./selection-toolbar";

const firstSpace: InventorySpace = {
  id: "space-field",
  slug: "field-notes",
  name: "Field notes",
  emoji: "🧭",
  activePageCount: 1,
  sharedPageCount: 0,
  privatePageCount: 1,
  updatedAt: new Date("2026-08-27T12:00:00.000Z"),
  shareUrl: null,
  sharedAt: null,
};

const secondSpace: InventorySpace = {
  id: "space-garden",
  slug: "garden",
  name: "Garden",
  emoji: "🌱",
  activePageCount: 1,
  sharedPageCount: 1,
  privatePageCount: 0,
  updatedAt: new Date("2026-08-26T12:00:00.000Z"),
  shareUrl: "https://strata.test/share/spk_garden",
  sharedAt: new Date("2026-08-26T10:00:00.000Z"),
};

const pages: ListPage[] = [
  {
    id: "page-packing",
    title: "Packing list",
    answer: "Rain shell remains.",
    updatedAt: new Date("2026-08-27T12:00:00.000Z"),
    lastViewedAt: null,
    pinned: false,
    kind: "living",
    url: null,
    shared: false,
    exposureActor: "system",
    spaceId: firstSpace.id,
    spaceSlug: firstSpace.slug,
    spaceName: firstSpace.name,
    writer: null,
    lastSummary: null,
  },
  {
    id: "page-seeds",
    title: "Seed catalog",
    answer: "Shared with the garden group.",
    updatedAt: new Date("2026-08-26T12:00:00.000Z"),
    lastViewedAt: null,
    pinned: false,
    kind: "living",
    url: null,
    shared: true,
    exposureActor: "system",
    spaceId: secondSpace.id,
    spaceSlug: secondSpace.slug,
    spaceName: secondSpace.name,
    writer: null,
    lastSummary: null,
  },
];

/** Hands the selection context to the test, which cannot click Done. */
function SelectionProbe({ onRender }: { onRender: (selection: HomeSelectionValue | null) => void }) {
  onRender(useHomeSelection());
  return null;
}

describe("HomeTree", () => {
  it("keeps a matching Page under its Space and keeps every Page of a matching Space", () => {
    const otherFieldPage: ListPage = {
      ...pages[0],
      id: "page-reservations",
      title: "Reservations",
    };
    const packing = filterHomeTree(
      [firstSpace, secondSpace],
      [pages[0], otherFieldPage, pages[1]],
      "packing",
    );
    expect(packing).toEqual([
      expect.objectContaining({ space: firstSpace, pages: [pages[0]], matchesSpace: false }),
    ]);
    // The Drawer selector keeps full Space membership even when only one row matches.
    expect(packing[0]?.allPages).toEqual([pages[0], otherFieldPage]);
    expect(filterHomeTree([firstSpace, secondSpace], pages, "garden")).toEqual([
      expect.objectContaining({ space: secondSpace, pages: [pages[1]], matchesSpace: true }),
    ]);
    // Body results arrive as IDs; the document never reaches Home's client payload.
    expect(filterHomeTree([firstSpace, secondSpace], pages, "cobalt", new Set([pages[0].id])))
      .toEqual([
        expect.objectContaining({ space: firstSpace, pages: [pages[0]], matchesSpace: false }),
      ]);
  });

  it("groups recent Pages by the reader's calendar day, newest first", () => {
    const groups = groupRecentPages([...pages].reverse());

    // Without a time zone, grouping is in UTC.
    expect(groups.map((group) => group.day)).toEqual(["2026-08-27", "2026-08-26"]);
    expect(groups[0]?.pages).toEqual([pages[0]]);

    const local = groupRecentPages([...pages].reverse(), {
      locale: "en-US",
      timeZone: "Pacific/Honolulu",
    });
    expect(local.map((group) => group.day)).toEqual(["2026-08-27", "2026-08-26"]);
    expect(local[0]?.label).toBe("August 27, 2026");

    // An instant that is already tomorrow in UTC is still today in New York.
    const evening: ListPage = { ...pages[0], id: "page-evening", updatedAt: new Date("2026-08-28T01:00:00.000Z") };
    const newYork = groupRecentPages([evening], { locale: "en-US", timeZone: "America/New_York" });
    expect(newYork[0]?.day).toBe("2026-08-27");
    expect(groupRecentPages([evening])[0]?.day).toBe("2026-08-28");
  });

  it("uses Tabs and Collapsible Space rows while Pages remain direct icon-free links", () => {
    const html = renderToStaticMarkup(
      <HomeTree spaces={[firstSpace, secondSpace]} pages={pages} />,
    );

    expect(html).toContain('data-slot="tabs"');
    expect(html).toContain('data-variant="line"');
    expect(html).toContain(">Spaces</button>");
    expect(html).toContain(">Recent Pages</button>");
    // 44px via the control token.
    expect(html).toContain("min-h-control");
    expect(html).toContain('data-slot="collapsible"');
    expect(html).toContain('data-strata-no-hover-motion=""');
    expect(html).toContain("aria-expanded:bg-transparent");
    expect(html).toContain("before:-top-2");
    expect(html).toContain("before:h-2");
    expect(html).toContain("Rain shell remains.");
    expect(html).toContain("1 Page");
    expect(html).toContain('aria-label="Manage Home"');

    // The Input primitive's 16px text keeps iOS from zooming on focus.
    expect(html).toContain('data-slot="input"');
    expect(html).toContain('data-size="default"');

    const searched = renderToStaticMarkup(
      <HomeTree
        spaces={[firstSpace, secondSpace]}
        pages={pages}
       
        initialQuery="packing"
      />,
    );
    expect(searched).toContain('value="packing"');
    expect(searched).toContain('name="q"');
    expect(searched).toContain('aria-describedby="home-search-status"');
    expect(searched).not.toContain("Searching Page text…");

    const bodyOnlySearch = renderToStaticMarkup(
      <HomeTree
        spaces={[firstSpace, secondSpace]}
        pages={pages}
       
        initialQuery="cobalt"
        bodySearch={{ url: "/home/search" }}
      />,
    );
    expect(bodyOnlySearch).toContain("Searching Page text…");
    expect(bodyOnlySearch).not.toContain("No Spaces or Pages match your search.");

    const recentHtml = renderToStaticMarkup(
      <HomeTree
        spaces={[firstSpace, secondSpace]}
        pages={pages}
       
        initialTab="recent"
      />,
    );
    expect(recentHtml).toContain("max-w-[60%]");
    expect(recentHtml).not.toContain('data-slot="collapsible"');
  });

  it("states exposure on every row and per Space, in words and never by colour", () => {
    // The shared Page is under the second Space, so open it.
    const html = renderToStaticMarkup(
      <HomeTree
        spaces={[firstSpace, secondSpace]}
        pages={pages}
       
        initialSpaceId={secondSpace.id}
      />,
    );

    // Every Page has a read key even while private, so the wording is about the Space link.
    expect(html).toContain("Shared in Space link");
    expect(html).toContain("Not shared in Space link");
    // Each mark is a glyph plus a word, not colour alone.
    expect(html).toContain("sr-only");
    expect(html).toContain("1 Page · Not shared");
    expect(html).toContain("1 of 1 Page shared");
  });

  it("shows the pin on a Home row, so the one curation gesture is visible where it acts", () => {
    const html = renderToStaticMarkup(
      <HomeTree
        spaces={[firstSpace]}
        pages={[{ ...pages[0], pinned: true }]}
       
      />,
    );

    expect(html).toContain(">Pinned</span>");
    expect(html).toContain('aria-label="Open Packing list, pinned, not shared in Space link"');
  });

  it("includes sharing state in the Page link name, not only its hidden glyph", () => {
    const html = renderToStaticMarkup(
      <HomeTree
        spaces={[secondSpace]}
        pages={pages.filter((page) => page.id === "page-seeds")}
       
      />,
    );

    expect(html).toContain('aria-label="Open Seed catalog, shared in Space link"');
  });

  it("keeps which Spaces are open across a search that unmounts them", () => {
    // The open set is seeded once from the unfiltered list and survives a query.
    const html = renderToStaticMarkup(
      <HomeTree spaces={[firstSpace, secondSpace]} pages={pages} />,
    );

    const states = [...html.matchAll(/data-slot="collapsible" *>/gu)];
    expect(states).toHaveLength(2);
    expect(html).toContain('aria-label="Collapse Field notes"');
    expect(html).toContain('aria-label="Expand Garden"');

    // `/spaces/:id` opens at the Space the address named, whatever its rank.
    const atSpace = renderToStaticMarkup(
      <HomeTree
        spaces={[firstSpace, secondSpace]}
        pages={pages}
       
        initialSpaceId={secondSpace.id}
      />,
    );
    expect(atSpace).toContain('aria-label="Collapse Garden"');
  });

  it("says how to fill an empty Strata instead of drawing empty tabs", () => {
    const html = renderToStaticMarkup(<HomeTree spaces={[]} pages={[]} />);

    expect(html).toContain("Nothing here yet");
    expect(html).toContain("Use Strata");
    expect(html).toContain("0 Spaces · 0 Pages");
    expect(html).not.toContain("Search Spaces and Pages");
    expect(html).not.toContain('data-slot="tabs"');
    // The Drawer content portals only after the trigger opens.
    expect(html).toContain('aria-label="Manage Home"');
  });

  it("marks the writer in a row without ever naming it, and draws nothing when there is none", () => {
    const writer: PageWriter = {
      grantId: "0f2b8c11-1a4e-4f60-9d21-6c0b7f3ae001",
      label: "Instinct",
      driver: "instinct",
      connectedAt: "2026-08-12T09:14:00.000Z",
      lastUsedAt: "2026-08-27T12:00:00.000Z",
      revokedAt: null,
    };
    const attributed = renderToStaticMarkup(
      <TooltipProvider>
        <HomeSpaceRow entry={{ space: firstSpace, allPages: [{ ...pages[0], writer }], pages: [{ ...pages[0], writer }], matchesSpace: false }} />
      </TooltipProvider>,
    );

    expect(attributed).toContain('data-strata-agent-avatar="live"');
    expect(attributed).toContain('data-strata-agent-tint');
    // Instinct has its own glyph rather than a letter.
    expect(attributed).toContain('data-strata-agent-mark="glyph"');
    expect(attributed).not.toContain(">Instinct<");
    // Tooltip wording is covered by the `writerTooltipText` case below.

    const revoked = renderToStaticMarkup(
      <TooltipProvider>
        <HomeSpaceRow
          entry={{
            space: firstSpace,
            allPages: [{ ...pages[0], writer: { ...writer, revokedAt: "2026-08-29T09:00:00.000Z" } }],
            pages: [{ ...pages[0], writer: { ...writer, revokedAt: "2026-08-29T09:00:00.000Z" } }],
            matchesSpace: false,
          }}
        />
      </TooltipProvider>,
    );
    expect(revoked).toContain('data-strata-agent-avatar="revoked"');
    expect(revoked).toContain("opacity-55");

    const unattributed = renderToStaticMarkup(
      <TooltipProvider>
        <HomeSpaceRow entry={{ space: firstSpace, allPages: [pages[0]], pages: [pages[0]], matchesSpace: false }} />
      </TooltipProvider>,
    );
    expect(unattributed).not.toContain("data-strata-agent-avatar");
  });

  it("says what a writer is in the tooltip, including when there is none", () => {
    const writer: PageWriter = {
      grantId: "0f2b8c11-1a4e-4f60-9d21-6c0b7f3ae001",
      label: "Instinct",
      driver: "instinct",
      connectedAt: "2026-08-12T09:14:00.000Z",
      lastUsedAt: null,
      revokedAt: null,
    };

    const at = "2026-08-29T07:00:00.000Z";
    const now = new Date("2026-08-29T09:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(writerTooltipText(writer, { at, summary: "Added 15 shows, marked 3 sold out" }))
      .toBe("Instinct · 2h ago · Added 15 shows, marked 3 sold out");
    expect(writerTooltipText(writer, { at, summary: "" })).toBe("Instinct · 2h ago");
    expect(writerTooltipText(writer, { at, summary: null })).toBe("Instinct · 2h ago");
    const long = writerTooltipText(writer, { at, summary: "S".repeat(120) });
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThan("Instinct · 2h ago · ".length + 62);
    expect(writerTooltipText(
      { ...writer, label: "chatgpt (work)", revokedAt: "2026-08-29T09:00:00.000Z" },
      { at, summary: "Added 15 shows" },
    )).toBe("chatgpt (work) · disconnected Aug 29 · Added 15 shows");
    expect(writerTooltipText(null)).toBe("Unknown agent");

    vi.useRealTimers();
  });

  it("names a Page link by title and state, and describes it with Space, summary and recency", () => {
    const recentHtml = renderToStaticMarkup(
      <HomeTree
        spaces={[firstSpace, secondSpace]}
        pages={pages}
       
        initialTab="recent"
      />,
    );

    // The name is title plus state; the description points at the visible nodes.
    expect(recentHtml).toContain('aria-label="Open Packing list, not shared in Space link"');
    expect(recentHtml).toContain('aria-describedby="page-page-packing-detail page-page-packing-time"');
    expect(recentHtml).toContain('id="page-page-packing-detail"');
    expect(recentHtml).toContain('id="page-page-packing-time"');
    const detail = recentHtml.slice(recentHtml.indexOf('id="page-page-packing-detail"'));
    expect(detail.indexOf("Field notes")).toBeLessThan(detail.indexOf("Rain shell remains."));
    expect(recentHtml).toContain(", updated ");

    const spacesHtml = renderToStaticMarkup(
      <HomeTree spaces={[firstSpace]} pages={[pages[0]]} />,
    );
    expect(spacesHtml).toContain('aria-describedby="page-page-packing-detail page-page-packing-time"');

    // No detail line, so the description must not reference a missing id.
    const bare = renderToStaticMarkup(
      <HomeTree spaces={[firstSpace]} pages={[{ ...pages[0], answer: null }]} />,
    );
    expect(bare).toContain('aria-describedby="page-page-packing-time"');
    expect(bare).not.toContain('id="page-page-packing-detail"');
  });

  it("keeps the Space disclosure name short and moves its counts into a description", () => {
    const html = renderToStaticMarkup(
      <HomeTree spaces={[firstSpace, secondSpace]} pages={pages} />,
    );

    expect(html).toContain('aria-label="Collapse Field notes"');
    expect(html).toContain('aria-describedby="space-space-field-summary"');
    expect(html).toContain('id="space-space-field-summary"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="Expand Garden"');
    expect(html).toContain('aria-describedby="space-space-garden-summary"');
    expect(html).not.toContain('aria-label="Expand Garden, 1 of 1 Page shared"');
  });

  it("keeps the search field's name stable while its result status changes", () => {
    const idle = renderToStaticMarkup(
      <HomeTree spaces={[firstSpace, secondSpace]} pages={pages} />,
    );
    const searched = renderToStaticMarkup(
      <HomeTree
        spaces={[firstSpace, secondSpace]}
        pages={pages}
       
        initialQuery="nothing matches this"
      />,
    );

    // The label wraps only its own words, so the status never renames the control.
    for (const html of [idle, searched]) {
      expect(html).toContain('<label for="home-search" class="sr-only">Search Spaces and Pages</label>');
      expect(html).toContain('id="home-search"');
      expect(html).toContain('aria-describedby="home-search-status"');
      expect(html).not.toMatch(/<label[^>]*>(?:(?!<\/label>)[\s\S])*home-search-status/u);
    }
    expect(searched).toContain('id="home-search-status"');
    expect(searched).toContain("0 Spaces and 0 Pages shown.");
  });

  it("offers a Retry beside a body-search failure without disturbing the query", () => {
    const failed = renderToStaticMarkup(
      <HomeSearch
        query="cobalt"
        onQueryChange={() => {}}
        status="error"
        message="Page text couldn’t be searched. Titles and summaries still work."
        onRetry={() => {}}
      />,
    );

    expect(failed).toMatch(/>Retry<\/button>/u);
    expect(failed).toContain('value="cobalt"');
    expect(failed).toContain("Page text couldn’t be searched. Titles and summaries still work.");

    const loading = renderToStaticMarkup(
      <HomeSearch query="cobalt" onQueryChange={() => {}} status="loading" message="" onRetry={() => {}} />,
    );
    expect(loading).not.toContain("Retry");
    expect(loading).toContain('aria-busy="true"');
  });

  it("walks a first run through the three steps and then watches for the agent", () => {
    const html = renderToStaticMarkup(<HomeTree spaces={[]} pages={[]} />);

    expect(html).toContain('data-strata-first-run=""');
    expect(html).toContain("Nothing here yet");
    expect(html).toContain("<ol");
    expect(html).toContain("Tell your assistant “Use Strata”.");
    expect(html).toContain("It asks for your email and a code.");
    expect(html).toContain("Your first Page appears here.");
    // A live region, because the status changes without user input.
    expect(html).toContain('data-strata-first-run-status=""');
    expect(html).toContain('role="status"');
    expect(html).toContain("Waiting for your assistant…");

    const connected = renderToStaticMarkup(
      <HomeTree
        spaces={[]}
        pages={[]}
        agents={[{
          grantId: "0f2b8c11-1a4e-4f60-9d21-6c0b7f3ae001",
          label: "Instinct",
          driver: "instinct",
          connectedAt: "2026-08-12T09:14:00.000Z",
          lastUsedAt: null,
          revokedAt: null,
          mode: "rotating",
        }]}
      />,
    );
    expect(connected).toContain("Instinct connected · your first Page will appear here");
    expect(connected).not.toContain("Waiting for your assistant…");

    const revoked = renderToStaticMarkup(
      <HomeTree
        spaces={[]}
        pages={[]}
        agents={[{
          grantId: "0f2b8c11-1a4e-4f60-9d21-6c0b7f3ae001",
          label: "Instinct",
          driver: "instinct",
          connectedAt: "2026-08-12T09:14:00.000Z",
          lastUsedAt: null,
          revokedAt: "2026-08-29T09:00:00.000Z",
          mode: "rotating",
        }]}
      />,
    );
    expect(revoked).toContain("Waiting for your assistant…");
  });

  it("shows first-run guidance only while Strata is empty", () => {
    const filled = renderToStaticMarkup(<HomeTree spaces={[firstSpace]} pages={[pages[0]]} />);

    expect(filled).not.toContain("data-strata-first-run");
    expect(filled).not.toContain("Waiting for your assistant…");
  });

  it("turns every row into a checkbox while ?select=1 holds, and keeps the tabs", () => {
    const html = renderToStaticMarkup(
      <HomeTree spaces={[firstSpace, secondSpace]} pages={pages} selecting />,
    );

    expect(html).toContain('data-strata-selection-toolbar=""');
    expect(html).toContain(">Select items</h1>");
    // Toolbar verbs are icons, so the word lives in the accessible name.
    expect(html).toContain('aria-label="Done"');
    expect(html).not.toContain('aria-label="Manage Home"');
    expect(html).not.toContain('aria-label="Delete"');
    expect(html).not.toContain('aria-label="Pin"');
    expect(html).toContain('data-strata-selection-checkbox=""');
    expect(html).toContain("rounded-full");
    // A 2px border keeps the checkbox visible at arm's length.
    expect(html).toContain("border-2 border-control-border");
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-label="Field notes"');
    expect(html).toContain('aria-label="Packing list"');
    expect(html).not.toContain('aria-label="Open Packing list, not shared in Space link"');
    expect(html).toContain('data-slot="tabs"');
    expect(html).toContain(">Recent Pages</button>");
    expect(html).toContain('aria-label="Collapse Field notes"');
  });

  it("leaves selection by dropping only ?select=1 from the address, without navigating", () => {
    const seen: { selection: HomeSelectionValue | null } = { selection: null };
    renderToStaticMarkup(
      <HomeSelectionProvider spaces={[firstSpace]} pages={pages} initialSelecting>
        <SelectionProbe
          onRender={(selection) => {
            seen.selection = selection;
          }}
        />
      </HomeSelectionProvider>,
    );
    expect(seen.selection?.state.selecting).toBe(true);

    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { href: "https://strata.test/home?q=packing&select=1&tab=recent#top" },
      history: { replaceState },
    });
    try {
      seen.selection?.actions.exit();
    } finally {
      vi.unstubAllGlobals();
    }

    // Query, tab and fragment survive, and no history entry or server round trip is added.
    expect(replaceState).toHaveBeenCalledWith(null, "", "/home?q=packing&tab=recent#top");
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("counts a selection the way the confirmation has to say it", () => {
    expect(selectionCounts(2, 1)).toBe("2 Pages and 1 Space");
    expect(selectionCounts(1, 0)).toBe("1 Page");
    expect(selectionCounts(0, 3)).toBe("3 Spaces");
  });

  it("asks before deleting, and says exactly what a delete costs", () => {
    const html = renderToStaticMarkup(
      <HomeSelectionToolbar
        selectedPageIds={["page-packing", "page-seeds"]}
        selectedSpaceIds={["space-garden"]}
        allSelectedPagesPinned={false}
        onExit={() => {}}
      />,
    );

    expect(html).toContain('aria-label="Delete"');
    expect(confirmation.props).toMatchObject({
      open: false,
      title: "Delete 2 Pages and 1 Space?",
      description: "They’re gone for everyone. Links to them stop opening. This can’t be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
  });

  it("offers Pin, or Unpin once every selected Page is already pinned", () => {
    const unpinned = renderToStaticMarkup(
      <HomeSelectionToolbar
        selectedPageIds={["page-packing"]}
        selectedSpaceIds={[]}
        allSelectedPagesPinned={false}
        onExit={() => {}}
      />,
    );
    expect(unpinned).toContain('aria-label="Pin"');
    expect(unpinned).not.toContain('aria-label="Unpin"');

    const pinned = renderToStaticMarkup(
      <HomeSelectionToolbar
        selectedPageIds={["page-packing"]}
        selectedSpaceIds={[]}
        allSelectedPagesPinned
        onExit={() => {}}
      />,
    );
    expect(pinned).toContain('aria-label="Unpin"');
    expect(confirmation.props?.title).toBe("Delete 1 Page?");

    // Spaces alone have nothing to pin.
    const spacesOnly = renderToStaticMarkup(
      <HomeSelectionToolbar
        selectedPageIds={[]}
        selectedSpaceIds={["space-garden"]}
        allSelectedPagesPinned={false}
        onExit={() => {}}
      />,
    );
    expect(spacesOnly).not.toContain('aria-label="Pin"');
    expect(spacesOnly).toContain('aria-label="Delete"');
  });

  it("makes the Space status line the door to sharing", () => {
    const html = renderToStaticMarkup(
      <HomeTree spaces={[firstSpace, secondSpace]} pages={pages} />,
    );

    expect(html).toContain('data-space-sharing-control=""');
    expect(html).toContain("Sharing for Field notes: ");
    expect(html).toContain("1 Page · Not shared");
    expect(html).toContain('id="space-space-field-summary"');
    expect(html).toContain('aria-describedby="space-space-field-summary"');

    // In selection mode the row is a toggle, so it holds no nested button.
    const selecting = renderToStaticMarkup(
      <HomeTree spaces={[firstSpace, secondSpace]} pages={pages} selecting />,
    );
    expect(selecting).not.toContain('data-space-sharing-control=""');
    expect(selecting).toContain("1 Page · Not shared");
  });

  it("uses the shared empty for every list that has nothing in it", () => {
    const noSpaces = renderToStaticMarkup(<HomeTree spaces={[]} pages={[pages[0]]} />);
    expect(noSpaces).toContain("No Spaces yet.");

    const noPages = renderToStaticMarkup(
      <HomeTree spaces={[firstSpace]} pages={[]} initialTab="recent" />,
    );
    expect(noPages).toContain("No Pages yet.");

    const emptySpace = renderToStaticMarkup(
      <HomeSpaceRow entry={{ space: firstSpace, allPages: [], pages: [], matchesSpace: false }} />,
    );
    expect(emptySpace).toContain("No Pages in this Space yet.");

    const searched = renderToStaticMarkup(
      <HomeTree spaces={[firstSpace]} pages={[pages[0]]} initialQuery="nothing matches this" />,
    );
    expect(searched).toContain("No Spaces or Pages match your search.");
  });

  it("hues an agent by what it runs on and what it is called, not by its grant", () => {
    expect(agentHue("chatgpt", "ChatGPT")).not.toBe(agentHue("chatgpt", "ChatGPT (work)"));
    // The hue must survive a reconnect, which mints a new grant.
    expect(agentHue("instinct", "Instinct")).toBe(agentHue("instinct", "Instinct"));
    expect(agentMonogram("chatgpt (work)")).toBe("C");
  });
});
