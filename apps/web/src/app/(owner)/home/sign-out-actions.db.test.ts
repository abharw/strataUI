/**
 * Sign out this browser or every browser. Uses real `owner_sessions` rows; only the cookie
 * store and redirect are mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

const currentSessionNamespace = vi.hoisted(() => vi.fn());
const expireSessionCookie = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/web-session", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/auth/web-session")>(),
  currentSessionNamespace,
  expireSessionCookie,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock("@/server/api/http/read-origin", () => ({ readOrigin: async () => "https://strata.test" }));

import { getDb, schema } from "@/server/db";
import { createOwnerSession, resolveOwnerSession } from "@/server/auth/owner-session";
import { createNamespace } from "@/server/credentials/provision";

import { revokeDevice, signOut, signOutEverywhere } from "./actions";

const db = getDb();
const namespaceIds: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  if (namespaceIds.length > 0) {
    await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
  }
});

async function twoBrowsers() {
  const created = await createNamespace();
  namespaceIds.push(created.namespace_id);
  const here = await createOwnerSession(created.namespace_id);
  const elsewhere = await createOwnerSession(created.namespace_id);
  currentSessionNamespace.mockResolvedValue({
    namespaceId: created.namespace_id,
    sessionId: here.id,
  });
  return { here, elsewhere };
}

describe("signOut", () => {
  it("ends the session that asked, expires its cookie, and lands on sign-in", async () => {
    const { here, elsewhere } = await twoBrowsers();

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/home/sign-in");
    expect(expireSessionCookie).toHaveBeenCalledOnce();

    await expect(resolveOwnerSession(here.secret)).resolves.toBeNull();
    // Other sessions are unaffected.
    await expect(resolveOwnerSession(elsewhere.secret)).resolves.not.toBeNull();
  });

  it("lands the browser somewhere real even with no session to end", async () => {
    // Redirect rather than 404: Safari downloads a bodiless 404 from a form post.
    currentSessionNamespace.mockResolvedValue(null);
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/home/sign-in");
    expect(expireSessionCookie).toHaveBeenCalledOnce();
  });
});

describe("signOutEverywhere", () => {
  it("ends every browser this Strata has signed in, the one asking included", async () => {
    const { here, elsewhere } = await twoBrowsers();

    await expect(signOutEverywhere()).rejects.toThrow("NEXT_REDIRECT:/home/sign-in");
    expect(expireSessionCookie).toHaveBeenCalledOnce();
    await expect(resolveOwnerSession(here.secret)).resolves.toBeNull();
    await expect(resolveOwnerSession(elsewhere.secret)).resolves.toBeNull();
  });
});

describe("revokeDevice", () => {
  it("ends one other browser and leaves this one signed in", async () => {
    const { here, elsewhere } = await twoBrowsers();

    await expect(revokeDevice(elsewhere.id))
      .resolves.toEqual({ ok: true, notice: "That browser is signed out." });
    await expect(resolveOwnerSession(elsewhere.secret)).resolves.toBeNull();
    await expect(resolveOwnerSession(here.secret)).resolves.not.toBeNull();
  });

  it("cannot end a session belonging to another Strata", async () => {
    const { here } = await twoBrowsers();
    const other = await createNamespace();
    namespaceIds.push(other.namespace_id);
    const theirs = await createOwnerSession(other.namespace_id);

    await expect(revokeDevice(theirs.id)).resolves.toMatchObject({ ok: false });
    await expect(resolveOwnerSession(theirs.secret)).resolves.not.toBeNull();
    await expect(resolveOwnerSession(here.secret)).resolves.not.toBeNull();
  });
});
