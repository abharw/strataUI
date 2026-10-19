import { afterEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { get, put, rewriteSpec, summary, update } from "@/server/pages/handlers";
import { createCredentialNamespace } from "@/test/namespace";
import { generateSecret } from "@/server/credentials/keys";
import { rotateKey } from "@/server/credentials/provision";
import type { StrataSpec } from "@/page-content/schema";
import {
  assembleOwnedPage,
  assemblePage,
  assembleSharedPage,
  derivedNeighbours,
  hydratePageLinks,
  listChanges,
  listSessionOwnedChanges,
  ogPreview,
  ownedPageTitle,
  recordView,
  updateOwnedUser,
} from "./assemble";
import type { PageListRecord } from "./pages";
import { DEFAULT_WRITER_SCOPES } from "@/server/credentials";

const BASE = "https://strata.test";
/** A Space share key as a reader holds it; never parsed. */
const BUNDLE_KEY = `spk_${"c".repeat(43)}`;
const db = getDb();
const namespaceIds: string[] = [];

afterEach(async () => {
  if (namespaceIds.length > 0) {
    await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
  }
});

async function sharedPage() {
  const created = await createCredentialNamespace({ baseUrl: BASE });
  namespaceIds.push(created.namespace_id);
  const ctx = {
    namespace_id: created.namespace_id,
    kind: "writer" as const,
    grant_id: created.grant_id,
    scope: DEFAULT_WRITER_SCOPES,
    baseUrl: BASE,
  };
  const put_ = await put(ctx, {
    space: { slug: "shared-space", name: "Shared Space", emoji: "🤝" },
    slug: "member",
    title: "Member",
    summary: "Created",
    source_event: {
      id: "private-message-1",
      at: "2026-08-25T14:30:00Z",
      excerpt: "private prompt excerpt",
    },
    spec: { root: "root", answer: { verdict: "Spec under test." }, elements: { root: { type: "section", props: {}, children: ["note"] }, note: { type: "callout", props: { text: "Spec under test." }, children: [] } } },
  });
  const pageId = String(put_.body.page_id);
  const spaceId = String(put_.body.space_id);
  const pageKey = new URL(String(put_.body.url)).pathname.split("/").at(-1)!;
  expect(put_.body.owner_url).toBe(`${BASE}/pages/${pageId}`);
  await update({ namespace_id: ctx.namespace_id, page_id: pageId, shared: true, actor: "agent", baseUrl: BASE });
  return { ctx, pageId, pageKey, spaceId };
}

/** A page leaves a bundle only by being deleted. */
describe("a deleted page read through a bundle", () => {
  it("resolves while it exists and stops resolving once it is deleted", async () => {
    const { pageId, spaceId } = await sharedPage();
    const live = await assembleSharedPage(pageId, spaceId, null);
    expect(live.ok).toBe(true);

    await db.delete(schema.pages).where(inArray(schema.pages.id, [pageId]));

    const after = await assembleSharedPage(pageId, spaceId, null);
    expect(after.ok).toBe(false);
  });
});

describe("source event audience boundary", () => {
  it("keeps the owner's prompt excerpt out of direct and shared documents", async () => {
    const { ctx, pageId, pageKey, spaceId } = await sharedPage();

    const [owner, direct, shared] = await Promise.all([
      assembleOwnedPage(pageId, ctx.namespace_id),
      assemblePage(pageKey),
      assembleSharedPage(pageId, spaceId, null),
    ]);

    expect(owner.ok).toBe(true);
    expect(direct.ok).toBe(true);
    expect(shared.ok).toBe(true);
    if (!owner.ok || !direct.ok || !shared.ok) return;

    expect(owner.value.document.meta.source_event).toMatchObject({
      id: "private-message-1",
      excerpt: "private prompt excerpt",
    });
    expect(direct.value.document.meta).not.toHaveProperty("source_event");
    expect(shared.value.document.meta).not.toHaveProperty("source_event");
  });
});

describe("the share key is the whole address", () => {
  it("resolves a page from its key alone, with no id to pair it with", async () => {
    const { pageId, pageKey } = await sharedPage();

    const assembled = await assemblePage(pageKey);
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    // The key alone resolves the page.
    expect(assembled.value.pageId).toBe(pageId);
  });

  it("refuses a well-formed key that belongs to nobody, and any other kind", async () => {
    await sharedPage();
    for (const key of [generateSecret("page"), generateSecret("space"), "nonsense"]) {
      expect((await assemblePage(key)).ok).toBe(false);
    }
  });

  it("stops resolving the moment the page's link is re-minted", async () => {
    const { ctx, pageId, pageKey } = await sharedPage();

    const rotated = await rotateKey({
      scope: "page",
      id: pageId,
      baseUrl: BASE,
      namespaceId: ctx.namespace_id,
    });
    expect(rotated.url).toBe(`${BASE}/share/${rotated.key}`);

    // No grace window: a key is rotated because it leaked.
    expect((await assemblePage(pageKey)).ok).toBe(false);
    const reopened = await assemblePage(rotated.key);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.value.pageId).toBe(pageId);
  });

  it("will not re-mint a page belonging to another Strata", async () => {
    const mine = await sharedPage();
    const theirs = await sharedPage();

    await expect(rotateKey({
      scope: "page",
      id: theirs.pageId,
      baseUrl: BASE,
      namespaceId: mine.ctx.namespace_id,
    })).rejects.toThrow();
    expect((await assemblePage(theirs.pageKey)).ok).toBe(true);
  });
});

