/**
 * The sweep checks `CRON_SECRET` before deleting anything, reports the rows it removed, and never
 * removes a namespace. It is the only path that deletes from the append-only retention tables.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { createGrant, issueTokenPair } from "@/server/credentials";
import { createOwnerSession } from "@/server/auth/owner-session";
import { createNamespace } from "@/server/credentials/provision";
import {
  NAMESPACE_USAGE_RETENTION_MS,
  RATE_LIMIT_EVENT_RETENTION_MS,
} from "@/server/credentials/provision/rate-limit";
import { VIEW_LOG_RETENTION_MS } from "@/server/pages/read/view-log";

import { GET } from "./route";

const SECRET = "cron-secret-for-tests";
const db = getDb();
const namespaceIds: string[] = [];
let previousSecret: string | undefined;

beforeEach(() => {
  previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SECRET;
});

afterEach(async () => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousSecret;
  if (namespaceIds.length > 0) {
    await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
  }
});

function request(header?: string): Request {
  return new Request("https://strata.test/api/cron/sweep", {
    headers: header === undefined ? {} : { authorization: header },
  });
}

async function namespace() {
  const created = await createNamespace();
  namespaceIds.push(created.namespace_id);
  return created.namespace_id;
}

async function pageIn(namespaceId: string): Promise<string> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const [space] = await db
    .insert(schema.spaces)
    .values({ namespaceId, slug: `sweep-${suffix}`, name: "Sweep", emoji: "🧹" })
    .returning({ id: schema.spaces.id });
  const [page] = await db
    .insert(schema.pages)
    .values({
      namespaceId,
      spaceId: space.id,
      slug: `sweep-${suffix}`,
      title: "Sweep",
      document: { root: "root", elements: { root: { type: "section", props: {}, children: [] } } },
      sealedReadKey: `enc.v1.sweep-${suffix}`,
      lastSummary: "seeded",
      readKeyHash: `hash-${suffix}`,
    })
    .returning({ id: schema.pages.id });
  return page.id;
}

describe("GET /api/cron/sweep", () => {
  it("refuses a request with no bearer, a wrong one, or an unset secret", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer not-the-secret"))).status).toBe(401);
    expect((await GET(request(SECRET))).status).toBe(401);
    // Wrong-length bearers must still go through the constant-time compare.
    expect((await GET(request(`Bearer ${SECRET}xxxxxxxx`))).status).toBe(401);
    expect((await GET(request(`Bearer ${SECRET.slice(0, 4)}`))).status).toBe(401);

    delete process.env.CRON_SECRET;
    expect((await GET(request(`Bearer ${SECRET}`))).status).toBe(401);
  });

  it("deletes nothing when it refuses", async () => {
    const namespaceId = await namespace();
    const grant = await createGrant({ namespaceId, kind: "writer", driver: "instinct" });
    await issueTokenPair(grant, { now: new Date(Date.now() - 48 * 60 * 60 * 1000) });

    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    const tokens = await db
      .select({ id: schema.credentialTokens.id })
      .from(schema.credentialTokens)
      .where(eq(schema.credentialTokens.grantId, grant.id));
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("counts the expired credentials and sessions it removed", async () => {
    const namespaceId = await namespace();
    // Old enough that both the access and refresh tokens have expired.
    const grant = await createGrant({ namespaceId, kind: "writer", driver: "instinct" });
    await issueTokenPair(grant, { now: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) });
    await createOwnerSession(namespaceId, {
      now: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
    });

    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      ok: boolean;
      swept: Record<string, number>;
    };

    expect(body.ok).toBe(true);
    expect(body.swept.credential_tokens).toBeGreaterThanOrEqual(2);
    expect(body.swept.owner_sessions).toBeGreaterThanOrEqual(1);
    expect(body.swept).not.toHaveProperty("empty_namespaces");
  });

  it("leaves a claimed Strata with no pages, and its consent log, alone", async () => {
    // A signed-in owner with a grant and an answered approval whose page was deleted.
    const namespaceId = await namespace();
    await db
      .update(schema.namespaces)
      .set({
        workosUserId: `user_sweep_${Math.random().toString(36).slice(2, 10)}`,
        email: `sweep-${Math.random().toString(36).slice(2, 10)}@strata.test`,
        createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      })
      .where(eq(schema.namespaces.id, namespaceId));
    const grant = await createGrant({ namespaceId, kind: "writer", driver: "instinct" });
    const session = await createOwnerSession(namespaceId);
    const deletedPageId = crypto.randomUUID();
    await db.insert(schema.decisionLog).values({
      namespaceId,
      pageId: deletedPageId,
      pageTitle: "Berlin flights",
      approvalId: "book",
      askSeq: 1,
      questionKey: "book:v1",
      question: "Book the 09:40?",
      options: [{ id: "yes", label: "Book it" }],
      chosenId: "yes",
      chosenLabel: "Book it",
      answeredBy: "owner",
      pageDeletedAt: new Date(),
    });

    expect((await GET(request(`Bearer ${SECRET}`))).status).toBe(200);

    const [survivor] = await db
      .select({ id: schema.namespaces.id })
      .from(schema.namespaces)
      .where(eq(schema.namespaces.id, namespaceId));
    expect(survivor?.id).toBe(namespaceId);
    const grants = await db
      .select({ id: schema.grants.id })
      .from(schema.grants)
      .where(eq(schema.grants.id, grant.id));
    expect(grants).toHaveLength(1);
    const sessions = await db
      .select({ id: schema.ownerSessions.id })
      .from(schema.ownerSessions)
      .where(eq(schema.ownerSessions.id, session.id));
    expect(sessions).toHaveLength(1);
    const answers = await db
      .select({ chosenId: schema.decisionLog.chosenId })
      .from(schema.decisionLog)
      .where(eq(schema.decisionLog.namespaceId, namespaceId));
    expect(answers.map((answer) => answer.chosenId)).toEqual(["yes"]);
  });

  it("removes counted events and views past their retention, and keeps the rest", async () => {
    const namespaceId = await namespace();
    const pageId = await pageIn(namespaceId);
    const bucket = `sweep-test-${Math.random().toString(36).slice(2, 10)}`;

    const stale = new Date(Date.now() - RATE_LIMIT_EVENT_RETENTION_MS - 60_000);
    await db.insert(schema.rateLimitEvents).values([
      { bucket, key: "stale", createdAt: stale },
      // Inside the widest rate-limit window, so it must survive.
      { bucket, key: "fresh", createdAt: new Date() },
    ]);
    await db.insert(schema.viewLog).values([
      { pageId, origin: "direct", at: new Date(Date.now() - VIEW_LOG_RETENTION_MS - 60_000) },
      { pageId, origin: "direct", at: new Date() },
    ]);

    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { swept: Record<string, number> };
    expect(body.swept.rate_limit_events).toBeGreaterThanOrEqual(1);
    expect(body.swept.view_log).toBeGreaterThanOrEqual(1);

    const events = await db
      .select({ key: schema.rateLimitEvents.key })
      .from(schema.rateLimitEvents)
      .where(eq(schema.rateLimitEvents.bucket, bucket));
    expect(events.map((event) => event.key)).toEqual(["fresh"]);

    const views = await db
      .select({ id: schema.viewLog.id })
      .from(schema.viewLog)
      .where(eq(schema.viewLog.pageId, pageId));
    expect(views).toHaveLength(1);
  });

  it("removes days of write accounting nothing counts against, and keeps today", async () => {
    const namespaceId = await namespace();
    const day = (msAgo: number) =>
      new Date(Date.now() - msAgo).toISOString().slice(0, 10);
    await db.insert(schema.namespaceUsage).values([
      { namespaceId, day: day(NAMESPACE_USAGE_RETENTION_MS + 24 * 60 * 60_000), pageWrites: 3 },
      { namespaceId, day: day(0), pageWrites: 1 },
    ]);

    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { swept: Record<string, number> };
    expect(body.swept.namespace_usage).toBeGreaterThanOrEqual(1);

    const remaining = await db
      .select({ day: schema.namespaceUsage.day })
      .from(schema.namespaceUsage)
      .where(eq(schema.namespaceUsage.namespaceId, namespaceId));
    expect(remaining.map((row) => row.day)).toEqual([day(0)]);
  });
});
