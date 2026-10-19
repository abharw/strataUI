import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { patchSpec, put, rewriteSpec, update } from "@/server/pages/handlers";
import { remove as removeSpace } from "@/server/spaces/handlers";
import { createCredentialNamespace } from "@/test/namespace";
import type { StrataSpec } from "@/page-content/schema";
import { triathlon } from "@/page-content/document/fixtures";
import { DEFAULT_WRITER_SCOPES } from "@/server/credentials";

const BASE = "https://strata.test";
const db = getDb();
const namespaceIds: string[] = [];
afterEach(async () => {
  if (namespaceIds.length > 0) {
    await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
  }
});

function flatSpec(count: number, prefix = "item"): StrataSpec {
  const children = Array.from({ length: count - 1 }, (_, index) => `${prefix}-${index + 1}`);
  const elements: StrataSpec["elements"] = { root: { type: "section", props: {}, children } };
  for (const id of children) {
    elements[id] = { type: "callout", props: { text: id }, children: [] };
  }
  return { root: "root", answer: { verdict: "Spec under test." }, elements };
}

async function provision() {
  const created = await createCredentialNamespace({ baseUrl: BASE });
  namespaceIds.push(created.namespace_id);
  return {
    ctx: {
      namespace_id: created.namespace_id,
      kind: "writer" as const,
      grant_id: created.grant_id,
      scope: DEFAULT_WRITER_SCOPES,
      baseUrl: BASE,
    },
    created,
  };
}

async function createPage(ctx: Awaited<ReturnType<typeof provision>>["ctx"], spec: StrataSpec) {
  const result = await put(ctx, {
    space: { slug: "guard", name: "Guard", emoji: "🛡️" },
    slug: "guarded-page",
    title: "Guarded page",
    summary: "Created page",
    spec,
  });
  expect(result.status).toBe(201);
  return result.body.page_id as string;
}