/** The row stores only the key, so the link is built per request origin. */
describe("the origin is the reader's, not the writer's", () => {
  it("builds every link against the origin the read arrived on", async () => {
    const { pageId, pageKey } = await sharedPage();
    const elsewhere = "https://read-from-here.test";

    const here = await assemblePage(pageKey, BASE);
    const there = await assemblePage(pageKey, elsewhere);
    expect(here.ok && there.ok).toBe(true);
    if (!here.ok || !there.ok) return;
    expect(here.value.document.meta.url).toBe(`${BASE}/share/${pageKey}`);
    expect(there.value.document.meta.url).toBe(`${elsewhere}/share/${pageKey}`);
    expect(here.value.document.meta).not.toHaveProperty("owner_url");
    expect(there.value.document.meta).not.toHaveProperty("owner_url");
    expect(there.value.pageId).toBe(pageId);
  });

  it("answers GET /v1/pages/:id at the origin the agent asked through", async () => {
    const { ctx, pageId, pageKey } = await sharedPage();
    const elsewhere = "https://read-from-here.test";

    const here = await get({ namespace_id: ctx.namespace_id, page_id: pageId, baseUrl: BASE });
    const there = await get({ namespace_id: ctx.namespace_id, page_id: pageId, baseUrl: elsewhere });
    expect(here.body.meta).toMatchObject({ owner_url: `${BASE}/pages/${pageId}`, url: `${BASE}/share/${pageKey}` });
    expect(there.body.meta).toMatchObject({ owner_url: `${elsewhere}/pages/${pageId}`, url: `${elsewhere}/share/${pageKey}` });
  });

  it("returns separate owner and recipient URLs on spec rewrite and metadata changes", async () => {
    const { ctx, pageId } = await sharedPage();
    const expected = `${BASE}/pages/${pageId}`;
    const rewritten = await rewriteSpec(ctx, pageId, {
      base_version: 1,
      summary: "Refreshed the page",
      spec: { root: "root", answer: { verdict: "Still under test." }, elements: { root: { type: "section", props: {}, children: ["note"] }, note: { type: "callout", props: { text: "Still under test." }, children: [] } } },
    });
    const renamed = await update({ namespace_id: ctx.namespace_id, page_id: pageId, title: "Renamed", actor: "agent", baseUrl: BASE });

    expect(rewritten.body.owner_url).toBe(expected);
    expect(renamed.body.owner_url).toBe(expected);
    expect(rewritten.body.url).toMatch(new RegExp(`^${BASE}/share/pgk_`));
  });

  it("stores no origin at all, so a renamed deployment strands nothing", async () => {
    const { pageId } = await sharedPage();
    const [row] = await db.select({ sealed: schema.pages.sealedReadKey })
      .from(schema.pages).where(inArray(schema.pages.id, [pageId]));
    expect(row.sealed).not.toContain("strata.test");
    expect(row.sealed).not.toContain("http");
    expect(row.sealed).not.toContain("pgk_");
  });
});

/** Link previews resolve by share key, not page id. */
describe("the link preview", () => {
  it("resolves by share key", async () => {
    const { pageKey } = await sharedPage();
    const preview = await ogPreview(pageKey);
    expect(preview.ok).toBe(true);
    if (preview.ok) expect(preview.title).toBe("Member");
  });

  it("refuses a page id, a Space key, and a key that belongs to nobody", async () => {
    const { pageId } = await sharedPage();
    for (const candidate of [pageId, generateSecret("space"), generateSecret("page"), "nonsense"]) {
      expect((await ogPreview(candidate)).ok).toBe(false);
    }
  });

  it("goes dark with the link it previews when the key is re-minted", async () => {
    const { ctx, pageId, pageKey } = await sharedPage();
    const rotated = await rotateKey({ scope: "page", id: pageId, baseUrl: BASE, namespaceId: ctx.namespace_id });
    expect((await ogPreview(pageKey)).ok).toBe(false);
    expect((await ogPreview(rotated.key)).ok).toBe(true);
  });
});

/** Bundle reads never carry a member page's own `pgk_` key, which would outlive a bundle rotation. */
describe("the page key in a document's meta", () => {
  it("travels only to a reader who is already holding it", async () => {
    const { ctx, pageId, pageKey, spaceId } = await sharedPage();

    const [owner, direct, bundle] = await Promise.all([
      assembleOwnedPage(pageId, ctx.namespace_id, BASE),
      assemblePage(pageKey, BASE),
      assembleSharedPage(pageId, spaceId, null, BASE),
    ]);
    if (!owner.ok || !direct.ok || !bundle.ok) throw new Error("expected all three to resolve");

    expect(direct.value.document.meta.url).toBe(`${BASE}/share/${pageKey}`);
    expect(owner.value.document.meta.url).toBe(`${BASE}/share/${pageKey}`);
    expect(bundle.value.document.meta.url).toBeNull();
  });
});

