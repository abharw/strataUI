/**
 * Owner Server Actions: each re-reads the session, refuses without one, scopes work to the
 * session namespace, and returns a small serializable result. Origin checks are Next's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  readHomeData: vi.fn(async <T>(read: () => Promise<T>) => read()),
  currentSessionNamespace: vi.fn(),
  requireWebSessionNamespace: vi.fn(),
  expireSessionCookie: vi.fn(),
}));

const pageHandlerMocks = vi.hoisted(() => ({ remove: vi.fn(), update: vi.fn() }));
const spaceHandlerMocks = vi.hoisted(() => ({
  remove: vi.fn(),
  shareSelection: vi.fn(),
  update: vi.fn(),
}));
const assembleMocks = vi.hoisted(() => ({
  assembleOwnedPage: vi.fn(),
  attachmentRedirect: vi.fn(),
  listSessionOwnedChanges: vi.fn(),
  updateOwnedUser: vi.fn(),
}));
const decisionMocks = vi.hoisted(() => ({ recordAnswer: vi.fn() }));
const credentialMocks = vi.hoisted(() => ({ revokeAgent: vi.fn() }));
const sessionMocks = vi.hoisted(() => ({
  revokeOwnerSession: vi.fn(),
  revokeOwnerSessionsForNamespace: vi.fn(),
}));
const provisionMocks = vi.hoisted(() => ({
  rotateKey: vi.fn(),
  ProvisionError: class ProvisionError extends Error {
    constructor(readonly code: string) { super(code); }
  },
}));
const cacheMocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/server/auth/web-session", () => authMocks);
vi.mock("@/server/auth/owner-session", () => sessionMocks);
vi.mock("@/server/credentials/handlers", () => credentialMocks);
vi.mock("@/server/pages/handlers", () => pageHandlerMocks);
vi.mock("@/server/spaces/handlers", () => spaceHandlerMocks);
vi.mock("@/server/pages/read/assemble", () => assembleMocks);
vi.mock("@/server/pages/decisions", () => decisionMocks);
vi.mock("@/server/credentials/provision", () => provisionMocks);
vi.mock("@/server/api/http/read-origin", () => ({ readOrigin: async () => "https://strata.test" }));
vi.mock("next/cache", () => cacheMocks);
vi.mock("next/navigation", () => navigationMocks);

import { GET as getAttachment } from "@/app/(owner)/pages/[id]/assets/[resource]/route";
import { GET as getChanges } from "@/app/(owner)/pages/[id]/changes/route";
import {
  answerAsk,
  deletePages,
  deleteSpaces,
  disconnectAgent,
  revokeDevice,
  rotatePageLink,
  rotateSpaceLink,
  setPagePinned,
  setPagesPinned,
  setPageShared,
  shareSpace,
  signOut,
  signOutEverywhere,
} from "./actions";

const namespaceId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000009";
const pageId = "00000000-0000-4000-8000-000000000003";
const spaceId = "00000000-0000-4000-8000-000000000002";
const grantId = "00000000-0000-4000-8000-000000000004";
const otherSessionId = "00000000-0000-4000-8000-000000000005";

const ok = (body: Record<string, unknown> = {}) => ({ status: 200, body });

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.currentSessionNamespace.mockResolvedValue({ namespaceId, sessionId });
  authMocks.requireWebSessionNamespace.mockResolvedValue({ namespaceId, sessionId });
  authMocks.readHomeData.mockImplementation(async <T>(read: () => Promise<T>) => read());
  pageHandlerMocks.update.mockResolvedValue(ok({ shared: true }));
  pageHandlerMocks.remove.mockResolvedValue(ok({ deleted: true }));
  spaceHandlerMocks.remove.mockResolvedValue(ok({ deleted: true }));
  spaceHandlerMocks.shareSelection.mockResolvedValue(ok({
    space_url: "https://strata.test/share/spk_new",
    included_page_count: 1,
  }));
  credentialMocks.revokeAgent.mockResolvedValue(ok({ grant_id: grantId }));
  sessionMocks.revokeOwnerSession.mockResolvedValue({ revokedAt: new Date() });
  sessionMocks.revokeOwnerSessionsForNamespace.mockResolvedValue(2);
  assembleMocks.listSessionOwnedChanges.mockResolvedValue(ok({ version: 2 }));
  assembleMocks.updateOwnedUser.mockResolvedValue(ok({ user: { pinned: true } }));
  assembleMocks.assembleOwnedPage.mockResolvedValue({
    ok: true,
    value: {
      pageId,
      namespaceId,
      document: { spec: { root: "root", elements: {} } },
    },
  });
  assembleMocks.attachmentRedirect.mockResolvedValue(new Response(null, { status: 302 }));
  decisionMocks.recordAnswer.mockResolvedValue(ok({
    decision: {
      approval_id: "approval-one",
      ask_seq: 1,
      question_key: "ship",
      chosen_id: "yes",
      chosen_label: "Yes",
      answered_by: "owner",
      answered_at: "2026-08-29T00:00:00.000Z",
    },
  }));
  provisionMocks.rotateKey.mockImplementation(async ({ id }: { id: string }) =>
    ({ id, url: `https://strata.test/share/pgk_new-${id}` }));
});

// Unsharing a Page, rotating a leaked link, and ending a browser session.
describe("the owner acts the UI reaches", () => {
  it("re-mints a Page link and a Space link inside the session namespace", async () => {
    const rotatedPage = await rotatePageLink(pageId);
    const rotatedSpace = await rotateSpaceLink(spaceId);

    expect(rotatedPage.ok).toBe(true);
    expect(rotatedSpace.ok).toBe(true);
    expect(provisionMocks.rotateKey).toHaveBeenNthCalledWith(1, expect.objectContaining({
      scope: "page", id: pageId, namespaceId,
    }));
    expect(provisionMocks.rotateKey).toHaveBeenNthCalledWith(2, expect.objectContaining({
      scope: "space", id: spaceId, namespaceId,
    }));
    expect(rotatedPage.ok && rotatedPage.notice).toContain("no longer opens");
    expect(rotatedSpace.ok && rotatedSpace.notice).toContain("no longer opens");
    expect(rotatedPage.ok && rotatedPage.url).toContain("/share/pgk_new-");
  });

  it("stamps the person as the actor when a Page leaves its Space bundle", async () => {
    await setPageShared(pageId, false);

    // `exposureActor: "user"` is what prevents an agent from re-sharing.
    expect(pageHandlerMocks.update).toHaveBeenCalledWith(expect.objectContaining({
      page_id: pageId,
      shared: false,
      actor: "user",
    }));
  });

  it.each([
    ["rotate a page link", (id: string) => rotatePageLink(id)],
    ["rotate a space link", (id: string) => rotateSpaceLink(id)],
    ["share a page", (id: string) => setPageShared(id, true)],
    ["delete a page", (id: string) => deletePages([id])],
    ["delete a space", (id: string) => deleteSpaces([id])],
  ] as const)("refuses an id that is not a uuid before any work: %s", async (_label, act) => {
    // Otherwise a uuid column raises Postgres 22P02.
    const result = await act("not-a-uuid");
    expect(result.ok).toBe(false);
    expect(provisionMocks.rotateKey).not.toHaveBeenCalled();
    expect(pageHandlerMocks.update).not.toHaveBeenCalled();
    expect(pageHandlerMocks.remove).not.toHaveBeenCalled();
    expect(spaceHandlerMocks.remove).not.toHaveBeenCalled();
  });
});

describe("session owner actions", () => {
  it("scopes page exposure, user state, and decisions to the session namespace", async () => {
    await setPageShared(pageId, true);
    await setPagePinned(pageId, true);
    await answerAsk(pageId, {
      approval_id: "approval-one",
      ask_seq: 1,
      question_key: "ship",
      option_id: "yes",
    });

    expect(pageHandlerMocks.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      namespace_id: namespaceId,
      page_id: pageId,
      shared: true,
    }));
    expect(assembleMocks.updateOwnedUser)
      .toHaveBeenCalledWith(pageId, namespaceId, { pinned: true });
    expect(assembleMocks.assembleOwnedPage).toHaveBeenCalledWith(pageId, namespaceId);
    expect(decisionMocks.recordAnswer).toHaveBeenCalledWith(pageId, "owner", expect.objectContaining({
      approval_id: "approval-one",
    }));
  });

  it("hands a stale tap the asking that is current rather than a dead end", async () => {
    decisionMocks.recordAnswer.mockResolvedValueOnce({
      status: 409,
      body: {
        code: "question_changed",
        current: { approval_id: "approval-one", ask_seq: 2, question_key: "ship-later", answer: null },
      },
    });

    const result = await answerAsk(pageId, {
      approval_id: "approval-one",
      ask_seq: 1,
      question_key: "ship",
      option_id: "yes",
    });

    expect(result).toEqual({
      ok: false,
      changed: { approval_id: "approval-one", ask_seq: 2, question_key: "ship-later", answer: null },
    });
  });

  it("scopes every Space act to the session namespace", async () => {
    await shareSpace(spaceId, [pageId], []);
    await deleteSpaces([spaceId]);

    expect(spaceHandlerMocks.shareSelection).toHaveBeenCalledWith(expect.objectContaining({
      namespace_id: namespaceId,
      space_id: spaceId,
      page_ids: [pageId],
      expected_page_ids: [],
      actor: "user",
    }));
    expect(spaceHandlerMocks.remove)
      .toHaveBeenCalledWith({ namespace_id: namespaceId, space_id: spaceId, with_pages: true });
  });

  it("refuses malformed or duplicate Space selections before the handler", async () => {
    await expect(shareSpace(spaceId, ["not-a-page-id"], [])).resolves.toMatchObject({ ok: false });
    await expect(shareSpace(spaceId, [pageId, pageId], [])).resolves.toMatchObject({ ok: false });
    await expect(shareSpace(spaceId, [pageId], [pageId, pageId])).resolves.toMatchObject({ ok: false });

    expect(spaceHandlerMocks.shareSelection).not.toHaveBeenCalled();
  });

  it("revalidates Home and the Space after saving its included Pages", async () => {
    await expect(shareSpace(spaceId, [pageId], [])).resolves.toMatchObject({ ok: true });

    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/home");
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/spaces/${spaceId}`);
  });

  it("refreshes a stale Space checklist instead of overwriting a newer selection", async () => {
    spaceHandlerMocks.shareSelection.mockResolvedValueOnce({
      status: 409,
      body: { code: "stale_space_page_selection" },
    });

    const result = await shareSpace(spaceId, [pageId], []);

    expect(result).toEqual({
      ok: false,
      error: "This Space changed. Reopen the checklist and try again.",
    });
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/home");
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/spaces/${spaceId}`);
  });

  it("deletes Pages through the same erasure the agent API performs, and says so once", async () => {
    await expect(deletePages([pageId])).resolves.toEqual({ ok: true, notice: "Page deleted" });
    expect(pageHandlerMocks.remove)
      .toHaveBeenCalledWith({ namespace_id: namespaceId, page_id: pageId, confirm: true });

    const second = "00000000-0000-4000-8000-000000000006";
    await expect(deletePages([pageId, second])).resolves.toEqual({ ok: true, notice: "2 Pages deleted" });
  });

  it("reports a failed first Page delete as nothing deleted and refreshes nothing", async () => {
    pageHandlerMocks.remove.mockResolvedValueOnce({ status: 404, body: { code: "page_not_found" } });
    const second = "00000000-0000-4000-8000-000000000006";

    await expect(deletePages([pageId, second]))
      .resolves.toEqual({ ok: false, error: "Couldn’t delete this Page. Try again." });
    expect(pageHandlerMocks.remove).toHaveBeenCalledTimes(1);
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("says how many Pages were deleted when a later one fails, and refreshes those", async () => {
    const second = "00000000-0000-4000-8000-000000000006";
    const third = "00000000-0000-4000-8000-000000000008";
    pageHandlerMocks.remove
      .mockResolvedValueOnce(ok({ deleted: true }))
      .mockResolvedValueOnce({ status: 404, body: { code: "page_not_found" } });

    await expect(deletePages([pageId, second, third]))
      .resolves.toEqual({ ok: false, error: "Deleted 1 of 3 Pages. Try again for the rest." });
    // The selection stops at the refusal; the third Page is left as it was.
    expect(pageHandlerMocks.remove).toHaveBeenCalledTimes(2);
    expect(cacheMocks.revalidatePath.mock.calls).toEqual([["/home"], [`/pages/${pageId}`]]);
  });

  it("says how many Spaces were deleted when a later one throws, and refreshes those", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const second = "00000000-0000-4000-8000-000000000007";
    spaceHandlerMocks.remove
      .mockResolvedValueOnce(ok({ deleted: true }))
      .mockRejectedValueOnce(new Error("connection reset"));

    await expect(deleteSpaces([spaceId, second]))
      .resolves.toEqual({ ok: false, error: "Deleted 1 of 2 Spaces. Try again for the rest." });
    expect(cacheMocks.revalidatePath.mock.calls).toEqual([["/home"], [`/spaces/${spaceId}`]]);
    expect(consoleError).toHaveBeenCalledWith(
      "home: owner action failed",
      expect.objectContaining({ act: "delete-spaces" }),
    );
    consoleError.mockRestore();
  });

  it("says a Space is deleted once, however many were selected", async () => {
    await expect(deleteSpaces([spaceId])).resolves.toEqual({ ok: true, notice: "Space deleted" });
    const second = "00000000-0000-4000-8000-000000000007";
    await expect(deleteSpaces([spaceId, second])).resolves.toEqual({ ok: true, notice: "2 Spaces deleted" });
  });

  it("pins a set of Pages through the same door one Page goes through", async () => {
    const second = "00000000-0000-4000-8000-000000000006";
    await expect(setPagesPinned([pageId, second], true)).resolves.toEqual({ ok: true, notice: "Pinned" });
    expect(assembleMocks.updateOwnedUser).toHaveBeenNthCalledWith(1, pageId, namespaceId, { pinned: true });
    expect(assembleMocks.updateOwnedUser).toHaveBeenNthCalledWith(2, second, namespaceId, { pinned: true });

    await expect(setPagesPinned([pageId], false)).resolves.toEqual({ ok: true, notice: "Unpinned" });
  });

  it("says how many Pages were pinned when a later one is refused, and refreshes those", async () => {
    const second = "00000000-0000-4000-8000-000000000006";
    assembleMocks.updateOwnedUser
      .mockResolvedValueOnce(ok({ user: { pinned: true } }))
      .mockResolvedValueOnce({ status: 404, body: { code: "page_not_found" } });

    await expect(setPagesPinned([pageId, second], true))
      .resolves.toEqual({ ok: false, error: "Pinned 1 of 2 Pages. Try again for the rest." });
    expect(cacheMocks.revalidatePath.mock.calls).toEqual([["/home"], [`/pages/${pageId}`]]);
  });

  it("refuses an empty or duplicated selection before touching anything", async () => {
    await expect(setPagesPinned([], true)).resolves.toMatchObject({ ok: false });
    await expect(deletePages([])).resolves.toMatchObject({ ok: false });
    await expect(deletePages([pageId, pageId])).resolves.toMatchObject({ ok: false });
    await expect(deleteSpaces([spaceId, spaceId])).resolves.toMatchObject({ ok: false });

    expect(assembleMocks.updateOwnedUser).not.toHaveBeenCalled();
    expect(pageHandlerMocks.remove).not.toHaveBeenCalled();
    expect(spaceHandlerMocks.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["share a page", () => setPageShared(pageId, true)],
    ["pin a page", () => setPagePinned(pageId, true)],
    ["pin a set of pages", () => setPagesPinned([pageId], true)],
    ["delete a page", () => deletePages([pageId])],
    ["answer an asking", () => answerAsk(pageId, {
      approval_id: "a", ask_seq: 1, question_key: "k", option_id: "o",
    })],
    ["share a space", () => shareSpace(spaceId, [pageId], [])],
    ["delete a space", () => deleteSpaces([spaceId])],
    ["rotate a page link", () => rotatePageLink(pageId)],
    ["rotate a space link", () => rotateSpaceLink(spaceId)],
    ["disconnect an agent", () => disconnectAgent(grantId)],
    ["revoke a device", () => revokeDevice(otherSessionId)],
  ] as const)("touches nothing without a session before it can %s", async (_label, act) => {
    authMocks.currentSessionNamespace.mockResolvedValue(null);

    await expect(act()).resolves.toMatchObject({ ok: false });

    expect(pageHandlerMocks.update).not.toHaveBeenCalled();
    expect(pageHandlerMocks.remove).not.toHaveBeenCalled();
    expect(spaceHandlerMocks.remove).not.toHaveBeenCalled();
    expect(spaceHandlerMocks.shareSelection).not.toHaveBeenCalled();
    expect(spaceHandlerMocks.update).not.toHaveBeenCalled();
    expect(assembleMocks.updateOwnedUser).not.toHaveBeenCalled();
    expect(assembleMocks.assembleOwnedPage).not.toHaveBeenCalled();
    expect(decisionMocks.recordAnswer).not.toHaveBeenCalled();
    expect(credentialMocks.revokeAgent).not.toHaveBeenCalled();
    expect(sessionMocks.revokeOwnerSession).not.toHaveBeenCalled();
    expect(provisionMocks.rotateKey).not.toHaveBeenCalled();
  });

  it("refreshes the surfaces an act changed", async () => {
    await setPageShared(pageId, true);
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/home");
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/pages/${pageId}`);

    cacheMocks.revalidatePath.mockClear();
    await deletePages([pageId]);
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/home");
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/pages/${pageId}`);

    cacheMocks.revalidatePath.mockClear();
    await deleteSpaces([spaceId]);
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/home");
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/spaces/${spaceId}`);
  });
});

describe("the reads that stayed route handlers", () => {
  it("does not enter a route handler when the session DAL fails closed", async () => {
    const denied = new Error("session denied");
    authMocks.requireWebSessionNamespace.mockRejectedValueOnce(denied);

    await expect(getChanges(
      new Request(`https://strata.test/pages/${pageId}/changes?since=1`),
      { params: Promise.resolve({ id: pageId }) },
    )).rejects.toBe(denied);
    expect(assembleMocks.listSessionOwnedChanges).not.toHaveBeenCalled();
  });

  it("scopes live polling to the authorized session namespace", async () => {
    const response = await getChanges(
      new Request(`https://strata.test/pages/${pageId}/changes?since=1&assets=refresh`),
      { params: Promise.resolve({ id: pageId }) },
    );

    expect(response.status).toBe(200);
    expect(assembleMocks.listSessionOwnedChanges)
      .toHaveBeenCalledWith(pageId, namespaceId, 1, true);
  });

  it("rechecks page ownership before resolving an attachment", async () => {
    const response = await getAttachment(
      new Request(`https://strata.test/pages/${pageId}/assets/report.pdf`),
      { params: Promise.resolve({ id: pageId, resource: "report.pdf" }) },
    );

    expect(response.status).toBe(302);
    expect(assembleMocks.assembleOwnedPage).toHaveBeenCalledWith(pageId, namespaceId);
    // The request is passed through because the variant (`?w=thumb`) lives in the URL.
    expect(assembleMocks.attachmentRedirect)
      .toHaveBeenCalledWith(expect.any(Request), expect.anything(), namespaceId, "report.pdf");
    expect(authMocks.readHomeData).toHaveBeenCalledTimes(2);
  });
});

describe("ending a session", () => {
  it("ends the session that asked, expires its cookie, and lands on sign-in", async () => {
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/home/sign-in");
    expect(sessionMocks.revokeOwnerSession).toHaveBeenCalledWith(namespaceId, sessionId);
    expect(authMocks.expireSessionCookie).toHaveBeenCalledOnce();
  });

  it("ends every browser this Strata has signed in, the one asking included", async () => {
    await expect(signOutEverywhere()).rejects.toThrow("NEXT_REDIRECT:/home/sign-in");
    expect(sessionMocks.revokeOwnerSessionsForNamespace).toHaveBeenCalledWith(namespaceId);
    expect(authMocks.expireSessionCookie).toHaveBeenCalledOnce();
  });

  it("still expires the cookie and lands somewhere real with no session at all", async () => {
    // A bodiless 404 to a form post downloads as a file in Safari, so always redirect.
    authMocks.currentSessionNamespace.mockResolvedValue(null);
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/home/sign-in");
    expect(sessionMocks.revokeOwnerSession).not.toHaveBeenCalled();
    expect(authMocks.expireSessionCookie).toHaveBeenCalledOnce();
  });

  it("signs one other browser out and says so", async () => {
    await expect(revokeDevice(otherSessionId))
      .resolves.toEqual({ ok: true, notice: "That browser is signed out." });
    expect(sessionMocks.revokeOwnerSession).toHaveBeenCalledWith(namespaceId, otherSessionId);
  });

  it("cannot reach a session on another Strata through the id it is handed", async () => {
    sessionMocks.revokeOwnerSession.mockResolvedValue(null);
    await expect(revokeDevice(otherSessionId)).resolves.toMatchObject({ ok: false });
  });

  it("disconnects one agent inside the session namespace", async () => {
    await expect(disconnectAgent(grantId)).resolves.toEqual({ ok: true, notice: null });
    expect(credentialMocks.revokeAgent).toHaveBeenCalledWith(namespaceId, grantId);
  });

  it("passes a handler's refusal on as a refusal", async () => {
    credentialMocks.revokeAgent.mockResolvedValue({ status: 404, body: {} });
    await expect(disconnectAgent(grantId)).resolves.toMatchObject({ ok: false });
  });
});