describe("the pre-persistence authoring quality gate", () => {
  it("refuses a long name when put_page would create a new Space", async () => {
    const { ctx } = await provision();
    const result = await put(ctx, {
      space: { slug: "overlong", name: "S".repeat(37), emoji: "🛡️" },
      slug: "new-page",
      title: "New page",
      summary: "Created the page",
      spec: flatSpec(2),
    });

    expect(result).toMatchObject({
      status: 422,
      body: { code: "invalid_request", path: "/space/name", next: ["get_guide", "put_page"] },
    });
    expect(await db.select({ id: schema.spaces.id }).from(schema.spaces).where(eq(schema.spaces.namespaceId, ctx.namespace_id)))
      .toHaveLength(0);
  });

  it("rejects markup in an implicitly created Space name before persisting it or the Page", async () => {
    const { ctx } = await provision();
    const result = await put(ctx, {
      space: { slug: "markup-space", name: "<script>Trip</script>", emoji: "🛡️" },
      slug: "flights",
      title: "Flights",
      summary: "Created the flight tracker",
      spec: flatSpec(2),
    });

    expect(result).toMatchObject({
      status: 422,
      body: { code: "literal_markup", path: "/space/name", next: ["put_page"] },
    });
    expect(await db.select({ id: schema.spaces.id }).from(schema.spaces).where(eq(schema.spaces.namespaceId, ctx.namespace_id)))
      .toHaveLength(0);
    expect(await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.namespaceId, ctx.namespace_id)))
      .toHaveLength(0);
  });

  it("rejects markup in the model-authored title before create persists anything", async () => {
    const { ctx } = await provision();
    const result = await put(ctx, {
      space: { slug: "quality-title", name: "Quality title", emoji: "🛡️" },
      slug: "script-title",
      title: "<script>Roadmap</script>",
      summary: "Created the roadmap",
      spec: flatSpec(2),
    });

    expect(result).toMatchObject({
      status: 422,
      body: { code: "literal_markup", path: "/title", next: ["put_page"] },
    });
    expect(await db.select({ id: schema.spaces.id }).from(schema.spaces).where(eq(schema.spaces.namespaceId, ctx.namespace_id)))
      .toHaveLength(0);
    expect(await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.namespaceId, ctx.namespace_id)))
      .toHaveLength(0);
  });

  it("rejects literal markup before create can persist a Space, Page, or write", async () => {
    const { ctx } = await provision();
    const spec = flatSpec(2);
    spec.elements["item-1"].props.text = "The gate is **blocked**.";

    const result = await put(ctx, {
      space: { slug: "quality", name: "Quality", emoji: "🛡️" },
      slug: "literal-markup",
      title: "Literal markup",
      summary: "Added the gate status",
      spec,
    });

    expect(result).toMatchObject({
      status: 422,
      body: { code: "literal_markup", path: "/spec/elements/item-1/props/text", next: ["put_page"] },
    });
    expect(await db.select({ id: schema.spaces.id }).from(schema.spaces).where(eq(schema.spaces.namespaceId, ctx.namespace_id))).toHaveLength(0);
    expect(await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.namespaceId, ctx.namespace_id))).toHaveLength(0);
    expect(await db.select({ id: schema.pageWrites.id }).from(schema.pageWrites).where(eq(schema.pageWrites.grantId, ctx.grant_id))).toHaveLength(0);
  });

  it("rejects a verbatim summary/body patch without changing the page or write log", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(3));
    const repeated = "The lease is signed and the keys are ready.";

    const result = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: repeated,
      ops: [{ op: "replace", path: "/elements/item-1/props/text", value: repeated }],
    });

    expect(result).toMatchObject({
      status: 422,
      body: { code: "summary_body_duplication", path: "/summary", next: ["patch_page_spec"] },
    });
    const [row] = await db
      .select({ version: schema.pages.version, document: schema.pages.document })
      .from(schema.pages)
      .where(eq(schema.pages.id, pageId));
    expect(row.version).toBe(1);
    expect((row.document).elements["item-1"]?.props.text).toBe("item-1");
    expect(await db.select({ id: schema.pageWrites.id }).from(schema.pageWrites).where(eq(schema.pageWrites.pageId, pageId)))
      .toHaveLength(1);
  });

  it("returns a direct patch-document pointer for markup in approval context", async () => {
    const { ctx } = await provision();
    const spec: StrataSpec = {
      root: "root",
      answer: { verdict: "The shipping call is open." },
      elements: {
        root: { type: "section", props: {}, children: ["call"] },
        call: {
          type: "approval",
          props: {
            id: "ship",
            question: "Ship it?",
            context: "The release candidate is green.",
            options: [{ id: "yes", label: "Ship" }, { id: "no", label: "Hold" }],
          },
          children: [],
        },
      },
    };
    const pageId = await createPage(ctx, spec);

    const result = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "Added the final caution",
      ops: [{ op: "replace", path: "/elements/call/props/context", value: "<script>alert('x')</script>" }],
    });

    expect(result).toMatchObject({
      status: 422,
      body: { code: "literal_markup", path: "/elements/call/props/context", next: ["patch_page_spec"] },
    });
    const [row] = await db
      .select({ version: schema.pages.version, document: schema.pages.document })
      .from(schema.pages)
      .where(eq(schema.pages.id, pageId));
    expect(row.version).toBe(1);
    expect((row.document).elements.call?.props.context).toBe("The release candidate is green.");
    expect(await db.select({ id: schema.pageWrites.id }).from(schema.pageWrites).where(eq(schema.pageWrites.pageId, pageId)))
      .toHaveLength(1);
  });

  it("keeps a patch title at the request path and does not persist it", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(3));
    const result = await patchSpec(ctx, pageId, {
      base_version: 1,
      title: "<script>Renamed</script>",
      summary: "Renamed the page",
      ops: [{ op: "replace", path: "/elements/item-1/props/text", value: "changed" }],
    });

    expect(result).toMatchObject({
      status: 422,
      body: { code: "literal_markup", path: "/title", next: ["patch_page_spec"] },
    });
    const [row] = await db
      .select({ title: schema.pages.title, version: schema.pages.version })
      .from(schema.pages)
      .where(eq(schema.pages.id, pageId));
    expect(row).toMatchObject({ title: "Guarded page", version: 1 });
  });

  it("points a root-level oversized patch after-image at /elements and stores nothing", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(3));
    const result = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "Expanded the status",
      ops: [{ op: "replace", path: "/elements/item-1/props/text", value: "x".repeat(1_600) }],
    });

    expect(result).toMatchObject({
      status: 422,
      body: { code: "invalid_spec", path: "/elements", next: ["get_guide", "get_manifest", "patch_page_spec"] },
    });
    const [row] = await db
      .select({ version: schema.pages.version, document: schema.pages.document })
      .from(schema.pages)
      .where(eq(schema.pages.id, pageId));
    expect(row.version).toBe(1);
    expect((row.document).elements["item-1"]?.props.text).toBe("item-1");
  });

  it("rejects a second quote on rewrite without persisting the after-image", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(3));
    const replacement: StrataSpec = {
      root: "root",
      answer: { verdict: "One voice should carry the point." },
      elements: {
        root: { type: "section", props: {}, children: ["status", "first", "second"] },
        status: { type: "metric", props: { label: "Status", value: "Ready" }, children: [] },
        first: { type: "quote", props: { text: "Keep the page quiet.", attribution: "A" }, children: [] },
        second: { type: "quote", props: { text: "Make the answer obvious.", attribution: "B" }, children: [] },
      },
    };

    const result = await rewriteSpec(ctx, pageId, {
      base_version: 1,
      summary: "Added two perspectives",
      spec: replacement,
    });

    expect(result).toMatchObject({
      status: 422,
      body: { code: "multiple_quotes", path: "/spec/elements/second", next: ["rewrite_page_spec"] },
    });
    const [row] = await db
      .select({ version: schema.pages.version, document: schema.pages.document })
      .from(schema.pages)
      .where(eq(schema.pages.id, pageId));
    expect(row.version).toBe(1);
    expect(Object.values((row.document).elements).filter(({ type }) => type === "quote")).toHaveLength(0);
    expect(await db.select({ id: schema.pageWrites.id }).from(schema.pageWrites).where(eq(schema.pageWrites.pageId, pageId)))
      .toHaveLength(1);
  });

  it("stores coherent checklist peers in a carousel without a repetition warning", async () => {
    const { ctx } = await provision();
    const result = await put(ctx, {
      space: { slug: "training", name: "Training", emoji: "🏋️" },
      slug: "triathlon-plan",
      title: "Triathlon plan",
      summary: "Created the training plan",
      spec: triathlon.spec,
    });

    expect(result.status).toBe(201);
    expect(result.body.warnings).toEqual([]);
    expect(await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.id, result.body.page_id as string)))
      .toHaveLength(1);
  });
});