/** Unseen changes come from the write log, one entry per write. */
describe("unseen change history", () => {
  it("carries one entry per write since the owner last looked", async () => {
    const { ctx, pageId } = await sharedPage();
    const passes = [
      { summary: "Moved the departure to Friday", verdict: "Leaving Friday morning." },
      { summary: "Rewrote the plan", verdict: "Everything is booked." },
    ];
    for (const [index, pass] of passes.entries()) {
      const rewritten = await rewriteSpec(ctx, pageId, {
        base_version: index + 1,
        summary: pass.summary,
        spec: {
          root: "root",
          answer: { verdict: pass.verdict },
          elements: {
            root: { type: "section", props: {}, children: ["note"] },
            note: { type: "callout", props: { text: pass.verdict }, children: [] },
          },
        },
      });
      expect(rewritten.status).toBe(200);
    }

    const assembled = await assembleOwnedPage(pageId, ctx.namespace_id, BASE);
    if (!assembled.ok) throw new Error("expected the page to resolve");
    expect(assembled.value.recent.length).toBeGreaterThan(1);
    expect(assembled.value.recent.at(-1)?.summary).toBe("Rewrote the plan");
    // Oldest first, so the live store can append its own snapshots.
    const versions = assembled.value.recent.map((change) => change.version);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
  });
});

/** The "View steps" trail: opt-in per page, and a record of the run, not of what a reader missed. */
describe("the View steps trail", () => {
  const spec = (verdict: string) => ({
    root: "root",
    answer: { verdict },
    elements: {
      root: { type: "section", props: {}, children: ["note"] },
      note: { type: "callout", props: { text: verdict }, children: [] },
    },
  });

  it("is null on a page that never asked, and the whole log on one that did", async () => {
    const { ctx, pageId, pageKey } = await sharedPage();
    const plain = await assembleOwnedPage(pageId, ctx.namespace_id, BASE);
    if (!plain.ok) throw new Error("expected the page to resolve");
    expect(plain.value.steps).toBeNull();

    const started = await rewriteSpec(ctx, pageId, {
      base_version: 1,
      summary: "Started the run",
      spec: spec("Running."),
      live_steps: true,
      asset_refs: ["asset_shot", "asset_shot"],
    });
    expect(started.status).toBe(200);
    const next = await rewriteSpec(ctx, pageId, { base_version: 2, summary: "Second step", spec: spec("Still running.") });
    expect(next.status).toBe(200);

    // Nothing is unseen after the owner looks, but the trail is still there.
    await recordView(pageId, "home", true);
    const owned = await assembleOwnedPage(pageId, ctx.namespace_id, BASE);
    if (!owned.ok) throw new Error("expected the page to resolve");
    expect(owned.value.recent).toEqual([]);
    expect(owned.value.steps?.map((step) => step.version)).toEqual([1, 2, 3]);
    expect(owned.value.steps?.[1]).toMatchObject({ summary: "Started the run", assetRefs: ["asset_shot"] });
    expect(owned.value.steps?.[2]).not.toHaveProperty("assetRefs");

    const direct = await assemblePage(pageKey, BASE);
    if (!direct.ok) throw new Error("expected the page to resolve");
    expect(direct.value.steps?.length).toBe(3);

    const before = await summary({ namespace_id: ctx.namespace_id, page_id: pageId });
    expect(before.body.live_steps).toBe(true);
    const off = await update({ namespace_id: ctx.namespace_id, page_id: pageId, live_steps: false, actor: "agent", baseUrl: BASE });
    expect(off.status).toBe(200);
    expect(off.body.live_steps).toBe(false);
    const after = await summary({ namespace_id: ctx.namespace_id, page_id: pageId });
    expect(after.body.live_steps).toBe(false);
    const hidden = await assembleOwnedPage(pageId, ctx.namespace_id, BASE);
    if (!hidden.ok) throw new Error("expected the page to resolve");
    expect(hidden.value.steps).toBeNull();
  });

  it("rides a changed tick whole, and stays off a quiet one", async () => {
    const { ctx, pageId, pageKey } = await sharedPage();
    await update({ namespace_id: ctx.namespace_id, page_id: pageId, live_steps: true, actor: "agent", baseUrl: BASE });
    const written = await rewriteSpec(ctx, pageId, { base_version: 1, summary: "Step one", spec: spec("One.") });
    expect(written.status).toBe(200);

    const quiet = await listChanges(pageKey, 2);
    expect(quiet.body.snapshot).toBeNull();
    expect(quiet.body).not.toHaveProperty("steps");

    const changed = await listChanges(pageKey, 0);
    expect(changed.body.snapshot).not.toBeNull();
    expect((changed.body.steps as { version: number }[]).map((step) => step.version)).toEqual([1, 2]);

    const other = await sharedPage();
    const plain = await listChanges(other.pageKey, 0);
    expect(plain.body).not.toHaveProperty("steps");
  });
});

