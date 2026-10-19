/**
 * Owner sessions against the real table: no secret at rest, one namespace per session, sliding
 * expiry, and immediate revocation of one or all browsers.
 */
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { sha256Hex } from "@/server/credentials/keys";
import { createCredentialNamespace } from "@/test/namespace";

import {
  createOwnerSession,
  describeClient,
  isOwnerSessionSecret,
  labelOwnerSession,
  listOwnerSessions,
  OWNER_SESSION_SLIDE_AFTER_MS,
  OWNER_SESSION_TTL_MS,
  resolveOwnerSession,
  revokeOwnerSession,
  revokeOwnerSessionsForNamespace,
} from "./owner-session";

const BASE = "https://strata.test";
const db = getDb();
const namespaceIds: string[] = [];

afterEach(async () => {
  if (namespaceIds.length > 0) {
    await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
  }
});

async function strata() {
  const ns = await createCredentialNamespace({ baseUrl: BASE, label: "instinct" });
  namespaceIds.push(ns.namespace_id);
  return ns;
}

describe("owner sessions", () => {
  it("stores only a hash of the secret it hands the browser", async () => {
    const ns = await strata();
    const session = await createOwnerSession(ns.namespace_id);

    expect(isOwnerSessionSecret(session.secret)).toBe(true);
    const [row] = await db
      .select({
        hash: schema.ownerSessions.sessionHash,
        expiresAt: schema.ownerSessions.expiresAt,
      })
      .from(schema.ownerSessions)
      .where(eq(schema.ownerSessions.id, session.id));

    expect(row?.hash).toBe(sha256Hex(session.secret));
    expect(row?.hash).not.toContain(session.secret);
    // 90 days, to within the round trip that created it.
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(OWNER_SESSION_TTL_MS - 60_000);
  });

  it("resolves to its own namespace and to no other", async () => {
    const [mine, theirs] = await Promise.all([strata(), strata()]);
    const session = await createOwnerSession(mine.namespace_id);

    const resolved = await resolveOwnerSession(session.secret);
    expect(resolved?.namespaceId).toBe(mine.namespace_id);
    expect(resolved?.namespaceId).not.toBe(theirs.namespace_id);
  });

  it("refuses a secret that is not one of ours without touching the database", async () => {
    await expect(resolveOwnerSession("dws_not-an-owner-session-secret-value")).resolves.toBeNull();
    await expect(resolveOwnerSession(`ows_${"z".repeat(43)}`)).resolves.toBeNull();
  });

  it("slides the window forward once a day, and not on every read", async () => {
    const ns = await strata();
    const session = await createOwnerSession(ns.namespace_id);

    // A second read inside the same day must not pay for a write.
    const fresh = await resolveOwnerSession(session.secret);
    expect(fresh?.slid).toBe(false);
    expect(fresh?.expiresAt.getTime()).toBe(session.expiresAt.getTime());

    const later = new Date(Date.now() + OWNER_SESSION_SLIDE_AFTER_MS + 60_000);
    const slid = await resolveOwnerSession(session.secret, later);
    expect(slid?.slid).toBe(true);
    expect(slid!.expiresAt.getTime()).toBe(later.getTime() + OWNER_SESSION_TTL_MS);

    const [row] = await db
      .select({ expiresAt: schema.ownerSessions.expiresAt, lastUsedAt: schema.ownerSessions.lastUsedAt })
      .from(schema.ownerSessions)
      .where(eq(schema.ownerSessions.id, session.id));
    expect(row.expiresAt.getTime()).toBe(later.getTime() + OWNER_SESSION_TTL_MS);
    expect(row.lastUsedAt?.getTime()).toBe(later.getTime());
  });

  it("stops resolving the moment it expires", async () => {
    const ns = await strata();
    const session = await createOwnerSession(ns.namespace_id);
    const afterExpiry = new Date(Date.now() + OWNER_SESSION_TTL_MS + 60_000);
    await expect(resolveOwnerSession(session.secret, afterExpiry)).resolves.toBeNull();
  });

  it("revokes one browser without touching the others, idempotently", async () => {
    const ns = await strata();
    const [first, second] = await Promise.all([
      createOwnerSession(ns.namespace_id),
      createOwnerSession(ns.namespace_id),
    ]);

    const revoked = await revokeOwnerSession(ns.namespace_id, first.id);
    expect(revoked).not.toBeNull();
    await expect(resolveOwnerSession(first.secret)).resolves.toBeNull();
    await expect(resolveOwnerSession(second.secret)).resolves.not.toBeNull();

    // Twice is the same answer, with the original timestamp.
    const again = await revokeOwnerSession(ns.namespace_id, first.id);
    expect(again?.revokedAt.getTime()).toBe(revoked!.revokedAt.getTime());
  });

  it("will not let one Strata revoke another's session", async () => {
    const [mine, theirs] = await Promise.all([strata(), strata()]);
    const session = await createOwnerSession(mine.namespace_id);

    await expect(revokeOwnerSession(theirs.namespace_id, session.id)).resolves.toBeNull();
    await expect(resolveOwnerSession(session.secret)).resolves.not.toBeNull();
  });

  it("signs every browser out at once, which is what rotation calls", async () => {
    const [mine, theirs] = await Promise.all([strata(), strata()]);
    const [first, second, other] = await Promise.all([
      createOwnerSession(mine.namespace_id),
      createOwnerSession(mine.namespace_id),
      createOwnerSession(theirs.namespace_id),
    ]);

    expect(await revokeOwnerSessionsForNamespace(mine.namespace_id)).toBe(2);
    await expect(resolveOwnerSession(first.secret)).resolves.toBeNull();
    await expect(resolveOwnerSession(second.secret)).resolves.toBeNull();
    // Another Strata's browsers are none of this link's business.
    await expect(resolveOwnerSession(other.secret)).resolves.not.toBeNull();
  });

  it("lists sessions without exposing anything a browser could replay", async () => {
    const ns = await strata();
    const session = await createOwnerSession(ns.namespace_id);
    await revokeOwnerSession(ns.namespace_id, session.id);

    const listed = await listOwnerSessions(ns.namespace_id);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual({
      id: session.id,
      current: false,
      client_label: null,
      created_at: expect.any(String) as string,
      last_used_at: expect.any(String) as string,
      revoked_at: expect.any(String) as string,
    });
    expect(JSON.stringify(listed)).not.toContain(session.secret);
    expect(JSON.stringify(listed)).not.toContain(sha256Hex(session.secret));
  });

  it("marks the browser that asked, so the list can be acted on", async () => {
    const ns = await strata();
    const here = await createOwnerSession(ns.namespace_id);
    const elsewhere = await createOwnerSession(ns.namespace_id);

    const listed = await listOwnerSessions(ns.namespace_id, here.id);
    const marked = listed.filter((row) => row.current).map((row) => row.id);
    expect(marked).toEqual([here.id]);
    expect(listed.find((row) => row.id === elsewhere.id)?.current).toBe(false);
  });

  it("carries the coarse browser label the list is meant to be read by", async () => {
    const ns = await strata();
    const session = await createOwnerSession(ns.namespace_id);
    await labelOwnerSession(ns.namespace_id, session.id, "Safari on iPhone");

    const [listed] = await listOwnerSessions(ns.namespace_id);
    expect(listed.client_label).toBe("Safari on iPhone");
    // Only the label, never the header it came from.
    const [row] = await db
      .select({ label: schema.ownerSessions.clientLabel })
      .from(schema.ownerSessions)
      .where(eq(schema.ownerSessions.id, session.id));
    expect(row.label).toBe("Safari on iPhone");
  });

  it("will not let one Strata label another's session", async () => {
    const [mine, theirs] = await Promise.all([strata(), strata()]);
    const session = await createOwnerSession(mine.namespace_id);

    await labelOwnerSession(theirs.namespace_id, session.id, "Chrome on Windows");
    const [listed] = await listOwnerSessions(mine.namespace_id);
    expect(listed.client_label).toBeNull();
  });

});