describe("page writes", () => {
  it("keeps quota usage after a page is deleted", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(4));
    await db.delete(schema.pages).where(eq(schema.pages.id, pageId));
    const [usage] = await db
      .select({ writes: schema.namespaceUsage.pageWrites })
      .from(schema.namespaceUsage)
      .where(eq(schema.namespaceUsage.namespaceId, ctx.namespace_id));
    expect(usage?.writes).toBe(1);
  });

  it("cannot patch a page the person deleted: there is no row to write to", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(4));
    await db.delete(schema.pages).where(eq(schema.pages.id, pageId));

    const patched = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "Tried to keep writing",
      ops: [{ op: "replace", path: "/elements/item-1/props/text", value: "changed" }],
    });
    expect(patched).toMatchObject({ status: 404, body: { code: "page_not_found" } });
  });

  it("refuses ops the patcher would silently swallow", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(4));

    const removeMissing = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "Remove something that is not there",
      ops: [{ op: "remove", path: "/elements/typo-id" }],
    });
    expect(removeMissing).toMatchObject({ status: 422, body: { code: "invalid_ops" } });

    const replaceMissing = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "Replace inside an element that is not there",
      ops: [{ op: "replace", path: "/elements/gone/props/text", value: "x" }],
    });
    expect(replaceMissing).toMatchObject({ status: 422, body: { code: "invalid_ops" } });

    const [row] = await db.select({ version: schema.pages.version }).from(schema.pages).where(eq(schema.pages.id, pageId));
    expect(row?.version).toBe(1);
  });

  it("refuses a reorder past the end of the list the move itself shortens", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(5));

    const pastEnd = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "Move the first item past the end",
      ops: [{ op: "move", from: "/elements/root/children/0", path: "/elements/root/children/4" }],
    });
    // Measured after the removal: four items become three.
    expect(pastEnd).toMatchObject({ status: 422, body: { code: "invalid_ops" } });
    expect(String(pastEnd.body.error)).toContain("once the moved item is taken out of it");

    const toTheEnd = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "Move the first item to the end",
      ops: [{ op: "move", from: "/elements/root/children/0", path: "/elements/root/children/3" }],
    });
    expect(toTheEnd.status).toBe(200);
    const [row] = await db.select({ document: schema.pages.document }).from(schema.pages).where(eq(schema.pages.id, pageId));
    expect((row.document).elements.root?.children).toEqual(["item-2", "item-3", "item-4", "item-1"]);
  });

  it("copies an element by value, so editing the copy leaves the original alone", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(3));

    const copied = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "Copy the first item and rewrite the copy",
      ops: [
        { op: "copy", from: "/elements/item-1", path: "/elements/item-copy" },
        { op: "add", path: "/elements/root/children/-", value: "item-copy" },
        { op: "replace", path: "/elements/item-copy/props/text", value: "rewritten" },
      ],
    });
    expect(copied.status).toBe(200);

    const [row] = await db.select({ document: schema.pages.document }).from(schema.pages).where(eq(schema.pages.id, pageId));
    const elements = row?.document.elements as Record<string, { props: { text?: string } }>;
    expect(elements["item-copy"]?.props.text).toBe("rewritten");
    expect(elements["item-1"]?.props.text).toBe("item-1");
  });

  it("refuses to replace an existing page through put", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(4));
    const replaced = await put(ctx, {
      page_id: pageId,
      summary: "Replaced page",
      spec: flatSpec(3),
    });
    expect(replaced).toMatchObject({ status: 422, body: { code: "put_is_create_only" } });
  });

  it("applies operations and leaves unnamed elements alone", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(4));

    const patched = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "Renamed the first item",
      ops: [{ op: "replace", path: "/elements/item-1/props/text", value: "changed" }],
    });
    expect(patched.status).toBe(200);
    expect(patched.body.version).toBe(2);

    const [row] = await db.select({ document: schema.pages.document }).from(schema.pages).where(eq(schema.pages.id, pageId));
    const spec = row.document;
    expect(spec.elements["item-1"]?.props).toMatchObject({ text: "changed" });
    expect(spec.elements["item-2"]?.props).toMatchObject({ text: "item-2" });
  });

  it("rejects a stale base_version and a patch that breaks the spec", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(4));

    const stale = await patchSpec(ctx, pageId, {
      base_version: 0,
      summary: "Stale write",
      ops: [{ op: "remove", path: "/elements/item-1" }],
    });
    expect(stale).toMatchObject({ status: 409, body: { code: "version_conflict", valid: [1] } });

    const broken = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "Unknown component",
      ops: [{ op: "add", path: "/elements/item-9", value: { type: "not-a-component", props: {}, children: [] } }],
    });
    expect(broken).toMatchObject({ status: 422, body: { code: "invalid_spec" } });
    expect(String(broken.body.path)).toMatch(/^\/elements\//);
    expect(broken.body.next).toEqual(["get_guide", "get_manifest", "patch_page_spec"]);
  });

  it("applies one concurrent add and refuses its stale replay", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(3));
    const request = {
      base_version: 1,
      summary: "Added the note",
      ops: [
        { op: "add" as const, path: "/elements/note", value: { type: "callout", props: { text: "Added once." }, children: [] } },
        { op: "add" as const, path: "/elements/root/children/-", value: "note" },
      ],
    };

    const concurrent = await Promise.all([
      patchSpec(ctx, pageId, request),
      patchSpec(ctx, pageId, request),
    ]);
    expect(concurrent.map((result) => result.status).sort()).toEqual([200, 409]);

    const [afterRace] = await db
      .select({ version: schema.pages.version, document: schema.pages.document })
      .from(schema.pages)
      .where(eq(schema.pages.id, pageId));
    expect(afterRace.version).toBe(2);
    expect(afterRace.document.elements.root.children.filter((id) => id === "note")).toHaveLength(1);
    expect(afterRace.document.elements.note?.props.text).toBe("Added once.");

    const replay = await patchSpec(ctx, pageId, request);
    expect(replay).toMatchObject({ status: 409, body: { code: "version_conflict", valid: [2] } });
    const writes = await db
      .select({ version: schema.pageWrites.version })
      .from(schema.pageWrites)
      .where(eq(schema.pageWrites.pageId, pageId));
    expect(writes).toHaveLength(2);
  });
});

