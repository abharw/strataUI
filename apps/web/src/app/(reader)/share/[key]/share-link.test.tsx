/**
 * `/share/:key`: the key alone decides whether the document renders. The session cookie only
 * redirects its own namespace to the canonical address, and never for an embed.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const assembleMocks = vi.hoisted(() => ({
  assemblePage: vi.fn(),
  assembleSharedPage: vi.fn(),
  hydratePageLinks: vi.fn(async (spec: unknown) => spec),
  assetHrefs: vi.fn(async () => ({})),
  recordView: vi.fn(),
  ogPreview: vi.fn(async () => ({ ok: false as const })),
}));
const listMocks = vi.hoisted(() => ({ loadSpace: vi.fn() }));
const sessionMocks = vi.hoisted(() => ({ currentSessionNamespace: vi.fn() }));
const ASK = { approval_id: "ship-it", ask_seq: 1, question_key: "ship-it/1", answer: null };
const decisionMocks = vi.hoisted(() => ({ asksFor: vi.fn(async (): Promise<unknown[]> => []) }));
const headerMocks = vi.hoisted(() => ({ get: vi.fn(() => null) }));

vi.mock("@/server/pages/read/assemble", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...assembleMocks,
}));
vi.mock("@/server/spaces/read/lists", () => listMocks);
vi.mock("@/server/auth/web-session", () => sessionMocks);
vi.mock("@/server/pages/decisions", () => decisionMocks);
vi.mock("next/headers", () => ({ headers: async () => headerMocks }));
vi.mock("next/server", () => ({ after: (run: () => void) => run }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }),
  useRouter: () => ({ refresh: vi.fn() }),
}));

import SharedLink from "./page";

const NAMESPACE = "00000000-0000-4000-8000-000000000001";
const OTHER_NAMESPACE = "00000000-0000-4000-8000-000000000009";
const PAGE_ID = "00000000-0000-4000-8000-000000000003";
const SPACE_ID = "00000000-0000-4000-8000-000000000002";
const PAGE_KEY = `pgk_${"b".repeat(43)}`;
const SPACE_KEY = `spk_${"c".repeat(43)}`;

beforeEach(() => {
  vi.clearAllMocks();
  assembleMocks.hydratePageLinks.mockImplementation(async (spec: unknown) => spec);
  assembleMocks.assetHrefs.mockResolvedValue({});
  decisionMocks.asksFor.mockResolvedValue([ASK]);
  headerMocks.get.mockReturnValue(null);
  assembleMocks.assemblePage.mockResolvedValue({
    ok: true,
    value: {
      pageId: PAGE_ID,
      namespaceId: NAMESPACE,
      spaceId: SPACE_ID,
      spaceName: "Field notes",
      shared: false,
      updatedAt: new Date("2026-08-27T12:00:00.000Z"),
      ownerName: null,
      recent: [],
      document: {
        meta: { title: "Packing list", slug: "packing-list", kind: "living", url: null },
        // An approval: the question renders for readers, the buttons only for the owner.
        spec: {
          root: "root",
          elements: {
            root: { type: "section", props: {}, children: ["ship-it"] },
            "ship-it": {
              type: "approval",
              props: {
                id: "ship-it",
                question: "Ship the release today?",
                options: [{ id: "yes", label: "Ship it" }, { id: "wait", label: "Hold" }],
              },
              children: [],
            },
          },
        },
        version: 3,
        user: { pinned: false },
        agent_updating: false,
      },
    },
  });
});

async function render(key = PAGE_KEY, searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(await SharedLink({
    params: Promise.resolve({ key }),
    searchParams: Promise.resolve(searchParams),
  }));
}

describe("/share/:pgk", () => {
  it("resolves the page from the key alone, with no id in the address", async () => {
    sessionMocks.currentSessionNamespace.mockResolvedValue(null);

    const html = await render();

    expect(assembleMocks.assemblePage).toHaveBeenCalledWith(PAGE_KEY);
    expect(html).toContain("Packing list");
    // No Space back link or canonical address the reader cannot open.
    expect(html).not.toContain("/spaces/");
    expect(html).not.toContain("/pages/");
    expect(html).not.toContain("/home");
    // Readers see the question but cannot answer it.
    expect(html).toContain("Ship the release today?");
    expect(html).toContain("Only the person this page was made for can answer this");
    expect(html).not.toContain('data-slot="approval-option"');
  });

  it("sends the owner's own browser to the canonical address", async () => {
    sessionMocks.currentSessionNamespace.mockResolvedValue({ namespaceId: NAMESPACE });
    await expect(render()).rejects.toThrow(`NEXT_REDIRECT:/pages/${PAGE_ID}`);
  });

  it("leaves a browser signed in to another Strata as a plain reader", async () => {
    sessionMocks.currentSessionNamespace.mockResolvedValue({ namespaceId: OTHER_NAMESPACE });

    const html = await render();

    expect(html).toContain("Packing list");
    expect(html).not.toContain("/pages/");
    expect(html).not.toContain("/spaces/");
  });

  it("never consults the cookie for an embed", async () => {
    sessionMocks.currentSessionNamespace.mockResolvedValue({ namespaceId: NAMESPACE });

    await render(PAGE_KEY, { embed: "1" });
    expect(sessionMocks.currentSessionNamespace).not.toHaveBeenCalled();
  });

  it("refuses a key that opens nothing, before the cookie is ever consulted", async () => {
    sessionMocks.currentSessionNamespace.mockResolvedValue({ namespaceId: NAMESPACE });
    assembleMocks.assemblePage.mockResolvedValue({ ok: false, result: { status: 404, body: {} } });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(sessionMocks.currentSessionNamespace).not.toHaveBeenCalled();
  });
});

describe("/share/:spk", () => {
  beforeEach(() => {
    listMocks.loadSpace.mockResolvedValue({
      ok: true,
      value: {
        id: SPACE_ID,
        slug: "field-notes",
        name: "Field notes",
        emoji: "🧭",
        pages: [
          { id: PAGE_ID, title: "Packing list", answer: null, updatedAt: new Date("2026-08-27T12:00:00.000Z"), lastViewedAt: null, pinned: false, kind: "living", url: null, shared: true, exposureActor: "user", spaceId: SPACE_ID, spaceSlug: "field-notes", spaceName: "Field notes" },
          { id: "00000000-0000-4000-8000-000000000004", title: "Route", answer: null, updatedAt: new Date("2026-08-26T12:00:00.000Z"), lastViewedAt: null, pinned: false, kind: "living", url: null, shared: true, exposureActor: "user", spaceId: SPACE_ID, spaceSlug: "field-notes", spaceName: "Field notes" },
        ],
        activePageCount: 2,
        sharedPageCount: 2,
        privatePageCount: 0,
        updatedAt: new Date("2026-08-27T12:00:00.000Z"),
        shareUrl: null,
        sharedAt: new Date("2026-08-27T12:00:00.000Z"),
      },
    });
  });

  it("indexes the bundle with member links under the same key", async () => {
    const html = await render(SPACE_KEY);

    expect(html).toContain("Field notes");
    // The emoji is an aria-hidden sibling of the name, not part of it.
    expect(html).toContain(">Space</p>");
    expect(html).toContain("🧭");
    expect(html).not.toContain("🧭 Field notes");
    expect(html).toContain(`href="/share/${SPACE_KEY}/pages/${PAGE_ID}"`);
    // "Page" is Title Case, matching the owner's screens.
    expect(html).toContain("2 Pages");
    expect(html).not.toContain("2 pages");
    expect(assembleMocks.assemblePage).not.toHaveBeenCalled();
    // Bundles never upgrade to an owner view.
    expect(sessionMocks.currentSessionNamespace).not.toHaveBeenCalled();
  });

  it("writes an empty bundle from the reader's side", async () => {
    listMocks.loadSpace.mockResolvedValue({
      ok: true as const,
      value: {
        id: SPACE_ID,
        slug: "field-notes",
        name: "Field notes",
        emoji: "🧭",
        pages: [],
        activePageCount: 0,
        sharedPageCount: 0,
        privatePageCount: 0,
        updatedAt: new Date("2026-08-27T12:00:00.000Z"),
        shareUrl: null,
        sharedAt: new Date("2026-08-27T12:00:00.000Z"),
      },
    });

    const html = await render(SPACE_KEY);
    expect(html).toContain("This link doesn’t include any Pages yet.");
  });

  it("reads its single member as a bundle reader, sequence chrome and all", async () => {
    const member = {
      id: PAGE_ID,
      title: "Day 2",
      answer: null,
      updatedAt: new Date("2026-08-27T12:00:00.000Z"),
      lastViewedAt: null,
      pinned: false,
      kind: "living" as const,
      url: null,
      shared: true,
      exposureActor: "user" as const,
      spaceId: SPACE_ID,
      spaceSlug: "field-notes",
      spaceName: "Field notes",
    };
    listMocks.loadSpace.mockResolvedValue({
      ok: true as const,
      value: {
        id: SPACE_ID,
        slug: "field-notes",
        name: "Field notes",
        emoji: "🧭",
        pages: [member],
        activePageCount: 1,
        sharedPageCount: 1,
        privatePageCount: 0,
        updatedAt: new Date("2026-08-27T12:00:00.000Z"),
        shareUrl: null,
        sharedAt: new Date("2026-08-27T12:00:00.000Z"),
      },
    });
    assembleMocks.assembleSharedPage.mockResolvedValue({
      ok: true,
      value: {
        pageId: PAGE_ID,
        namespaceId: NAMESPACE,
        spaceId: SPACE_ID,
        spaceName: "Field notes",
        shared: true,
        updatedAt: new Date("2026-08-27T12:00:00.000Z"),
        ownerName: null,
        recent: [],
        steps: null,
        writer: null,
        lastSummary: null,
        sequence: {
          previous: { href: `/share/${SPACE_KEY}/pages/00000000-0000-4000-8000-000000000004`, title: "Day 1" },
          up: { href: `/share/${SPACE_KEY}/pages/00000000-0000-4000-8000-000000000005`, title: "Week 1" },
        },
        document: {
          meta: { title: "Day 2", slug: "day-2", kind: "living", url: null },
          spec: { root: "root", elements: { root: { type: "section", props: {}, children: [] } } },
          version: 1,
          user: { pinned: false },
          agent_updating: false,
        },
      },
    });

    const html = await render(SPACE_KEY);

    // A one-page bundle still resolves links and sequence within the Space.
    expect(assembleMocks.assembleSharedPage).toHaveBeenCalledWith(PAGE_ID, SPACE_ID, SPACE_KEY);
    expect(assembleMocks.hydratePageLinks).toHaveBeenCalledWith(
      expect.anything(),
      { kind: "bundle", namespaceId: NAMESPACE, spaceId: SPACE_ID, bundleKey: SPACE_KEY },
    );
    expect(html).toContain('aria-label="Sequence"');
    expect(html).toContain(`href="/share/${SPACE_KEY}/pages/00000000-0000-4000-8000-000000000004"`);
    expect(html).toContain("Week 1");
  });

  it("refuses a string that is not a share key Strata minted", async () => {
    for (const key of ["sk_" + "a".repeat(43), "not-a-key", "sw_token"]) {
      await expect(render(key)).rejects.toThrow("NEXT_NOT_FOUND");
    }
  });
});