// Client labels: two coarse words, never the header, and nothing for an unrecognised string.
describe("describeClient", () => {
  it("reduces a User-Agent to two words a person can recognise", () => {
    expect(describeClient(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
    )).toBe("Safari on iPhone");
    expect(describeClient(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    )).toBe("Chrome on Mac");
    expect(describeClient(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
    )).toBe("Firefox on Windows");
  });

  it("reads the most specific token first, because every browser claims the last one", () => {
    // Edge and Opera both still say Chrome, and Chromium still says Safari.
    expect(describeClient(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
    )).toBe("Edge on Windows");
    expect(describeClient(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/115.0.0.0",
    )).toBe("Opera on Mac");
    // Chrome on iOS is WebKit underneath and says CriOS, never Chrome.
    expect(describeClient(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
    )).toBe("Chrome on iPhone");
  });

  it("names the native shell as itself, on the marker the shell already sets", () => {
    expect(describeClient(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 StrataMobile/0.1",
    )).toBe("Strata app on iPhone");
  });

  it("says nothing rather than guessing, and is always short", () => {
    expect(describeClient(undefined)).toBeNull();
    expect(describeClient("   ")).toBeNull();
    expect(describeClient("curl/8.7.1")).toBeNull();
    // A platform with no recognisable browser keeps the platform.
    expect(describeClient("Mozilla/5.0 (Linux; Android 15) SomethingElse/2")).toBe("Android");
    // Two words, never a fingerprint.
    expect(describeClient(`Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/1 ${"x".repeat(4_000)}`))
      .toBe("Chrome on Mac");
  });
});