describe("deleting a Space", () => {
  it("takes its Pages with it when the caller says so", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(4));
    const [page] = await db.select({ spaceId: schema.pages.spaceId }).from(schema.pages).where(eq(schema.pages.id, pageId));

    const deleted = await removeSpace({ namespace_id: ctx.namespace_id, space_id: page.spaceId, with_pages: true });
    expect(deleted.status).toBe(200);
    const rows = await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.id, pageId));
    expect(rows).toHaveLength(0);
  });
});

describe("the patch grammar's two forbidden addresses", () => {
  it("refuses any operation that addresses /elements, and says where to go instead", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(4));
    for (const op of [
      { op: "replace", path: "/elements", value: {} },
      { op: "remove", path: "/elements" },
      { op: "add", path: "/elements", value: {} },
    ]) {
      const result = await patchSpec(ctx, pageId, { base_version: 1, summary: "Whole document", ops: [op] });
      expect(result.status).toBe(422);
      expect(String(result.body.error)).toContain("/v1/pages/{id}/spec");
    }
  });

  it("allows only replace at /root", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(4));
    const removed = await patchSpec(ctx, pageId, { base_version: 1, summary: "Drop the root", ops: [{ op: "remove", path: "/root" }] });
    expect(removed.status).toBe(422);
    const replaced = await patchSpec(ctx, pageId, { base_version: 1, summary: "Same root", ops: [{ op: "replace", path: "/root", value: "root" }] });
    expect(replaced.status).toBe(200);
  });
});

