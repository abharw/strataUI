import { afterEach, describe, expect, it } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { generateSecret, sha256Hex, spaceUrl } from "@/server/credentials/keys";
import { isSealed, openKey, resetUrlKey, sealKey } from "@/server/credentials/keys/at-rest";
import { createSpace } from "@/server/credentials/provision";
import { createCredentialNamespace } from "@/test/namespace";
import * as pages from "@/server/pages/handlers";
import * as spaces from "./handlers";

const BASE = "https://strata.test";
const db = getDb();
const namespaceIds: string[] = [];

afterEach(async () => {
  if (namespaceIds.length > 0) {
    await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
  }
});

async function provision() {
  const created = await createCredentialNamespace({ baseUrl: BASE });
  namespaceIds.push(created.namespace_id);
  return created;
}

async function insertPage(namespaceId: string, spaceId: string, slug: string) {
  const id = crypto.randomUUID();
  const key = generateSecret("page");
  await db.insert(schema.pages).values({
    id,
    namespaceId,
    spaceId,
    slug,
    title: slug,
    document: {
      root: "root",
      answer: { verdict: `${slug} answer` },
      elements: { root: { type: "section", props: {}, children: [] } },
    },
    sealedReadKey: sealKey(key),
    lastSummary: `${slug} summary`,
    readKeyHash: sha256Hex(key),
  });
  return id;
}

