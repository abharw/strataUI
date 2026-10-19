import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { DEFAULT_WRITER_SCOPES } from "@/server/credentials";
import { shareSpace } from "@/server/credentials/provision";
import { put } from "@/server/pages/handlers";
import { createCredentialNamespace } from "@/test/namespace";
import {
  buildHomeView,
  buildSpaceInventory,
  loadHomeForNamespace,
  loadSpace,
  ownsSpace,
  type InventorySpaceSource,
  type ListPage,
} from "./lists";

function at(day: number): Date {
  return new Date(`2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`);
}

function space(
  id: string,
  name: string,
  updatedAt: Date,
  extra: Partial<InventorySpaceSource> = {},
): InventorySpaceSource {
  return {
    id,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    name,
    emoji: "🗂️",
    updatedAt,
    shareUrl: null,
    sharedAt: null,
    ...extra,
  };
}

function page(
  id: string,
  parent: InventorySpaceSource,
  updatedAt: Date,
  extra: Partial<ListPage> = {},
): ListPage {
  return {
    id,
    title: `Page ${id}`,
    answer: `Current answer ${id}`,
    updatedAt,
    lastViewedAt: null,
    pinned: false,
    kind: "living",
    url: null,
    shared: false,
    exposureActor: "system",
    spaceId: parent.id,
    spaceSlug: parent.slug,
    spaceName: parent.name,
    writer: null,
    lastSummary: null,
    ...extra,
  };
}

describe("buildSpaceInventory", () => {
  it("includes empty Spaces and orders every Space by its latest activity", () => {
    const emptyNew = space("space-empty-new", "Empty new", at(27));
    const recent = space("space-recent", "Recent", at(20), {
      shareUrl: "https://strata.test/share/spk_shared",
      sharedAt: at(21),
    });
    const emptyOld = space("space-empty-old", "Empty old", at(25));
    const older = space("space-older", "Older", at(23));

    const inventory = buildSpaceInventory(
      [older, emptyOld, recent, emptyNew],
      [
        page("recent-shared", recent, at(26), { shared: true }),
        page("recent-private", recent, at(24)),
        page("older-private", older, at(24)),
      ],
    );

    expect(inventory.map((item) => item.name)).toEqual([
      "Empty new",
      "Recent",
      "Empty old",
      "Older",
    ]);
    expect(inventory[1]).toMatchObject({
      activePageCount: 2,
      sharedPageCount: 1,
      privatePageCount: 1,
      updatedAt: at(26),
      shareUrl: "https://strata.test/share/spk_shared",
      sharedAt: at(21),
    });
    expect(inventory[0]).toMatchObject({
      activePageCount: 0,
      sharedPageCount: 0,
      privatePageCount: 0,
      updatedAt: at(27),
    });
  });
});

describe("unseen Pages", () => {
  it("counts the Pages in a Space that moved after the owner last opened them", () => {
    const parent = space("space-one", "Field notes", at(20));
    const [inventory] = buildSpaceInventory([parent], [
      page("moved", parent, at(28), { unseen: true }),
      page("moved-too", parent, at(27), { unseen: true }),
      page("read", parent, at(24)),
    ]);

    expect(inventory).toMatchObject({ activePageCount: 3, unseenPageCount: 2 });
  });

  it("reads a Space whose rows carry no view state as nothing to report", () => {
    const parent = space("space-one", "Field notes", at(20));
    const [inventory] = buildSpaceInventory([parent], [page("read", parent, at(24))]);

    expect(inventory.unseenPageCount).toBe(0);
  });
});

describe("buildHomeView", () => {
  it("keeps every Space and Page because Home is the full private tree", () => {
    const spaces = Array.from({ length: 7 }, (_, index) => (
      space(`space-${index + 1}`, `Space ${index + 1}`, at(index + 1))
    ));
    const pages = spaces.map((parent, index) => page(`page-${index + 1}`, parent, at(index + 10)));

    const home = buildHomeView(spaces, pages);

    expect(home.title).toBe("Home");
    expect(home.spaces.map((item) => item.name)).toEqual([
      "Space 7",
      "Space 6",
      "Space 5",
      "Space 4",
      "Space 3",
      "Space 2",
      "Space 1",
    ]);
    expect(home.recentPages.map((item) => item.id)).toEqual([
      "page-7",
      "page-6",
      "page-5",
      "page-4",
      "page-3",
      "page-2",
      "page-1",
    ]);
    expect(home).toMatchObject({
      spaceCount: 7,
      pageCount: 7,
    });
  });
});