describe("patching /sequence", () => {
  it("adds, edits and drops the spec root's sequence through the documented edit path", async () => {
    const { ctx } = await provision();
    const week = await put(ctx, {
      space: { slug: "guard", name: "Guard", emoji: "🛡️" },
      slug: "the-week",
      title: "The week",
      summary: "Created page",
      spec: flatSpec(3, "sibling"),
    });
    expect(week.status).toBe(201);
    const sibling = week.body.page_id as string;
    const pageId = await createPage(ctx, flatSpec(4));

    const added = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "Place the page in its week",
      ops: [{ op: "add", path: "/sequence", value: { up: { page: sibling } } }],
    });
    expect(added.status).toBe(200);

    const extended = await patchSpec(ctx, pageId, {
      base_version: 2,
      summary: "Point at the next day",
      ops: [{ op: "add", path: "/sequence/next", value: { url: "https://strata.test/next" } }],
    });
    expect(extended.status).toBe(200);

    const dropped = await patchSpec(ctx, pageId, {
      base_version: 3,
      summary: "Leave the sequence",
      ops: [{ op: "remove", path: "/sequence" }],
    });
    expect(dropped.status).toBe(200);
    const [row] = await db.select().from(schema.pages).where(eq(schema.pages.id, pageId));
    expect(row?.document.sequence).toBeUndefined();
  });

  it("holds a patched sequence to the same shape a whole-spec write is held to", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(4));
    const badLink = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "A sequence that is not links",
      ops: [{ op: "add", path: "/sequence", value: { next: "the next page" } }],
    });
    expect(badLink.status).toBe(422);
    const unknownArrow = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "An arrow the chrome does not render",
      ops: [{ op: "add", path: "/sequence", value: { sideways: { url: "https://strata.test/x" } } }],
    });
    expect(unknownArrow.status).toBe(422);
  });

  it("takes a position beside a page-typed up, and refuses one without it", async () => {
    const { ctx } = await provision();
    const plan = await put(ctx, {
      space: { slug: "guard", name: "Guard", emoji: "🛡️" },
      slug: "the-plan",
      title: "The plan",
      summary: "Created page",
      spec: flatSpec(3, "plan"),
    });
    const planId = plan.body.page_id as string;
    const pageId = await createPage(ctx, flatSpec(4));

    const placed = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "Week two of the plan",
      ops: [{ op: "add", path: "/sequence", value: { up: { page: planId }, position: 2 } }],
    });
    expect(placed.status).toBe(200);

    const orphaned = await patchSpec(ctx, pageId, {
      base_version: 2,
      summary: "A position with nothing to count among",
      ops: [{ op: "remove", path: "/sequence/up" }],
    });
    expect(orphaned.status).toBe(422);
    expect(String(orphaned.body.error)).toContain("position");
  });

  it("still refuses a path outside the spec's four roots", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(4));
    const result = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "Somewhere else entirely",
      ops: [{ op: "add", path: "/kind", value: "standing" }],
    });
    expect(result.status).toBe(422);
    expect(String(result.body.error)).toContain("/sequence");
  });
});

