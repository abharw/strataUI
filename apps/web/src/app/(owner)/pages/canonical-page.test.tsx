// `/pages/:id` renders owner chrome or redirects to sign-in; nothing rendered carries a share key.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const assembleMocks = vi.hoisted(() => ({
  assembleOwnedPage: vi.fn(),
  hydratePageLinks: vi.fn(async (spec: unknown) => spec),
  assetHrefs: vi.fn(async () => ({})),
  recordView: vi.fn(),
}));
const authMocks = vi.hoisted(() => ({
  requireWebSessionNamespace: vi.fn(),
  currentSessionNamespace: vi.fn(),
  readHomeData: vi.fn(),
}));
const decisionMocks = vi.hoisted(() => ({ asksFor: vi.fn(async () => []) }));
const headerMocks = vi.hoisted(() => ({ get: vi.fn(() => null) }));

vi.mock("@/server/pages/read/assemble", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...assembleMocks,
}));
vi.mock("@/server/auth/web-session", () => authMocks);
vi.mock("@/server/pages/decisions", () => decisionMocks);
vi.mock("next/headers", () => ({ headers: async () => headerMocks }));
vi.mock("next/server", () => ({ after: (run: () => void) => run }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }),
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { OwnedPageView, type OwnedPageContext } from "./[id]/owned-page-view";

import CanonicalPage from "./[id]/page";

const NAMESPACE = "00000000-0000-4000-8000-000000000001";
const PAGE_ID = "00000000-0000-4000-8000-000000000003";
const SPACE_ID = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.currentSessionNamespace.mockResolvedValue({ namespaceId: NAMESPACE });
  assembleMocks.hydratePageLinks.mockImplementation(async (spec: unknown) => spec);
  assembleMocks.assetHrefs.mockResolvedValue({});
  decisionMocks.asksFor.mockResolvedValue([]);
  assembleMocks.assembleOwnedPage.mockResolvedValue({
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
        spec: { root: "root", elements: { root: { type: "section", props: {}, children: [] } } },
        version: 3,
        user: { pinned: false },
        agent_updating: false,
      },
    },
  });
});

// `renderToStaticMarkup` cannot suspend, so resolve the outer and inner async components by hand.
async function renderPage(): Promise<{ context: OwnedPageContext; html: string }> {
  const element = await CanonicalPage({ params: Promise.resolve({ id: PAGE_ID }) }) as unknown as {
    props: { pageId: string; context: OwnedPageContext };
  };
  return {
    context: element.props.context,
    html: renderToStaticMarkup(await OwnedPageView(element.props)),
  };
}

describe("/pages/:id", () => {
  it("renders the owner chrome with every link inside the session", async () => {
    const { context, html } = await renderPage();

    expect(context).toEqual({ kind: "owner-session", namespaceId: NAMESPACE });

    expect(html).toContain(`href="/spaces/${SPACE_ID}"`);
    expect(html).toContain("Packing list");
    expect(assembleMocks.assembleOwnedPage).toHaveBeenCalledWith(PAGE_ID, NAMESPACE);
  });

  it("resolves the page only inside the session's own namespace", async () => {
    assembleMocks.assembleOwnedPage.mockResolvedValue({ ok: false, result: { status: 404, body: {} } });
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sends a browser with no session to /home/sign-in, and back here afterwards", async () => {
    authMocks.currentSessionNamespace.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow(
      `NEXT_REDIRECT:/home/sign-in?next=${encodeURIComponent(`/pages/${PAGE_ID}`)}`,
    );
    // The redirect happens before any read.
    expect(assembleMocks.assembleOwnedPage).not.toHaveBeenCalled();
  });
});