/** Quiet poll ticks must not cost a full page read. */
describe("the poll", () => {
  it("answers a quiet tick with no snapshot, and a changed one with the spec", async () => {
    const { ctx, pageId, pageKey } = await sharedPage();
    const current = await assemblePage(pageKey, BASE);
    if (!current.ok) throw new Error("expected the page to resolve");
    const version = current.value.document.version;

    const quiet = await listChanges(pageKey, version);
    expect(quiet.status).toBe(200);
    expect(quiet.body.snapshot).toBeNull();
    expect(quiet.body.version).toBe(version);

    const behind = await listChanges(pageKey, version - 1);
    expect(behind.status).toBe(200);
    expect(behind.body.snapshot).not.toBeNull();

    const owned = await listSessionOwnedChanges(pageId, ctx.namespace_id, version);
    expect(owned.status).toBe(200);
    expect(owned.body.snapshot).toBeNull();
    expect(owned.body.writer).not.toBeNull();
  });

  it("still carries answers on a quiet tick for a page that asks something", async () => {
    const created = await createCredentialNamespace({ baseUrl: BASE });
    namespaceIds.push(created.namespace_id);
    const ctx = {
      namespace_id: created.namespace_id,
      kind: "writer" as const,
      grant_id: created.grant_id,
      scope: DEFAULT_WRITER_SCOPES,
      baseUrl: BASE,
    };
    const written = await put(ctx, {
      space: { slug: "decisions", name: "Decisions", emoji: "🤝" },
      slug: "ship-it",
      title: "Ship it?",
      summary: "Asked",
      spec: {
        root: "root",
        answer: { verdict: "Waiting on you." },
        elements: {
          root: { type: "section", props: {}, children: ["ask"] },
          ask: {
            type: "approval",
            props: {
              id: "ship-it",
              question: "Ship the build?",
              options: [{ id: "yes", label: "Ship" }, { id: "no", label: "Hold" }],
            },
            children: [],
          },
        },
      },
    });
    const key = new URL(String(written.body.url)).pathname.split("/").at(-1)!;
    const assembled = await assemblePage(key, BASE);
    if (!assembled.ok) throw new Error("expected the page to resolve");

    // Taps do not move the version, so answers ride a quiet tick.
    const quiet = await listChanges(key, assembled.value.document.version);
    expect(quiet.status).toBe(200);
    expect(quiet.body.snapshot).toBeNull();
    expect(quiet.body.asks).toHaveLength(1);
  });

  it("carries the title, the pin and the owner's Space on a changed tick", async () => {
    const { ctx, pageId, pageKey } = await sharedPage();
    const current = await assemblePage(pageKey, BASE);
    if (!current.ok) throw new Error("expected the page to resolve");
    const version = current.value.document.version;

    // Title, pin and Space change without moving the version.
    const owned = await listSessionOwnedChanges(pageId, ctx.namespace_id, version - 1);
    expect(owned.status).toBe(200);
    expect(owned.body.title).toBe(current.value.document.meta.title);
    expect(owned.body.user).toEqual({ pinned: false });
    expect(owned.body.space).toEqual({
      name: current.value.spaceName,
      url: `/spaces/${current.value.spaceId}`,
    });

    const reader = await listChanges(pageKey, version - 1);
    expect(reader.status).toBe(200);
    expect(reader.body.title).toBe(current.value.document.meta.title);
    expect(reader.body.space).toBeUndefined();
  });

  it("carries a rename on the quiet tick that follows it", async () => {
    const { ctx, pageId, pageKey } = await sharedPage();
    const current = await assemblePage(pageKey, BASE);
    if (!current.ok) throw new Error("expected the page to resolve");
    const version = current.value.document.version;

    // A rename does not move the version, so the quiet tick must carry the title.
    const renamed = await update({
      namespace_id: ctx.namespace_id,
      page_id: pageId,
      title: "Member, renamed",
      actor: "user",
      baseUrl: BASE,
    });
    expect(renamed.status).toBe(200);

    const owned = await listSessionOwnedChanges(pageId, ctx.namespace_id, version);
    expect(owned.status).toBe(200);
    expect(owned.body.snapshot).toBeNull();
    expect(owned.body.version).toBe(version);
    expect(owned.body.title).toBe("Member, renamed");
    expect(owned.body.space).toEqual({
      name: current.value.spaceName,
      url: `/spaces/${current.value.spaceId}`,
    });

    // The reader gets the rename but not the owner's pin.
    const reader = await listChanges(pageKey, version);
    expect(reader.status).toBe(200);
    expect(reader.body.snapshot).toBeNull();
    expect(reader.body.title).toBe("Member, renamed");
    expect(reader.body.user).toEqual({ pinned: false });
    expect(reader.body.space).toBeUndefined();
  });

  it("carries a pin made elsewhere on the owner's next quiet tick", async () => {
    const { ctx, pageId, pageKey } = await sharedPage();
    const current = await assemblePage(pageKey, BASE);
    if (!current.ok) throw new Error("expected the page to resolve");
    const version = current.value.document.version;

    await updateOwnedUser(pageId, ctx.namespace_id, { pinned: true });

    const owned = await listSessionOwnedChanges(pageId, ctx.namespace_id, version);
    expect(owned.body.snapshot).toBeNull();
    expect(owned.body.user).toEqual({ pinned: true });

    const reader = await listChanges(pageKey, version);
    expect(reader.body.user).toEqual({ pinned: false });
  });

  it("refuses a since that is not a version", async () => {
    const { pageKey } = await sharedPage();
    expect((await listChanges(pageKey, Number.NaN)).status).toBe(422);
    expect((await listChanges(pageKey, -1)).status).toBe(422);
  });
});