describe("rewrite_page_spec", () => {
  it("replaces the whole document, drops what the new spec omits, and logs itself as a rewrite", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(6));

    const rewritten = await rewriteSpec(ctx, pageId, {
      base_version: 1,
      summary: "Rebuilt from scratch",
      spec: flatSpec(2, "only"),
    });
    expect(rewritten.status).toBe(200);
    expect(rewritten.body.version).toBe(2);

    const [row] = await db.select({ document: schema.pages.document }).from(schema.pages).where(eq(schema.pages.id, pageId));
    expect(Object.keys(row.document.elements).sort()).toEqual(["only-1", "root"]);

    const writes = await db.select({ version: schema.pageWrites.version, kind: schema.pageWrites.kind })
      .from(schema.pageWrites).where(eq(schema.pageWrites.pageId, pageId));
    expect(writes.sort((a, b) => a.version - b.version)).toEqual([
      { version: 1, kind: "create" },
      { version: 2, kind: "rewrite" },
    ]);
  });

  it("refuses a stale base_version", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(4));
    const stale = await rewriteSpec(ctx, pageId, { base_version: 7, summary: "Stale", spec: flatSpec(2, "only") });
    expect(stale).toMatchObject({ status: 409, body: { code: "version_conflict" } });
  });

  it("only claims live activity when the writer asks for it", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(4));

    const presence = async () => {
      const [row] = await db
        .select({ until: schema.pages.updatingUntil })
        .from(schema.pages)
        .where(eq(schema.pages.id, pageId));
      return row?.until ?? null;
    };

    // A create without presence is finished.
    expect(await presence()).toBeNull();

    const open = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "Putting the shape in",
      presence: "open",
      ops: [{ op: "replace", path: "/elements/item-1/props/text", value: "shape" }],
    });
    expect(open.status).toBe(200);
    const claimed = await presence();
    expect(claimed).not.toBeNull();
    expect(claimed!.getTime()).toBeGreaterThan(Date.now());

    const done = await patchSpec(ctx, pageId, {
      base_version: 2,
      summary: "Filling it in",
      ops: [{ op: "replace", path: "/elements/item-2/props/text", value: "filled" }],
    });
    expect(done.status).toBe(200);
    expect(await presence()).toBeNull();
  });

});

describe("an owner's unshare", () => {
  it("is sticky: no field on an agent write shares the page again", async () => {
    const { ctx } = await provision();
    const pageId = await createPage(ctx, flatSpec(3));
    const shared = await update({ namespace_id: ctx.namespace_id, page_id: pageId, shared: true, actor: "agent", baseUrl: BASE });
    expect(shared.status).toBe(200);
    const unshared = await update({ namespace_id: ctx.namespace_id, page_id: pageId, shared: false, actor: "user", baseUrl: BASE });
    expect(unshared.status).toBe(200);

    for (const attempt of [{}, { on_behalf_of_user: true }]) {
      const reshared = await update({
        namespace_id: ctx.namespace_id,
        page_id: pageId,
        shared: true,
        actor: "agent",
        baseUrl: BASE,
        ...attempt,
      });
      expect(reshared).toMatchObject({ status: 409, body: { code: "unshared_by_user", path: "/shared" } });
      expect(String(reshared.body.error)).toContain("only they can share it again");
      expect(String(reshared.body.error)).not.toContain("resend");
    }

    const [row] = await db.select({ shared: schema.pages.shared }).from(schema.pages).where(eq(schema.pages.id, pageId));
    expect(row.shared).toBe(false);

    // The owner's own surface can still re-share it.
    const byOwner = await update({ namespace_id: ctx.namespace_id, page_id: pageId, shared: true, actor: "user", baseUrl: BASE });
    expect(byOwner.status).toBe(200);
    expect(byOwner.body.shared).toBe(true);
  });
});