async function within<T>(promise: Promise<T>, milliseconds = 5_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Concurrent lifecycle writes did not settle within ${milliseconds}ms.`)), milliseconds);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

describe("Space sharing snapshot", () => {
  it("never lets an agent re-share a page the owner unshared by moving it into a new Space", async () => {
    const namespace = await provision();
    const home = await createSpace(namespace.namespace_id, { slug: "home", name: "Home", emoji: "🏠" });
    const page = await insertPage(namespace.namespace_id, home.space_id, "private-notes");
    await db.update(schema.pages)
      .set({ shared: false, exposureActor: "user", exposureUpdatedAt: new Date() })
      .where(eq(schema.pages.id, page));

    const decoy = await createSpace(namespace.namespace_id, { slug: "decoy", name: "Decoy", emoji: "📦" });
    await db.update(schema.pages).set({ spaceId: decoy.space_id }).where(eq(schema.pages.id, page));

    const shared = await spaces.update({
      namespace_id: namespace.namespace_id,
      space_id: decoy.space_id,
      shared: true,
      actor: "agent",
      baseUrl: BASE,
    });
    expect(shared.status).toBe(200);
    expect(shared.body).toMatchObject({ shared_pages_added: 0 });
    const [row] = await db.select({ shared: schema.pages.shared }).from(schema.pages).where(eq(schema.pages.id, page));
    expect(row.shared).toBe(false);
  });

  it("shares the Pages that exist once, keeps future Pages private, and returns one stable link", async () => {
    const namespace = await provision();
    const space = await createSpace(namespace.namespace_id, { slug: "trip", name: "Trip", emoji: "🧳" });
    const first = await insertPage(namespace.namespace_id, space.space_id, "flights");
    const second = await insertPage(namespace.namespace_id, space.space_id, "hotel");

    const shared = await spaces.update({
      namespace_id: namespace.namespace_id,
      space_id: space.space_id,
      shared: true,
      actor: "user",
      baseUrl: BASE,
    });

    expect(shared.status).toBe(200);
    expect(shared.body).toMatchObject({ shared_pages_added: 2 });
    expect(shared.body).not.toHaveProperty("already_shared");
    const firstUrl = shared.body.space_url;
    expect(typeof firstUrl).toBe("string");
    expect(firstUrl).toMatch(/^https:\/\/strata\.test\/share\/spk_/);

    const [storedSpace] = await db.select({
      sealedShareKey: schema.spaces.sealedShareKey,
      sharedAt: schema.spaces.sharedAt,
      updatedAt: schema.spaces.updatedAt,
    })
      .from(schema.spaces).where(eq(schema.spaces.id, space.space_id));
    expect(storedSpace.sharedAt).toBeInstanceOf(Date);
    expect(storedSpace.sealedShareKey).not.toBeNull();
    expect(isSealed(storedSpace.sealedShareKey!)).toBe(true);
    // The row stores only the key; the origin comes from the request.
    expect(storedSpace.sealedShareKey!).not.toContain("strata.test");
    expect(spaceUrl(BASE, openKey(storedSpace.sealedShareKey!))).toBe(firstUrl);

    const snapshot = await db.select({ id: schema.pages.id, shared: schema.pages.shared })
      .from(schema.pages).where(eq(schema.pages.spaceId, space.space_id)).orderBy(asc(schema.pages.slug));
    expect(new Map(snapshot.map((row) => [row.id, row.shared]))).toEqual(new Map([
      [first, true],
      [second, true],
    ]));

    const future = await insertPage(namespace.namespace_id, space.space_id, "packing");
    const copied = await spaces.update({
      namespace_id: namespace.namespace_id,
      space_id: space.space_id,
      shared: true,
      actor: "user",
      baseUrl: BASE,
    });
    expect(copied.body).toMatchObject({
      space_url: firstUrl,
      shared_pages_added: 0,
      already_shared: true,
    });
    const [afterCopy] = await db.select({ updatedAt: schema.spaces.updatedAt })
      .from(schema.spaces).where(eq(schema.spaces.id, space.space_id));
    expect(afterCopy.updatedAt).toEqual(storedSpace.updatedAt);
    const [futureBeforeAdd] = await db.select({ shared: schema.pages.shared })
      .from(schema.pages).where(eq(schema.pages.id, future));
    expect(futureBeforeAdd.shared).toBe(false);

    const added = await pages.update({
      namespace_id: namespace.namespace_id,
      page_id: future,
      shared: true,
      actor: "user",
      baseUrl: BASE,
    });
    expect(added.body).toMatchObject({ shared: true, space_url: firstUrl });
  });

  it("curates a Space link's Pages atomically without changing direct Page links", async () => {
    const namespace = await provision();
    const space = await createSpace(namespace.namespace_id, { slug: "briefing", name: "Briefing", emoji: "🗞️" });
    const first = await insertPage(namespace.namespace_id, space.space_id, "first");
    const second = await insertPage(namespace.namespace_id, space.space_id, "second");
    const directKeysBefore = await db.select({ id: schema.pages.id, readKeyHash: schema.pages.readKeyHash })
      .from(schema.pages).where(eq(schema.pages.spaceId, space.space_id));

    const firstSelection = await spaces.shareSelection({
      namespace_id: namespace.namespace_id,
      space_id: space.space_id,
      page_ids: [first],
      expected_page_ids: [],
      actor: "user",
      baseUrl: BASE,
    });
    expect(firstSelection).toMatchObject({
      status: 200,
      body: { included_page_count: 1, shared_pages_added: 1, shared_pages_removed: 0 },
    });
    const stableUrl = firstSelection.body.space_url;
    expect(stableUrl).toMatch(/^https:\/\/strata\.test\/share\/spk_/);

    const firstState = await db.select({ id: schema.pages.id, shared: schema.pages.shared, readKeyHash: schema.pages.readKeyHash })
      .from(schema.pages).where(eq(schema.pages.spaceId, space.space_id));
    expect(new Map(firstState.map((page) => [page.id, page.shared]))).toEqual(new Map([
      [first, true],
      [second, false],
    ]));
    expect(new Map(firstState.map(({ id, readKeyHash }) => [id, readKeyHash]))).toEqual(
      new Map(directKeysBefore.map(({ id, readKeyHash }) => [id, readKeyHash])),
    );

    const replacement = await spaces.shareSelection({
      namespace_id: namespace.namespace_id,
      space_id: space.space_id,
      page_ids: [second],
      expected_page_ids: [first],
      actor: "user",
      baseUrl: BASE,
    });
    expect(replacement).toMatchObject({
      status: 200,
      body: {
        space_url: stableUrl,
        included_page_count: 1,
        shared_pages_added: 1,
        shared_pages_removed: 1,
      },
    });

    const staleEdit = await spaces.shareSelection({
      namespace_id: namespace.namespace_id,
      space_id: space.space_id,
      page_ids: [first],
      expected_page_ids: [first],
      actor: "user",
      baseUrl: BASE,
    });
    expect(staleEdit).toMatchObject({
      status: 409,
      body: { code: "stale_space_page_selection" },
    });

    const logsAfterChange = await db.select({ pageId: schema.exposureLog.pageId, shared: schema.exposureLog.shared })
      .from(schema.exposureLog).where(eq(schema.exposureLog.spaceId, space.space_id));
    expect(logsAfterChange).toEqual(expect.arrayContaining([
      { pageId: first, shared: true },
      { pageId: first, shared: false },
      { pageId: second, shared: true },
    ]));

    const idempotent = await spaces.shareSelection({
      namespace_id: namespace.namespace_id,
      space_id: space.space_id,
      page_ids: [second],
      expected_page_ids: [second],
      actor: "user",
      baseUrl: BASE,
    });
    expect(idempotent).toMatchObject({
      status: 200,
      body: { shared_pages_added: 0, shared_pages_removed: 0 },
    });
    const logsAfterRetry = await db.select({ id: schema.exposureLog.id })
      .from(schema.exposureLog).where(eq(schema.exposureLog.spaceId, space.space_id));
    expect(logsAfterRetry).toHaveLength(logsAfterChange.length);
  });

  it("rejects stale, malformed, and duplicate selections before minting or changing a Space link", async () => {
    const namespace = await provision();
    const space = await createSpace(namespace.namespace_id, { slug: "selection", name: "Selection", emoji: "☑️" });
    const local = await insertPage(namespace.namespace_id, space.space_id, "local");
    const otherSpace = await createSpace(namespace.namespace_id, { slug: "other", name: "Other", emoji: "📦" });
    const foreign = await insertPage(namespace.namespace_id, otherSpace.space_id, "foreign");

    const duplicate = await spaces.shareSelection({
      namespace_id: namespace.namespace_id,
      space_id: space.space_id,
      page_ids: [local, local],
      expected_page_ids: [],
      actor: "user",
      baseUrl: BASE,
    });
    expect(duplicate).toMatchObject({ status: 422, body: { code: "duplicate_page_ids" } });

    const stale = await spaces.shareSelection({
      namespace_id: namespace.namespace_id,
      space_id: space.space_id,
      page_ids: [foreign],
      expected_page_ids: [],
      actor: "user",
      baseUrl: BASE,
    });
    expect(stale).toMatchObject({ status: 409, body: { code: "stale_space_page_selection" } });

    const [storedSpace] = await db.select({ shareKeyHash: schema.spaces.shareKeyHash })
      .from(schema.spaces).where(eq(schema.spaces.id, space.space_id));
    const [storedPage] = await db.select({ shared: schema.pages.shared })
      .from(schema.pages).where(eq(schema.pages.id, local));
    expect(storedSpace.shareKeyHash).toBeNull();
    expect(storedPage.shared).toBe(false);
  });

  it("mints a valid Space link for an empty first selection", async () => {
    const namespace = await provision();
    const space = await createSpace(namespace.namespace_id, { slug: "empty", name: "Empty", emoji: "🫙" });

    const result = await spaces.shareSelection({
      namespace_id: namespace.namespace_id,
      space_id: space.space_id,
      page_ids: [],
      expected_page_ids: [],
      actor: "user",
      baseUrl: BASE,
    });

    expect(result).toMatchObject({
      status: 200,
      body: { included_page_count: 0, shared_pages_added: 0, shared_pages_removed: 0 },
    });
    expect(result.body.space_url).toMatch(/^https:\/\/strata\.test\/share\/spk_/);
  });

  it("returns the same stable Space URL to concurrent first Page shares", async () => {
    const namespace = await provision();
    const space = await createSpace(namespace.namespace_id, { slug: "parallel", name: "Parallel", emoji: "🧵" });
    const first = await insertPage(namespace.namespace_id, space.space_id, "first");
    const second = await insertPage(namespace.namespace_id, space.space_id, "second");

    const [left, right] = await within(Promise.all([
      pages.update({
        namespace_id: namespace.namespace_id,
        page_id: first,
        shared: true,
        actor: "user",
        baseUrl: BASE,
      }),
      pages.update({
        namespace_id: namespace.namespace_id,
        page_id: second,
        shared: true,
        actor: "user",
        baseUrl: BASE,
      }),
    ]));

    expect(left.status).toBe(200);
    expect(right.status).toBe(200);
    expect(left.body.space_url).toMatch(/^https:\/\/strata\.test\/share\/spk_/);
    expect(right.body.space_url).toBe(left.body.space_url);

    const [stored] = await db.select({ sealedShareKey: schema.spaces.sealedShareKey }).from(schema.spaces)
      .where(eq(schema.spaces.id, space.space_id));
    expect(spaceUrl(BASE, openKey(stored.sealedShareKey!))).toBe(left.body.space_url);
  });

  it("settles concurrent source share, destination share, and Page move without a lock cycle", async () => {
    const namespace = await provision();
    const source = await createSpace(namespace.namespace_id, { slug: "source", name: "Source", emoji: "📥" });
    const destination = await createSpace(namespace.namespace_id, { slug: "destination", name: "Destination", emoji: "📤" });
    const page = await insertPage(namespace.namespace_id, source.space_id, "traveller");

    const [moved, sourceShared, destinationShared] = await within(Promise.all([
      pages.update({
        namespace_id: namespace.namespace_id,
        page_id: page,
        space_id: destination.space_id,
        actor: "user",
        baseUrl: BASE,
      }),
      spaces.update({
        namespace_id: namespace.namespace_id,
        space_id: source.space_id,
        shared: true,
        actor: "user",
        baseUrl: BASE,
      }),
      spaces.update({
        namespace_id: namespace.namespace_id,
        space_id: destination.space_id,
        shared: true,
        actor: "user",
        baseUrl: BASE,
      }),
    ]));

    expect(moved).toMatchObject({ status: 200, body: { moved: true, space_id: destination.space_id } });
    expect(sourceShared.status).toBe(200);
    expect(destinationShared.status).toBe(200);
    const [stored] = await db.select({ spaceId: schema.pages.spaceId }).from(schema.pages).where(eq(schema.pages.id, page));
    expect(stored.spaceId).toBe(destination.space_id);
  });
});

describe("Space mutation boundaries", () => {
  it("stores nothing when create_space receives markup in visible chrome", async () => {
    const namespace = await provision();
    const result = await spaces.create({
      namespace_id: namespace.namespace_id,
      slug: "markup-create",
      name: "<script>Roadmap</script>",
      emoji: "🗺️",
      baseUrl: BASE,
    });
    expect(result).toMatchObject({
      status: 422,
      body: { code: "literal_markup", path: "/name", next: ["create_space"] },
    });
    expect(await db.select({ id: schema.spaces.id }).from(schema.spaces).where(and(
      eq(schema.spaces.namespaceId, namespace.namespace_id),
      eq(schema.spaces.slug, "markup-create"),
    ))).toHaveLength(0);
  });

  it("keeps the old name when set_space receives markup", async () => {
    const namespace = await provision();
    const space = await createSpace(namespace.namespace_id, { slug: "markup-rename", name: "Roadmap", emoji: "🗺️" });
    const result = await spaces.update({
      namespace_id: namespace.namespace_id,
      space_id: space.space_id,
      name: "**Roadmap**",
      actor: "agent",
      baseUrl: BASE,
    });
    expect(result).toMatchObject({
      status: 422,
      body: { code: "literal_markup", path: "/name", next: ["set_space"] },
    });
    const [stored] = await db.select({ name: schema.spaces.name }).from(schema.spaces)
      .where(eq(schema.spaces.id, space.space_id));
    expect(stored.name).toBe("Roadmap");
  });

  it("preserves an emoji on rename and changes it only when explicitly requested", async () => {
    const namespace = await provision();
    const space = await createSpace(namespace.namespace_id, { slug: "roadmap", name: "Roadmap", emoji: "🗺️" });

    const renamed = await spaces.update({
      namespace_id: namespace.namespace_id,
      space_id: space.space_id,
      name: "Product roadmap",
      actor: "agent",
      baseUrl: BASE,
    });
    expect(renamed).toMatchObject({ status: 200, body: { name: "Product roadmap", emoji: "🗺️" } });

    const retagged = await spaces.update({
      namespace_id: namespace.namespace_id,
      space_id: space.space_id,
      emoji: "🧭",
      actor: "agent",
      baseUrl: BASE,
    });
    expect(retagged).toMatchObject({ status: 200, body: { name: "Product roadmap", emoji: "🧭" } });
  });

  it("rejects a genuinely empty PATCH before touching the database", async () => {
    const result = await spaces.update({
      namespace_id: "00000000-0000-4000-8000-000000000001",
      space_id: "00000000-0000-4000-8000-000000000002",
      actor: "user",
      baseUrl: BASE,
    });
    expect(result).toMatchObject({ status: 422, body: { code: "empty_patch" } });
  });

  it("rolls back create_space {shared:true} if the link cannot be sealed", async () => {
    const namespace = await provision();
    const previousKey = process.env.STRATA_URL_KEY;
    process.env.STRATA_URL_KEY = "not-a-32-byte-key";
    resetUrlKey();
    try {
      await expect(spaces.create({
        namespace_id: namespace.namespace_id,
        slug: "atomic-share",
        name: "Atomic share",
        emoji: "⚛️",
        shared: true,
        baseUrl: BASE,
      })).rejects.toThrow("STRATA_URL_KEY must be 32 bytes of hex");
    } finally {
      if (previousKey === undefined) delete process.env.STRATA_URL_KEY;
      else process.env.STRATA_URL_KEY = previousKey;
      resetUrlKey();
    }

    const rows = await db.select({ id: schema.spaces.id }).from(schema.spaces).where(and(
      eq(schema.spaces.namespaceId, namespace.namespace_id),
      eq(schema.spaces.slug, "atomic-share"),
    ));
    expect(rows).toHaveLength(0);
  });
});