/** The user patch has one field; an empty patch is refused. */
describe("the page surface's own patch", () => {
  it("refuses a patch that names nothing", async () => {
    const { ctx, pageId } = await sharedPage();
    const empty = await updateOwnedUser(pageId, ctx.namespace_id, {});
    expect(empty).toMatchObject({ status: 422, body: { code: "empty_patch" } });
    expect(String(empty.body.error)).toBe("Send pinned.");
  });

  it("keeps pinning as this page's own fact", async () => {
    const { ctx, pageId } = await sharedPage();
    const pinned = await updateOwnedUser(pageId, ctx.namespace_id, { pinned: true });
    expect(pinned.status).toBe(200);
    expect(pinned.body.user).toEqual({ pinned: true });
  });
});

describe("the owner's tab title", () => {
  it("resolves by page id inside the session's namespace, and nowhere else", async () => {
    const mine = await sharedPage();
    const theirs = await sharedPage();

    expect(await ownedPageTitle(mine.pageId, mine.ctx.namespace_id)).toBe("Member");
    expect(await ownedPageTitle(theirs.pageId, mine.ctx.namespace_id)).toBeNull();
    expect(await ownedPageTitle("not-a-uuid", mine.ctx.namespace_id)).toBeNull();
  });
});

/** View logging is a single statement, not a transaction per render. */
describe("logging a view", () => {
  it("appends one row, debounces the next, and marks seen only for the owner", async () => {
    const { pageId, pageKey } = await sharedPage();

    await recordView(pageId, "message", false);
    await recordView(pageId, "message", false);
    const logged = await db.select({ id: schema.viewLog.id })
      .from(schema.viewLog).where(inArray(schema.viewLog.pageId, [pageId]));
    expect(logged).toHaveLength(1);

    const [beforeSeen] = await db.select({ at: schema.pages.lastViewedAt })
      .from(schema.pages).where(inArray(schema.pages.id, [pageId]));
    expect(beforeSeen.at).toBeNull();

    await recordView(pageId, "home", true);
    const [afterSeen] = await db.select({ at: schema.pages.lastViewedAt })
      .from(schema.pages).where(inArray(schema.pages.id, [pageId]));
    expect(afterSeen.at).not.toBeNull();

    expect((await assemblePage(pageKey)).ok).toBe(true);
  });

  it("writes nothing for a page that is already gone", async () => {
    await expect(recordView("00000000-0000-4000-8000-000000000009", "direct", false)).resolves.toBeUndefined();
  });
});

/** The smallest spec `put` accepts: a root section with at least one child. */
function minimalSpec(verdict: string) {
  return {
    root: "root",
    answer: { verdict },
    elements: {
      root: { type: "section" as const, props: {}, children: ["note"] },
      note: { type: "callout" as const, props: { text: verdict }, children: [] },
    },
  };
}

/** A writer namespace and one target page, for the hydration and sequence tests. */
async function namespaceWithTarget(targetTitle: string) {
  const created = await createCredentialNamespace({ baseUrl: BASE });
  namespaceIds.push(created.namespace_id);
  const ctx = {
    namespace_id: created.namespace_id,
    kind: "writer" as const,
    grant_id: created.grant_id,
    scope: DEFAULT_WRITER_SCOPES,
    baseUrl: BASE,
  };
  const target = await put(ctx, {
    space: { slug: "cross-links", name: "Cross links", emoji: "🔗" },
    slug: targetTitle.toLowerCase().replace(/\s+/g, "-"),
    title: targetTitle,
    summary: "Created",
    spec: minimalSpec("Created for cross-link tests."),
  });
  return { ctx, targetId: String(target.body.page_id), spaceId: String(target.body.space_id) };
}

/** A spec that links to one target page from every place `link` is accepted. */
function specLinkingTo(targetId: string): StrataSpec {
  return {
    answer: { verdict: "under test" },
    root: "root",
    elements: {
      root: { type: "section", props: {}, children: ["stat-card", "notes", "steps", "history"] },
      "stat-card": { type: "card", props: { title: "Open it", link: { page: targetId } }, children: [] },
      notes: {
        type: "item-list",
        props: { items: [{ id: "row-1", title: "Go", link: { page: targetId } }] },
        children: [],
      },
      steps: {
        type: "checklist",
        props: { items: [{ id: "step-1", label: "Do it", link: { page: targetId } }] },
        children: [],
      },
      history: {
        type: "timeline",
        props: {
          order: "as-provided",
          events: [{ id: "event-1", title: "Went", link: { page: targetId } }],
        },
        children: [],
      },
    },
  };
}

