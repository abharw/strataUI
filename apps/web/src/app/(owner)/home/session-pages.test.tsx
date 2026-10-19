// `/home` and `/spaces/:id` under a session: canonical links only, and no secrets in the HTML.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeView, InventorySpace, ListPage } from "@/server/spaces/read/lists";

const authMocks = vi.hoisted(() => ({
  currentSessionNamespace: vi.fn(),
  requireWebSessionNamespace: vi.fn(),
  readHomeData: vi.fn(async <T,>(read: () => Promise<T>) => read()),
}));
const readMocks = vi.hoisted(() => ({
  loadHomeForNamespace: vi.fn(),
  ownsSpace: vi.fn(),
}));
const agentMocks = vi.hoisted(() => ({ loadAgentsForNamespace: vi.fn() }));
const identityMocks = vi.hoisted(() => ({ readNamespaceIdentity: vi.fn() }));
const sessionMocks = vi.hoisted(() => ({ listOwnerSessions: vi.fn() }));
// A real `Headers` instance, matching what `next/headers` resolves to.
const headerMocks = vi.hoisted(() => ({ current: new Headers() }));

vi.mock("@/server/auth/web-session", () => authMocks);
vi.mock("@/server/spaces/read/lists", () => readMocks);
vi.mock("@/server/credentials/agents", () => agentMocks);
vi.mock("@/server/auth/identity", () => identityMocks);
vi.mock("@/server/auth/owner-session", () => sessionMocks);
vi.mock("next/headers", () => ({ headers: async () => headerMocks.current }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }),
  useRouter: () => ({ refresh: vi.fn() }),
}));

import SessionHomePage from "./(index)/page";
import SignInPage from "./sign-in/page";
import SpacePage from "@/app/(owner)/spaces/[id]/page";

const NAMESPACE = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-0000000000a1";
const UPDATED = new Date("2026-08-27T12:00:00.000Z");

const space: InventorySpace = {
  id: "space-one",
  slug: "field-notes",
  name: "Field notes",
  emoji: "🧭",
  activePageCount: 1,
  sharedPageCount: 0,
  privatePageCount: 1,
  updatedAt: UPDATED,
  shareUrl: null,
  sharedAt: null,
};

const page: ListPage = {
  id: "page-one",
  title: "Packing list",
  answer: "Rain shell is the only item still missing.",
  updatedAt: UPDATED,
  lastViewedAt: null,
  pinned: false,
  kind: "living",
  url: null,
  shared: false,
  exposureActor: "system",
  spaceId: space.id,
  spaceSlug: space.slug,
  spaceName: space.name,
  writer: null,
  lastSummary: null,
};

const home: HomeView = {
  title: "Home",
  spaces: [space],
  recentPages: [page],
  spaceCount: 1,
  pageCount: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.readHomeData.mockImplementation(async <T,>(read: () => Promise<T>) => read());
  readMocks.loadHomeForNamespace.mockResolvedValue(home);
  readMocks.ownsSpace.mockResolvedValue(true);
  agentMocks.loadAgentsForNamespace.mockResolvedValue([]);
  identityMocks.readNamespaceIdentity.mockResolvedValue(null);
  sessionMocks.listOwnerSessions.mockResolvedValue([
    { id: SESSION, current: true, created_at: UPDATED.toISOString(), last_used_at: null, revoked_at: null },
  ]);
  headerMocks.current = new Headers();
});

