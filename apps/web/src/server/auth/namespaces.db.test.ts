/**
 * Erasing a Strata against the real database. Most of the erase is foreign-key cascades, so this
 * seeds every namespace-owned table, erases, and counts; an identical neighbour must be untouched.
 */
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { createOwnerSession, resolveOwnerSession } from "./owner-session";
import { generateSecret, sha256Hex } from "@/server/credentials/keys";
import { sealKey } from "@/server/credentials/keys/at-rest";
import { createSpace } from "@/server/credentials/provision";
import { BUCKETS } from "@/server/credentials/provision/rate-limit";
import { storage } from "@/server/assets/storage";
import { createCredentialNamespace } from "@/test/namespace";

import { eraseNamespace } from "./namespaces";

const db = getDb();
const namespaceIds: string[] = [];
const budgetKeys: string[] = [];

afterEach(async () => {
  if (namespaceIds.length > 0) {
    await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
  }
  // `rate_limit_events` has no foreign key, so the erase and this seed handle it by hand.
  if (budgetKeys.length > 0) {
    await db.delete(schema.rateLimitEvents).where(inArray(schema.rateLimitEvents.key, budgetKeys.splice(0)));
  }
});

interface Seeded {
  namespaceId: string;
  grantId: string;
  spaceId: string;
  pageId: string;
  storageKey: string;
  sessionSecret: string;
  day: string;
}

/** One row in every table a namespace owns, so nothing can be erased by accident. */
async function seed(): Promise<Seeded> {
  const created = await createCredentialNamespace({});
  namespaceIds.push(created.namespace_id);
  budgetKeys.push(created.namespace_id);
  const namespaceId = created.namespace_id;

  const space = await createSpace(namespaceId, { slug: "trip", name: "Trip", emoji: "🧳" });
  const pageId = crypto.randomUUID();
  const readKey = generateSecret("page");
  await db.insert(schema.pages).values({
    id: pageId,
    namespaceId,
    spaceId: space.space_id,
    slug: "flights",
    title: "Flights",
    document: {
      root: "root",
      answer: { verdict: "Booked." },
      elements: { root: { type: "section", props: {}, children: [] } },
    },
    sealedReadKey: sealKey(readKey),
    lastSummary: "Booked the flights.",
    readKeyHash: sha256Hex(readKey),
  });

  await db.insert(schema.pageUserState).values({ pageId, pinned: true });
  await db.insert(schema.viewLog).values({ pageId, origin: "home" });
  await db.insert(schema.pageWrites).values({
    pageId,
    grantId: created.grant_id,
    version: 1,
    summary: "Booked the flights.",
    kind: "create",
  });
  await db.insert(schema.pageAsks).values({
    pageId,
    approvalId: "spend",
    askSeq: 1,
    questionKey: sha256Hex("spend"),
  });
  await db.insert(schema.exposureLog).values({
    pageId,
    spaceId: space.space_id,
    shared: true,
    actor: "user",
  });
  await db.insert(schema.decisionLog).values({
    namespaceId,
    pageId,
    pageTitle: "Flights",
    approvalId: "spend",
    askSeq: 1,
    questionKey: sha256Hex("spend"),
    question: "Approve the fare?",
    options: [{ id: "yes", label: "Yes" }],
    chosenId: "yes",
    chosenLabel: "Yes",
    answeredBy: "owner",
  });

  // The bytes live in Postgres, so this is a row count too.
  const storageKey = crypto.randomUUID();
  await db.insert(schema.assets).values({
    namespaceId,
    resourceId: `asset_${crypto.randomUUID()}`,
    storageKey,
    filename: "boarding-pass.png",
    mediaType: "image/png",
    sizeBytes: 4,
    storedAt: new Date(),
    uploadExpiresAt: new Date(Date.now() + 600_000),
  });
  await storage().put(storageKey, Buffer.from([1, 2, 3, 4]));

  const day = new Date().toISOString().slice(0, 10);
  await db.insert(schema.namespaceUsage).values({ namespaceId, day, pageWrites: 1 });
  await db.insert(schema.rateLimitEvents).values({ bucket: BUCKETS.staticMint, key: namespaceId });

  const session = await createOwnerSession(namespaceId);

  return {
    namespaceId,
    grantId: created.grant_id,
    spaceId: space.space_id,
    pageId,
    storageKey,
    sessionSecret: session.secret,
    day,
  };
}

async function rows(query: PromiseLike<{ count: number }[]>): Promise<number> {
  return (await query)[0]?.count ?? 0;
}

const counted = sql<number>`count(*)::int`;