describe("hydratePageLinks", () => {
  it("resolves card, item-list, checklist and timeline links for the owner in one batch", async () => {
    const { ctx, targetId } = await namespaceWithTarget("Week overview");
    const spec = specLinkingTo(targetId);

    const hydrated = await hydratePageLinks(spec, { kind: "owner-session", namespaceId: ctx.namespace_id });

    const expected = { page: targetId, href: `/pages/${targetId}` };
    expect(hydrated.elements["stat-card"]?.props.link).toEqual(expected);
    expect((hydrated.elements.notes?.props.items as { link: unknown }[])[0]?.link).toEqual(expected);
    expect((hydrated.elements.steps?.props.items as { link: unknown }[])[0]?.link).toEqual(expected);
    expect((hydrated.elements.history?.props.events as { link: unknown }[])[0]?.link).toEqual(expected);
  });

  it("never resolves a cross-page reference for a share-key reader", async () => {
    const { ctx, targetId } = await namespaceWithTarget("Week overview");
    const spec = specLinkingTo(targetId);

    const hydrated = await hydratePageLinks(spec, {
      kind: "direct",
      namespaceId: ctx.namespace_id,
      pageKey: "pgk_irrelevant",
    });

    // A page key holds one page, so cross-page links stay unresolved (no `href`).
    expect(hydrated.elements["stat-card"]?.props.link).toEqual({ page: targetId });
    expect((hydrated.elements.notes?.props.items as { link: unknown }[])[0]?.link).toEqual({ page: targetId });
    expect((hydrated.elements.steps?.props.items as { link: unknown }[])[0]?.link).toEqual({ page: targetId });
    expect((hydrated.elements.history?.props.events as { link: unknown }[])[0]?.link).toEqual({ page: targetId });
  });

  it("leaves a page id unresolved when its target is outside this namespace", async () => {
    const { ctx } = await namespaceWithTarget("Week overview");
    const { targetId: foreignId } = await namespaceWithTarget("Foreign page");
    const spec = specLinkingTo(foreignId);

    const hydrated = await hydratePageLinks(spec, { kind: "owner-session", namespaceId: ctx.namespace_id });

    expect(hydrated.elements["stat-card"]?.props.link).toEqual({ page: foreignId });
  });

  it("leaves a { url } link on a card untouched", async () => {
    const { ctx, targetId } = await namespaceWithTarget("Week overview");
    const spec = specLinkingTo(targetId);
    spec.elements["stat-card"] = {
      type: "card",
      props: { title: "Open it", link: { url: "https://example.com/reference" } },
      children: [],
    };

    const hydrated = await hydratePageLinks(spec, { kind: "owner-session", namespaceId: ctx.namespace_id });

    expect(hydrated.elements["stat-card"]?.props.link).toEqual({ url: "https://example.com/reference" });
  });

  it("resolves an in-bundle link to the bundle's own route for a Space share link", async () => {
    const { ctx, targetId, spaceId } = await namespaceWithTarget("Week overview");
    await update({ namespace_id: ctx.namespace_id, page_id: targetId, shared: true, actor: "agent", baseUrl: BASE });

    const hydrated = await hydratePageLinks(specLinkingTo(targetId), {
      kind: "bundle",
      namespaceId: ctx.namespace_id,
      spaceId,
      bundleKey: BUNDLE_KEY,
    });

    // Links go to the address the reader's key already covers, never /pages/:id or a `pgk_`.
    const expected = { page: targetId, href: `/share/${BUNDLE_KEY}/pages/${targetId}` };
    expect(hydrated.elements["stat-card"]?.props.link).toEqual(expected);
    expect((hydrated.elements.notes?.props.items as { link: unknown }[])[0]?.link).toEqual(expected);
    expect((hydrated.elements.steps?.props.items as { link: unknown }[])[0]?.link).toEqual(expected);
    expect((hydrated.elements.history?.props.events as { link: unknown }[])[0]?.link).toEqual(expected);
  });

  it("leaves a target this bundle does not expose unresolved", async () => {
    const { ctx, targetId, spaceId } = await namespaceWithTarget("Week overview");
    const elsewhere = await put(ctx, {
      space: { slug: "other-space", name: "Other space", emoji: "📦" },
      slug: "outside",
      title: "Outside",
      summary: "Created",
      spec: minimalSpec("Outside the bundle."),
    });
    const outsideId = String(elsewhere.body.page_id);
    await update({ namespace_id: ctx.namespace_id, page_id: outsideId, shared: true, actor: "agent", baseUrl: BASE });

    const context = {
      kind: "bundle" as const,
      namespaceId: ctx.namespace_id,
      spaceId,
      bundleKey: BUNDLE_KEY,
    };
    // Shared in a different Space, so this bundle key cannot resolve it.
    const foreign = await hydratePageLinks(specLinkingTo(outsideId), context);
    expect(foreign.elements["stat-card"]?.props.link).toEqual({ page: outsideId });
    // In the Space, but not currently exposed inside the bundle.
    const unexposed = await hydratePageLinks(specLinkingTo(targetId), context);
    expect(unexposed.elements["stat-card"]?.props.link).toEqual({ page: targetId });
  });
});