describe("a shared page that links somewhere the reader cannot follow", () => {
  async function linkingSpec(targetPageId: string): Promise<StrataSpec> {
    return {
      root: "root",
      answer: { verdict: "Spec under test." },
      elements: {
        root: { type: "section", props: {}, children: ["go"] },
        go: { type: "link-button", props: { label: "Read the other one", page_id: targetPageId }, children: [] },
      },
    };
  }

  it("warns the author when the linked page is not shared", async () => {
    const { ctx } = await provision();
    const target = await put(ctx, {
      space: { slug: "guard", name: "Guard", emoji: "🛡️" },
      slug: "target-page",
      title: "The other one",
      summary: "Target",
      spec: flatSpec(3),
    });
    expect(target.status).toBe(201);
    const pageId = await createPage(ctx, flatSpec(3));
    const shared = await update({ namespace_id: ctx.namespace_id, page_id: pageId, shared: true, actor: "agent", baseUrl: BASE });
    expect(shared.status).toBe(200);

    const [current] = await db.select({ version: schema.pages.version }).from(schema.pages).where(eq(schema.pages.id, pageId));
    const rewritten = await rewriteSpec(ctx, pageId, {
      base_version: current.version,
      summary: "Add the link",
      spec: await linkingSpec(target.body.page_id as string),
    });
    expect(rewritten.status).toBe(200);
    expect((rewritten.body.warnings as string[]).join(" ")).toContain("The other one");
  });

  it("stays quiet when both pages are shared out of the same track", async () => {
    const { ctx } = await provision();
    const target = await put(ctx, {
      space: { slug: "guard", name: "Guard", emoji: "🛡️" },
      slug: "target-page",
      title: "The other one",
      summary: "Target",
      spec: flatSpec(3),
    });
    const targetId = target.body.page_id as string;
    await update({ namespace_id: ctx.namespace_id, page_id: targetId, shared: true, actor: "agent", baseUrl: BASE });
    const pageId = await createPage(ctx, flatSpec(3));
    await update({ namespace_id: ctx.namespace_id, page_id: pageId, shared: true, actor: "agent", baseUrl: BASE });

    const [current] = await db.select({ version: schema.pages.version }).from(schema.pages).where(eq(schema.pages.id, pageId));
    const rewritten = await rewriteSpec(ctx, pageId, {
      base_version: current.version,
      summary: "Add the link",
      spec: await linkingSpec(targetId),
    });
    expect(rewritten.status).toBe(200);
    // Only the link guard is asserted here; other warnings are tested elsewhere.
    expect((rewritten.body.warnings as string[]).join(" ")).not.toContain("The other one");
  });

  it("says nothing on a page nobody has shared", async () => {
    const { ctx } = await provision();
    const target = await put(ctx, {
      space: { slug: "guard", name: "Guard", emoji: "🛡️" },
      slug: "target-page",
      title: "The other one",
      summary: "Target",
      spec: flatSpec(3),
    });
    const pageId = await createPage(ctx, flatSpec(3));
    const [current] = await db.select({ version: schema.pages.version }).from(schema.pages).where(eq(schema.pages.id, pageId));
    const rewritten = await rewriteSpec(ctx, pageId, {
      base_version: current.version,
      summary: "Add the link",
      spec: await linkingSpec(target.body.page_id as string),
    });
    expect(rewritten.status).toBe(200);
    // Only the link guard is asserted here; other warnings are tested elsewhere.
    expect((rewritten.body.warnings as string[]).join(" ")).not.toContain("The other one");
  });
});
