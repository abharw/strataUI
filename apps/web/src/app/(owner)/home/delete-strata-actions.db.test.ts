/**
 * Server-side confirmation check for account deletion. Uses real rows; only the cookie store
 * and redirect are mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

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
import { createNamespace, createSpace } from "@/server/credentials/provision";

import { deleteStrata } from "./actions";

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

async function signedIn() {
  const created = await createNamespace();
  namespaceIds.push(created.namespace_id);
  await createSpace(created.namespace_id, { slug: "trip", name: "Trip", emoji: "🧳" });
  const session = await createOwnerSession(created.namespace_id);
  currentSessionNamespace.mockResolvedValue({
    namespaceId: created.namespace_id,
    sessionId: session.id,
  });
  return { namespaceId: created.namespace_id, session };
}

async function stillThere(namespaceId: string): Promise<boolean> {
  const rows = await db.select({ id: schema.namespaces.id })
    .from(schema.namespaces)
    .where(eq(schema.namespaces.id, namespaceId));
  return rows.length === 1;
}

describe("deleteStrata", () => {
  it("erases the Strata, expires the cookie, and lands on the public door", async () => {
    const { namespaceId, session } = await signedIn();

    // Lands on `/`, since there is no account to sign back in to.
    await expect(deleteStrata("DELETE")).rejects.toThrow("NEXT_REDIRECT:/");
    expect(expireSessionCookie).toHaveBeenCalledOnce();

    await expect(stillThere(namespaceId)).resolves.toBe(false);
    await expect(resolveOwnerSession(session.secret)).resolves.toBeNull();
  });

  it("refuses anything but the word, and leaves every row where it is", async () => {
    const { namespaceId } = await signedIn();

    for (const typed of ["", "delete", "Delete", " DELETE", "DELETE me", "yes"]) {
      await expect(deleteStrata(typed)).resolves.toMatchObject({ ok: false });
    }

    // Case and whitespace variants are refused.
    await expect(stillThere(namespaceId)).resolves.toBe(true);
    expect(expireSessionCookie).not.toHaveBeenCalled();
  });

  it("refuses a caller with no session, however well it types", async () => {
    const { namespaceId } = await signedIn();
    currentSessionNamespace.mockResolvedValue(null);

    await expect(deleteStrata("DELETE")).resolves.toMatchObject({ ok: false });
    await expect(stillThere(namespaceId)).resolves.toBe(true);
  });

  it("says nothing useful when the Strata is already gone", async () => {
    const { namespaceId } = await signedIn();
    await expect(deleteStrata("DELETE")).rejects.toThrow("NEXT_REDIRECT:/");

    // A repeat from another device gets the generic refusal.
    await expect(deleteStrata("DELETE")).resolves.toEqual({ ok: false, error: "Try again." });
    await expect(stillThere(namespaceId)).resolves.toBe(false);
  });
});