describe("the assembled page's sequence", () => {
  async function pageWithSequence() {
    const created = await createCredentialNamespace({ baseUrl: BASE });
    namespaceIds.push(created.namespace_id);
    const ctx = {
      namespace_id: created.namespace_id,
      kind: "writer" as const,
      grant_id: created.grant_id,
      scope: DEFAULT_WRITER_SCOPES,
      baseUrl: BASE,
    };
    const previous = await put(ctx, {
      space: { slug: "cross-links", name: "Cross links", emoji: "🔗" },
      slug: "week-1",
      title: "Week 1",
      summary: "Created",
      spec: minimalSpec("Week 1."),
    });
    const next = await put(ctx, {
      space: { slug: "cross-links", name: "Cross links", emoji: "🔗" },
      slug: "week-3",
      title: "Week 3",
      summary: "Created",
      spec: minimalSpec("Week 3."),
    });
    const previousId = String(previous.body.page_id);
    const nextId = String(next.body.page_id);

    const written = await put(ctx, {
      space: { slug: "cross-links", name: "Cross links", emoji: "🔗" },
      slug: "week-2",
      title: "Week 2",
      summary: "Created",
      spec: {
        ...minimalSpec("Week 2."),
        sequence: {
          previous: { page: previousId },
          next: { page: nextId },
          up: { url: "https://example.com/plan" },
        },
      },
    });
    return {
      ctx,
      pageId: String(written.body.page_id),
      spaceId: String(written.body.space_id),
      pageKey: new URL(String(written.body.url)).pathname.split("/").at(-1)!,
      previousId,
      nextId,
    };
  }

  it("resolves previous, next and up for the owner, titled from each target page", async () => {
    const { ctx, pageId, previousId, nextId } = await pageWithSequence();

    const owner = await assembleOwnedPage(pageId, ctx.namespace_id);

    expect(owner.ok).toBe(true);
    if (!owner.ok) return;
    expect(owner.value.sequence).toEqual({
      previous: { href: `/pages/${previousId}`, title: "Week 1" },
      next: { href: `/pages/${nextId}`, title: "Week 3" },
      up: { href: "https://example.com/plan", title: "https://example.com/plan" },
    });
  });

  it("omits both page-type entries for a share-key reader, while the external one still resolves", async () => {
    const { pageKey } = await pageWithSequence();

    const direct = await assemblePage(pageKey);

    expect(direct.ok).toBe(true);
    if (!direct.ok) return;
    expect(direct.value.sequence).toEqual({
      up: { href: "https://example.com/plan", title: "https://example.com/plan" },
    });
  });

  it("resolves in-bundle entries to bundle routes for a Space share link", async () => {
    const { ctx, pageId, spaceId, previousId, nextId } = await pageWithSequence();
    for (const id of [pageId, previousId, nextId]) {
      await update({ namespace_id: ctx.namespace_id, page_id: id, shared: true, actor: "agent", baseUrl: BASE });
    }

    const bundle = await assembleSharedPage(pageId, spaceId, BUNDLE_KEY);

    expect(bundle.ok).toBe(true);
    if (!bundle.ok) return;
    expect(bundle.value.sequence).toEqual({
      previous: { href: `/share/${BUNDLE_KEY}/pages/${previousId}`, title: "Week 1" },
      next: { href: `/share/${BUNDLE_KEY}/pages/${nextId}`, title: "Week 3" },
      up: { href: "https://example.com/plan", title: "https://example.com/plan" },
    });
  });

  it("omits an entry whose target the bundle does not expose", async () => {
    const { ctx, pageId, spaceId, previousId } = await pageWithSequence();
    // `next` is in the Space but not shared, so the arrow is absent.
    for (const id of [pageId, previousId]) {
      await update({ namespace_id: ctx.namespace_id, page_id: id, shared: true, actor: "agent", baseUrl: BASE });
    }

    const bundle = await assembleSharedPage(pageId, spaceId, BUNDLE_KEY);

    expect(bundle.ok).toBe(true);
    if (!bundle.ok) return;
    expect(bundle.value.sequence).toEqual({
      previous: { href: `/share/${BUNDLE_KEY}/pages/${previousId}`, title: "Week 1" },
      up: { href: "https://example.com/plan", title: "https://example.com/plan" },
    });
  });

  async function planWithChildren(positions: readonly number[], spaceSlug = "cross-links") {
    const created = await createCredentialNamespace({ baseUrl: BASE });
    namespaceIds.push(created.namespace_id);
    const ctx = {
      namespace_id: created.namespace_id,
      kind: "writer" as const,
      grant_id: created.grant_id,
      scope: DEFAULT_WRITER_SCOPES,
      baseUrl: BASE,
    };
    const space = { slug: spaceSlug, name: "Plan", emoji: "🏁" };
    const plan = await put(ctx, { space, slug: "plan", title: "The plan", summary: "Created", spec: minimalSpec("Plan.") });
    const planId = String(plan.body.page_id);
    const children: string[] = [];
    const keys: string[] = [];
    // Inserted out of order so creation order cannot decide the chain.
    for (const position of positions) {
      const child = await put(ctx, {
        space,
        slug: `week-${position}`,
        title: `Week ${position}`,
        summary: "Created",
        spec: { ...minimalSpec(`Week ${position}.`), sequence: { up: { page: planId }, position } },
      });
      children.push(String(child.body.page_id));
      keys.push(new URL(String(child.body.url)).pathname.split("/").at(-1)!);
    }
    return { ctx, planId, spaceId: String(plan.body.space_id), children, keys, positions };
  }

  it("derives previous and next from the siblings that share the page's up, by position", async () => {
    const { ctx, planId, children, positions } = await planWithChildren([3, 1, 2]);
    const idAt = (position: number) => children[positions.indexOf(position)];

    const middle = await assembleOwnedPage(idAt(2), ctx.namespace_id);
    expect(middle.ok).toBe(true);
    if (!middle.ok) return;
    expect(middle.value.sequence).toEqual({
      previous: { href: `/pages/${idAt(1)}`, title: "Week 1" },
      next: { href: `/pages/${idAt(3)}`, title: "Week 3" },
      up: { href: `/pages/${planId}`, title: "The plan" },
    });

    const first = await assembleOwnedPage(idAt(1), ctx.namespace_id);
    expect(first.ok && first.value.sequence).toEqual({
      next: { href: `/pages/${idAt(2)}`, title: "Week 2" },
      up: { href: `/pages/${planId}`, title: "The plan" },
    });

    const last = await assembleOwnedPage(idAt(3), ctx.namespace_id);
    expect(last.ok && last.value.sequence).toEqual({
      previous: { href: `/pages/${idAt(2)}`, title: "Week 2" },
      up: { href: `/pages/${planId}`, title: "The plan" },
    });
  });

  it("lets a written arrow win over a derived one, and skips a gap in the positions", async () => {
    const { ctx, planId, children, positions } = await planWithChildren([1, 2, 5]);
    const idAt = (position: number) => children[positions.indexOf(position)];
    const elsewhere = await put(ctx, {
      space: { slug: "cross-links", name: "Plan", emoji: "🏁" },
      slug: "appendix",
      title: "Appendix",
      summary: "Created",
      spec: {
        ...minimalSpec("Appendix."),
        sequence: { up: { page: planId }, position: 2, next: { url: "https://example.com/after" } },
      },
    });
    const appendixId = String(elsewhere.body.page_id);

    const fifth = await assembleOwnedPage(idAt(5), ctx.namespace_id);
    expect(fifth.ok && fifth.value.sequence?.previous?.title).toBeDefined();
    expect(fifth.ok && fifth.value.sequence?.next).toBeUndefined();

    const appendix = await assembleOwnedPage(appendixId, ctx.namespace_id);
    expect(appendix.ok && appendix.value.sequence).toEqual({
      previous: { href: `/pages/${idAt(1)}`, title: "Week 1" },
      next: { href: "https://example.com/after", title: "https://example.com/after" },
      up: { href: `/pages/${planId}`, title: "The plan" },
    });
  });

  it("steps a bundle reader past a sibling the bundle does not expose, to the nearest it does", async () => {
    const { ctx, planId, spaceId, children, keys, positions } = await planWithChildren([1, 2, 3, 4]);
    const idAt = (position: number) => children[positions.indexOf(position)];
    // Week 3 is private, so the reader steps from week 2 to week 4 and back.
    for (const id of [planId, idAt(1), idAt(2), idAt(4)]) {
      await update({ namespace_id: ctx.namespace_id, page_id: id, shared: true, actor: "agent", baseUrl: BASE });
    }

    const bundle = await assembleSharedPage(idAt(2), spaceId, BUNDLE_KEY);
    expect(bundle.ok && bundle.value.sequence).toEqual({
      previous: { href: `/share/${BUNDLE_KEY}/pages/${idAt(1)}`, title: "Week 1" },
      next: { href: `/share/${BUNDLE_KEY}/pages/${idAt(4)}`, title: "Week 4" },
      up: { href: `/share/${BUNDLE_KEY}/pages/${planId}`, title: "The plan" },
    });
    const fourth = await assembleSharedPage(idAt(4), spaceId, BUNDLE_KEY);
    expect(fourth.ok && fourth.value.sequence?.previous).toEqual({ href: `/share/${BUNDLE_KEY}/pages/${idAt(2)}`, title: "Week 2" });

    // A page key reads no siblings.
    const direct = await assemblePage(keys[positions.indexOf(2)]);
    expect(direct.ok && direct.value.sequence).toBeNull();
  });

  it("orders derived neighbours by position, then creation, then id", () => {
    const page = (id: string, sequencePosition: number | null, createdAt: number) =>
      ({ id, sequencePosition, createdAt: new Date(createdAt), title: id }) as unknown as PageListRecord;
    const siblings = [page("c", 3, 3), page("a1", 1, 2), page("a0", 1, 1), page("none", null, 0), page("e", 5, 5)];

    expect(derivedNeighbours(siblings, 2)).toEqual({ previous: [siblings[1], siblings[2]], next: [siblings[0], siblings[4]] });
    expect(derivedNeighbours(siblings, 1)).toEqual({ previous: [], next: [siblings[0], siblings[4]] });
    expect(derivedNeighbours(siblings, 4)).toEqual({ previous: [siblings[0], siblings[1], siblings[2]], next: [siblings[4]] });
    expect(derivedNeighbours(siblings, 9)).toEqual({ previous: [siblings[4], siblings[0], siblings[1], siblings[2]], next: [] });
    expect(derivedNeighbours([], 2)).toEqual({ previous: [], next: [] });
  });

  it("is null when the spec carries no sequence at all", async () => {
    const { ctx, pageId, spaceId } = await sharedPage();

    const [owner, shared] = await Promise.all([
      assembleOwnedPage(pageId, ctx.namespace_id),
      assembleSharedPage(pageId, spaceId, null),
    ]);

    expect(owner.ok && owner.value.sequence).toBeNull();
    expect(shared.ok && shared.value.sequence).toBeNull();
  });
});
