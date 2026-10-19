/**
 * Page chrome tests. The Drawer is portalled and absent from a static render, so its panels are
 * rendered directly inside the chrome provider; the document is rendered as the whole live Page.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

import type { DirectPageViewer, OwnerPageViewer } from "@/shared/navigation/viewer";

import type { PageSnapshot } from "./state";
import { writeClipboardText } from "@/shared/ui/overflow-menu";
import { ChromeActionsPanel } from "./chrome-actions";
import { ChromeSharingPanel } from "./chrome-sharing";
import { PageChromeProvider } from "./chrome-state";
import { OwnerLivePage } from "./page";
import { PageStoreProvider } from "./store";

const SERVER_NOW = "2026-08-29T12:00:00.000Z";

const seed: PageSnapshot = {
  meta: {
    title: "Packing list",
    slug: "packing-list",
    kind: "living",
    url: "/share/pgk_page-key",
    written_registry_version: 1,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-27T12:00:00.000Z",
  },
  space: { name: "Field notes", url: "/spaces/space-field" },
  spec: { root: "root", elements: { root: { type: "section", props: {}, children: [] } } },
  version: 3,
  updatedAt: "2026-08-27T12:00:00.000Z",
  recent: [],
  assets: {},
  writer: null,
  lastSummary: null,
  agentUpdating: false,
  user: { pinned: false },
  shared: false,
  ownerName: null,
  asks: [],
};

const owner: OwnerPageViewer = {
  kind: "owner",
  pageId: "00000000-0000-4000-8000-000000000003",
  space: { name: "Field notes", url: "/spaces/space-field" },
  changesUrl: "/pages/page-one/changes",
};

const forwarded: DirectPageViewer = {
  kind: "direct",
  changesUrl: "/share/pgk_page-key/changes",
  manageNote: "Shared with you by link.",
};

function ownerHtml(over: Partial<PageSnapshot> = {}): string {
  return renderToStaticMarkup(
    <OwnerLivePage viewer={owner} seed={{ ...seed, ...over }} serverNow={SERVER_NOW} />,
  );
}

/** One Drawer panel as the given viewer sees it. */
function panelHtml(
  panel: ReactNode,
  { viewer = owner, ...over }: Partial<PageSnapshot> & { viewer?: OwnerPageViewer | DirectPageViewer } = {},
): string {
  return renderToStaticMarkup(
    <PageStoreProvider seed={{ ...seed, ...over }}>
      <PageChromeProvider viewer={viewer}>{panel}</PageChromeProvider>
    </PageStoreProvider>,
  );
}

describe("the owner's Page chrome", () => {
  it("draws the Space from the store, so a move on a poll tick lands", () => {
    expect(ownerHtml({ space: { name: "Travel", url: "/spaces/space-travel" } }))
      .toContain('href="/spaces/space-travel"');
  });

  it("offers the Page options from the crumb row", () => {
    expect(ownerHtml()).toContain('aria-label="Page options"');
  });
});

describe("the View steps section", () => {
  it("exists only on a page that asked for it", () => {
    // Opt-in per page: only a page written with live_steps shows the section.
    expect(ownerHtml()).not.toContain("View steps");
    expect(ownerHtml({ steps: [] })).toContain("View steps");
    expect(ownerHtml({ steps: [{ version: 3, summary: "Booked the flight.", at: "2026-08-27T12:00:00.000Z" }] }))
      .toContain('data-slot="page-steps"');
  });

  it("sits between the hero and the body", () => {
    const html = ownerHtml({
      steps: [],
      spec: {
        root: "root",
        elements: {
          root: { type: "section", props: {}, children: ["note"] },
          note: { type: "prose", props: { text: "Passports are in the top drawer." }, children: [] },
        },
      },
    });
    const steps = html.indexOf('data-slot="page-steps"');
    expect(steps).toBeGreaterThan(html.indexOf("Updated "));
    expect(html.indexOf("Passports are in the top drawer.")).toBeGreaterThan(steps);
  });
});

describe("the rows in the Page menu", () => {
  it("lists copying first, then pin, sharing, and delete last", () => {
    const html = panelHtml(<ChromeActionsPanel />);
    const order = ["Copy Page link", "Copy Page text", ">Pin<", ">Sharing<", ">Delete<"]
      .map((label) => html.indexOf(label));

    expect(order.every((at) => at > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("names the direct Page link simply, and says what it opens", () => {
    const html = panelHtml(<ChromeActionsPanel />);

    expect(html).toContain("Copy Page link");
    expect(html).toContain("Opens this Page only");
  });

  it("says on the Sharing row whether this Page is in its Space's link", () => {
    expect(panelHtml(<ChromeActionsPanel />, { shared: false })).toContain("Not in the Field notes link");
    expect(panelHtml(<ChromeActionsPanel />, { shared: true })).toContain("In the Field notes link");
  });

  it("keeps a polite live region ready to announce a copy", () => {
    expect(panelHtml(<ChromeActionsPanel />)).toMatch(/role="status" aria-live="polite"/u);
  });

  it("offers no owner act at all to a forwarded page key", () => {
    const html = panelHtml(<ChromeActionsPanel />, { viewer: forwarded });

    expect(html).toContain("Copy Page link");
    expect(html).toContain("Copy Page text");
    expect(html).not.toContain(">Pin<");
    expect(html).not.toContain(">Sharing<");
    expect(html).not.toContain(">Delete<");
  });
});

describe("the Sharing panel", () => {
  it("says who can open the Page, and sends Space membership to the Space", () => {
    const html = panelHtml(<ChromeSharingPanel />);

    expect(html).toContain("Anyone with the Page link can read this Page.");
    expect(html).toContain("Not in the Field notes link");
    expect(html).toMatch(/<a [^>]*href="\/spaces\/space-field"[^>]*>[\s\S]*?Manage Space sharing<\/a>/u);
  });

  it("offers Reset link with its consequence beside it", () => {
    const html = panelHtml(<ChromeSharingPanel />);

    expect(html).toContain("Reset link");
    expect(html).toContain("Everyone with the current link loses access. You get a new link.");
  });
});

/** A denied clipboard resolves to false rather than throwing; the Drawer's recovery relies on it. */
describe("writing to a clipboard that refuses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says no when the browser denies the write", async () => {
    const writeText = vi.fn(() => Promise.reject(new Error("Write permission denied")));
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(writeClipboardText("https://strata.test/share/page")).resolves.toBe(false);
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("says no when there is no clipboard at all", async () => {
    vi.stubGlobal("navigator", {});

    await expect(writeClipboardText("https://strata.test/share/page")).resolves.toBe(false);
  });

  it("says yes when the write lands", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.resolve() } });

    await expect(writeClipboardText("https://strata.test/share/page")).resolves.toBe(true);
  });
});