/** Everything the namespace owns, counted from the tables themselves. */
async function tally(seeded: Seeded) {
  return {
    namespace: await rows(db.select({ count: counted }).from(schema.namespaces)
      .where(eq(schema.namespaces.id, seeded.namespaceId))),
    grants: await rows(db.select({ count: counted }).from(schema.grants)
      .where(eq(schema.grants.namespaceId, seeded.namespaceId))),
    credentialTokens: await rows(db.select({ count: counted }).from(schema.credentialTokens)
      .where(eq(schema.credentialTokens.grantId, seeded.grantId))),
    ownerSessions: await rows(db.select({ count: counted }).from(schema.ownerSessions)
      .where(eq(schema.ownerSessions.namespaceId, seeded.namespaceId))),
    usage: await rows(db.select({ count: counted }).from(schema.namespaceUsage)
      .where(eq(schema.namespaceUsage.namespaceId, seeded.namespaceId))),
    budgets: await rows(db.select({ count: counted }).from(schema.rateLimitEvents)
      .where(and(
        eq(schema.rateLimitEvents.bucket, BUCKETS.staticMint),
        eq(schema.rateLimitEvents.key, seeded.namespaceId),
      ))),
    spaces: await rows(db.select({ count: counted }).from(schema.spaces)
      .where(eq(schema.spaces.namespaceId, seeded.namespaceId))),
    pages: await rows(db.select({ count: counted }).from(schema.pages)
      .where(eq(schema.pages.namespaceId, seeded.namespaceId))),
    pageUserState: await rows(db.select({ count: counted }).from(schema.pageUserState)
      .where(eq(schema.pageUserState.pageId, seeded.pageId))),
    viewLog: await rows(db.select({ count: counted }).from(schema.viewLog)
      .where(eq(schema.viewLog.pageId, seeded.pageId))),
    pageWrites: await rows(db.select({ count: counted }).from(schema.pageWrites)
      .where(eq(schema.pageWrites.pageId, seeded.pageId))),
    pageAsks: await rows(db.select({ count: counted }).from(schema.pageAsks)
      .where(eq(schema.pageAsks.pageId, seeded.pageId))),
    exposureLog: await rows(db.select({ count: counted }).from(schema.exposureLog)
      .where(eq(schema.exposureLog.pageId, seeded.pageId))),
    decisions: await rows(db.select({ count: counted }).from(schema.decisionLog)
      .where(eq(schema.decisionLog.namespaceId, seeded.namespaceId))),
    assets: await rows(db.select({ count: counted }).from(schema.assets)
      .where(eq(schema.assets.namespaceId, seeded.namespaceId))),
    assetBytes: await rows(db.select({ count: counted }).from(schema.assetBlobs)
      .where(eq(schema.assetBlobs.storageKey, seeded.storageKey))),
  };
}

describe("erasing a Strata", () => {
  it("leaves no row in any table the namespace owns, bytes included", async () => {
    const mine = await seed();
    expect(await tally(mine)).toEqual({
      namespace: 1,
      grants: 1,
      credentialTokens: 2,
      ownerSessions: 1,
      usage: 1,
      budgets: 1,
      spaces: 1,
      pages: 1,
      pageUserState: 1,
      viewLog: 1,
      pageWrites: 1,
      pageAsks: 1,
      exposureLog: 1,
      decisions: 1,
      assets: 1,
      assetBytes: 1,
    });

    const erased = await eraseNamespace(mine.namespaceId);

    expect(erased).toEqual({ spaces: 1, pages: 1, assets: 1, agents: 1 });
    expect(Object.values(await tally(mine)).every((count) => count === 0)).toBe(true);
    // Postgres is the byte store, so nothing is left elsewhere.
    await expect(storage().get(mine.storageKey)).resolves.toBeNull();
  });

  it("erases the answers the decision log keeps past a Page's own deletion", async () => {
    // Page deletion keeps decisions; erasing the whole Strata removes them.
    const mine = await seed();
    await eraseNamespace(mine.namespaceId);
    const left = await db.select({ id: schema.decisionLog.id })
      .from(schema.decisionLog)
      .where(eq(schema.decisionLog.pageId, mine.pageId));
    expect(left).toEqual([]);
  });

  it("stops the browser that was signed in, without being told about it", async () => {
    const mine = await seed();
    await expect(resolveOwnerSession(mine.sessionSecret)).resolves.not.toBeNull();

    await eraseNamespace(mine.namespaceId);

    // The session row went with the namespace; nothing had to revoke it first.
    await expect(resolveOwnerSession(mine.sessionSecret)).resolves.toBeNull();
  });

  it("touches nothing belonging to anybody else", async () => {
    const mine = await seed();
    const theirs = await seed();

    await eraseNamespace(mine.namespaceId);

    expect(await tally(theirs)).toEqual({
      namespace: 1,
      grants: 1,
      credentialTokens: 2,
      ownerSessions: 1,
      usage: 1,
      budgets: 1,
      spaces: 1,
      pages: 1,
      pageUserState: 1,
      viewLog: 1,
      pageWrites: 1,
      pageAsks: 1,
      exposureLog: 1,
      decisions: 1,
      assets: 1,
      assetBytes: 1,
    });
  });

  it("answers null for a Strata that is already gone, rather than pretending", async () => {
    const mine = await seed();
    await expect(eraseNamespace(mine.namespaceId)).resolves.not.toBeNull();
    // The second call is the double-tap, the retry, and the second device.
    await expect(eraseNamespace(mine.namespaceId)).resolves.toBeNull();
    await expect(eraseNamespace(crypto.randomUUID())).resolves.toBeNull();
  });
});