/** Pinned pages sort first in the owner's inventory. */
describe("pinning", () => {
  it("lifts a pinned Page above more recent ones in its Space", () => {
    const parent = space("space-one", "Field notes", at(20));
    const home = buildHomeView([parent], [
      page("newest", parent, at(28)),
      page("pinned", parent, at(21), { pinned: true }),
      page("middle", parent, at(24)),
    ]);

    expect(home.recentPages.map((item) => item.id)).toEqual(["pinned", "newest", "middle"]);
  });
});

/** Rows are serialized to the client, so they must carry no `pgk_` link. */
describe("the owner inventory", () => {
  const db = getDb();
  const namespaceIds: string[] = [];

  afterEach(async () => {
    if (namespaceIds.length > 0) {
      await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
    }
  });

  async function inventory() {
    const created = await createCredentialNamespace({ baseUrl: "https://strata.test" });
    namespaceIds.push(created.namespace_id);
    const ctx = {
      namespace_id: created.namespace_id,
      kind: "writer" as const,
      grant_id: created.grant_id,
      scope: DEFAULT_WRITER_SCOPES,
      baseUrl: "https://strata.test",
    };
    const written = await put(ctx, {
      space: { slug: "field-notes", name: "Field notes", emoji: "🧭" },
      slug: "packing-list",
      title: "Packing list",
      summary: "Created",
      spec: {
        root: "root",
        answer: { verdict: "Rain shell is still missing." },
        elements: {
          root: { type: "section", props: {}, children: ["note"] },
          note: { type: "callout", props: { text: "Rain shell is still missing." }, children: [] },
        },
      },
    });
    return {
      ctx,
      pageId: String(written.body.page_id),
      spaceId: String(written.body.space_id),
    };
  }

  it("carries no Page capability into Home", async () => {
    const { ctx } = await inventory();

    const home = await loadHomeForNamespace(ctx.namespace_id);
    expect(home.recentPages).toHaveLength(1);
    expect(home.recentPages[0].url).toBeNull();
    // The standing answer is read in SQL, without the document.
    expect(home.recentPages[0].answer).toBe("Rain shell is still missing.");
    expect(JSON.stringify(home)).not.toContain("pgk_");
  });

  it("drops a deleted Page out of Home rather than shelving it somewhere else", async () => {
    const { ctx, pageId } = await inventory();
    await db.delete(schema.pages).where(inArray(schema.pages.id, [pageId]));

    const home = await loadHomeForNamespace(ctx.namespace_id);
    expect(home.recentPages).toHaveLength(0);
    expect(home.pageCount).toBe(0);
    // Deleting a Page leaves its Space listed.
    expect(home.spaces).toHaveLength(1);
  });

  it("marks a Page nobody has opened yet, and clears the mark once it is read", async () => {
    const { ctx, pageId } = await inventory();

    const fresh = await loadHomeForNamespace(ctx.namespace_id);
    expect(fresh.recentPages[0].unseen).toBe(true);
    expect(fresh.spaces[0].unseenPageCount).toBe(1);

    // A minute ahead, so clock skew between process and database cannot decide the assertion.
    await db.update(schema.pages)
      .set({ lastViewedAt: new Date(Date.now() + 60_000) })
      .where(inArray(schema.pages.id, [pageId]));

    const seen = await loadHomeForNamespace(ctx.namespace_id);
    expect(seen.recentPages[0].unseen).toBe(false);
    expect(seen.spaces[0].unseenPageCount).toBe(0);
  });

  it("never tells a Space link's reader what the owner has or hasn't opened", async () => {
    const { ctx, pageId, spaceId } = await inventory();
    await db.update(schema.pages).set({ shared: true, sharedAt: new Date() })
      .where(eq(schema.pages.id, pageId));
    const { share_key: key } = await shareSpace(spaceId, { baseUrl: "https://strata.test" });

    const owner = await loadHomeForNamespace(ctx.namespace_id);
    expect(owner.recentPages[0].unseen).toBe(true);

    const reader = await loadSpace(key);
    if (!reader.ok) throw new Error("the shared Space did not load");
    expect(reader.value.pages.map((item) => item.unseen)).toEqual([false]);
  });

  it("resolves a canonical Space only inside its owner's namespace", async () => {
    const mine = await inventory();
    const theirs = await inventory();

    expect(await ownsSpace(mine.spaceId, mine.ctx.namespace_id)).toBe(true);
    expect(await ownsSpace(theirs.spaceId, mine.ctx.namespace_id)).toBe(false);
    expect(await ownsSpace("not-a-uuid", mine.ctx.namespace_id)).toBe(false);
    expect(await ownsSpace(crypto.randomUUID(), mine.ctx.namespace_id)).toBe(false);
  });
});