describe("/spaces/:id under an owner session", () => {
  it("renders the owned Space as Home opened at that row", async () => {
    authMocks.currentSessionNamespace.mockResolvedValue({ namespaceId: NAMESPACE, sessionId: SESSION });

    const html = renderToStaticMarkup(await SpacePage({
      params: Promise.resolve({ id: space.id }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain("Field notes");
    expect(html).toContain('data-state="open"');
    expect(readMocks.ownsSpace).toHaveBeenCalledWith(space.id, NAMESPACE);
    expect(readMocks.loadHomeForNamespace).toHaveBeenCalledWith(NAMESPACE);
  });

  it("does not render generic Home when the Space is deleted during the read", async () => {
    authMocks.currentSessionNamespace.mockResolvedValue({ namespaceId: NAMESPACE, sessionId: SESSION });
    readMocks.loadHomeForNamespace.mockResolvedValue({ ...home, spaces: [] });

    await expect(SpacePage({ params: Promise.resolve({ id: space.id }) }))
      .rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("returns not found for a missing or foreign Space before loading Home", async () => {
    authMocks.currentSessionNamespace.mockResolvedValue({ namespaceId: NAMESPACE, sessionId: SESSION });
    readMocks.ownsSpace.mockResolvedValue(false);

    await expect(SpacePage({ params: Promise.resolve({ id: "not-a-space" }) }))
      .rejects.toThrow("NEXT_NOT_FOUND");
    expect(readMocks.loadHomeForNamespace).not.toHaveBeenCalled();
    expect(agentMocks.loadAgentsForNamespace).not.toHaveBeenCalled();
    expect(sessionMocks.listOwnerSessions).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in without probing the Space", async () => {
    authMocks.currentSessionNamespace.mockResolvedValue(null);

    await expect(SpacePage({ params: Promise.resolve({ id: space.id }) })).rejects.toThrow(
      `NEXT_REDIRECT:/home/sign-in?next=${encodeURIComponent(`/spaces/${space.id}`)}`,
    );
    expect(readMocks.ownsSpace).not.toHaveBeenCalled();
    expect(readMocks.loadHomeForNamespace).not.toHaveBeenCalled();
  });
});

describe("/home under an owner session", () => {
  it("renders Home with links to its Spaces and Pages", async () => {
    authMocks.currentSessionNamespace.mockResolvedValue({ namespaceId: NAMESPACE, sessionId: SESSION });

    const html = renderToStaticMarkup(await SessionHomePage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain(">Home</h1>");
    expect(html).toContain("Search Spaces and Pages");
    expect(html).toContain(`href="/pages/${page.id}"`);
    expect(html).toContain('aria-label="Manage Home"');
    // Two tabs over one inventory; Spaces is the default.
    expect(html).toContain('data-slot="tabs"');
    expect(html).toContain(">Spaces</button>");
    expect(html).toContain(">Recent Pages</button>");
    expect(html).toContain('data-slot="collapsible"');
    expect(readMocks.loadHomeForNamespace).toHaveBeenCalledWith(NAMESPACE);

    const recent = renderToStaticMarkup(
      await SessionHomePage({ searchParams: Promise.resolve({ tab: "recent" }) }),
    );
    expect(recent).not.toContain('data-slot="collapsible"');
    expect(recent).toContain(`href="/pages/${page.id}"`);

    const searched = renderToStaticMarkup(
      await SessionHomePage({ searchParams: Promise.resolve({ q: "packing" }) }),
    );
    expect(searched).toContain('value="packing"');
  });

  it("loads browser access for Home's management Drawer", async () => {
    authMocks.currentSessionNamespace.mockResolvedValue({ namespaceId: NAMESPACE, sessionId: SESSION });
    sessionMocks.listOwnerSessions.mockResolvedValue([
      { id: SESSION, current: true, created_at: UPDATED.toISOString(), last_used_at: null, revoked_at: null },
      { id: "other", current: false, created_at: UPDATED.toISOString(), last_used_at: null, revoked_at: null },
    ]);

    const html = renderToStaticMarkup(await SessionHomePage({ searchParams: Promise.resolve({}) }));

    // Drawer content is portalled on the client; this checks the trigger and the data load.
    expect(html).toContain('aria-label="Manage Home"');
    expect(sessionMocks.listOwnerSessions).toHaveBeenCalledWith(NAMESPACE, SESSION);
  });

  it("sends a browser with no session to /home/sign-in instead of rendering a dead end", async () => {
    authMocks.currentSessionNamespace.mockResolvedValue(null);

    await expect(SessionHomePage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow("NEXT_REDIRECT:/home/sign-in");
    // Nothing is loaded without a session.
    expect(readMocks.loadHomeForNamespace).not.toHaveBeenCalled();
  });
});

describe("/home/sign-in for a signed-out visitor", () => {
  it("renders the browser copy for a plain browser user-agent", async () => {
    authMocks.currentSessionNamespace.mockResolvedValue(null);
    headerMocks.current = new Headers({
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
    });

    const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("Sign in with the email you gave your assistant.");
  });

  it("renders the in-app copy when the Expo shell's user-agent is present", async () => {
    authMocks.currentSessionNamespace.mockResolvedValue(null);
    headerMocks.current = new Headers({
      "user-agent": "Mozilla/5.0 StrataMobile/0.1",
    });

    const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("Enter the email you gave your assistant.");
  });
});
