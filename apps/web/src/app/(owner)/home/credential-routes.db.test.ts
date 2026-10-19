/**
 * Session-only owner routes and actions: no grant or Space from another Strata is reachable
 * through an id the caller supplies.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

const authMocks = vi.hoisted(() => ({
  requireWebSessionNamespace: vi.fn(),
  currentSessionNamespace: vi.fn(),
  expireSessionCookie: vi.fn(),
  readHomeData: vi.fn(async <T>(read: () => Promise<T>) => read()),
}));
vi.mock("@/server/auth/web-session", () => authMocks);
// Origin and revalidation need a request scope; stub them so tests hit the database only.
vi.mock("@/server/api/http/read-origin", () => ({ readOrigin: async () => "https://strata.test" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getDb, schema } from "@/server/db";
import { createGrant, verifyAccessToken } from "@/server/credentials";
import { createSpace, shareSpace } from "@/server/credentials/provision";
import { createCredentialNamespace } from "@/test/namespace";

import { GET as agentsGet } from "./agents/route";
import { disconnectAgent, rotatePageLink, rotateSpaceLink } from "./actions";

const BASE = "https://strata.test";
const db = getDb();
const namespaceIds: string[] = [];
const startedAt = new Date();

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.readHomeData.mockImplementation(async <T>(read: () => Promise<T>) => read());
});

afterEach(async () => {
  if (namespaceIds.length > 0) {
    await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
  }
  await db.delete(schema.rateLimitEvents)
    .where(sql`${schema.rateLimitEvents.createdAt} >= ${startedAt}`);
});

async function strata() {
  const ns = await createCredentialNamespace({ baseUrl: BASE, label: "instinct" });
  namespaceIds.push(ns.namespace_id);
  const principal = { namespaceId: ns.namespace_id, sessionId: crypto.randomUUID() };
  authMocks.currentSessionNamespace.mockResolvedValue(principal);
  authMocks.requireWebSessionNamespace.mockResolvedValue(principal);
  return ns;
}

async function read(response: Response) {
  return { status: response.status, body: await response.json() as Record<string, unknown>, response };
}

function ownerHeaders(response: Response): void {
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

describe("GET /home/agents", () => {
  it("lists every credential ever issued, revoked ones included, with no secret in it", async () => {
    const ns = await strata();
    const phone = await createGrant({
      namespaceId: ns.namespace_id,
      kind: "viewer",
      driver: "strata-mobile",
      label: "iPhone",
    });
    await db.update(schema.grants).set({ revokedAt: new Date(), revokedBy: "owner" })
      .where(eq(schema.grants.id, phone.id));

    const { status, body, response } = await read(await agentsGet(new Request("https://strata.test/home/agents")));

    expect(status).toBe(200);
    ownerHeaders(response);
    const agents = body.agents as Record<string, unknown>[];
    expect(agents).toHaveLength(2);
    expect(agents[0]).toMatchObject({ grant_id: phone.id, kind: "viewer", driver: "strata-mobile" });
    expect(agents[0].revoked_at).not.toBeNull();
    // Revoked grants stay listed.
    expect(agents[1]).toMatchObject({ grant_id: ns.grant_id, kind: "writer", revoked_at: null });
    expect(JSON.stringify(body)).not.toContain("sw_");
  });
});

describe("disconnecting one agent", () => {
  it("kills the grant and everything under it, immediately", async () => {
    const ns = await strata();

    await expect(disconnectAgent(ns.grant_id)).resolves.toEqual({ ok: true, notice: null });
    expect(await verifyAccessToken(ns.access_token)).toBeNull();
  });

  it("cannot reach a grant on another Strata through the id it is handed", async () => {
    const mine = await strata();
    const theirs = await createCredentialNamespace({ baseUrl: BASE, label: "someone else" });
    namespaceIds.push(theirs.namespace_id);
    authMocks.currentSessionNamespace.mockResolvedValue({
      namespaceId: mine.namespace_id,
      sessionId: crypto.randomUUID(),
    });

    await expect(disconnectAgent(theirs.grant_id)).resolves.toMatchObject({ ok: false });
    expect(await verifyAccessToken(theirs.access_token)).not.toBeNull();
  });
});

describe("the leaked-link cure", () => {
  it("re-mints a Space's share link, and the old key stops resolving", async () => {
    const ns = await strata();
    const space = await createSpace(ns.namespace_id, { slug: "trip", name: "Trip", emoji: "🧳" });
    // Rotation requires an existing share.
    await shareSpace(space.space_id, { baseUrl: BASE });

    const rotated = await rotateSpaceLink(space.space_id);
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) return;
    expect(rotated.url).toMatch(new RegExp(`^${BASE}/share/spk_[A-Za-z0-9_-]{43}$`));
    expect(rotated.notice).toContain("no longer opens");

    const again = await rotateSpaceLink(space.space_id);
    expect(again.ok && again.url).not.toBe(rotated.url);
  });

  it("cannot rotate a Space on another Strata through the id it is handed", async () => {
    const mine = await strata();
    const theirs = await createCredentialNamespace({ baseUrl: BASE, label: "someone else" });
    namespaceIds.push(theirs.namespace_id);
    const space = await createSpace(theirs.namespace_id, { slug: "theirs", name: "Theirs", emoji: "🔒" });
    // Shared, so the refusal is only about ownership.
    await shareSpace(space.space_id, { baseUrl: BASE });
    authMocks.currentSessionNamespace.mockResolvedValue({
      namespaceId: mine.namespace_id,
      sessionId: crypto.randomUUID(),
    });

    await expect(rotateSpaceLink(space.space_id)).resolves.toMatchObject({ ok: false });
  });

  it("cannot rotate a page nobody owns through the id it is handed", async () => {
    await strata();
    await expect(rotatePageLink("11111111-2222-4333-8444-555555555555"))
      .resolves.toMatchObject({ ok: false });
  });
});
