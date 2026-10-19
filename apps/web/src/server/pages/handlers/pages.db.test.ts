import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { get, preflight, remove, SetPageBodySchema, put, spaceShorthand, specMisroute, update } from "./index";
import { DEFAULT_WRITER_SCOPES } from "@/server/credentials";
import { createCredentialNamespace } from "@/test/namespace";

const context = {
  namespace_id: "00000000-0000-4000-8000-000000000001",
  kind: "writer" as const,
  grant_id: "00000000-0000-4000-8000-000000000002",
  scope: DEFAULT_WRITER_SCOPES,
  baseUrl: "https://strata.test",
};

describe("canonical page request", () => {
  it.each(["tree", "ops", "verbs", "event_id", "canvas_id"])(
    "rejects removed field %s instead of silently discarding it",
    async (field) => {
      const result = await put(context, {
        space: { slug: "strict", name: "Strict", emoji: "📋" },
        slug: "strict-request",
        title: "Strict request",
        summary: "Should not write",
        spec: { root: "root", elements: { root: { type: "section", props: {}, children: [] } } },
        [field]: field === "tree" ? { root: "root", nodes: {} } : true,
      });
      expect(result.status).toBe(422);
      expect(result.body.code).toBe("invalid_request");
      expect(JSON.stringify(result.body)).toContain(field);
    },
  );

  it("rejects an overlong inline Space name before any write", async () => {
    const result = await put(context, {
      space: { slug: "too-long", name: "S".repeat(37), emoji: "📋" },
      slug: "strict-request",
      title: "Strict request",
      summary: "Should not write",
      spec: { root: "root", elements: { root: { type: "section", props: {}, children: [] } } },
    });

    expect(result).toMatchObject({
      status: 422,
      body: { code: "invalid_request", path: "/space/name", next: ["get_guide", "put_page"] },
    });
  });
});

describe("preflighting a candidate spec", () => {
  it("returns the write's telemetry for a clean candidate without storing anything", () => {
    const result = preflight({
      kind: "standing",
      spec: {
        answer: { verdict: "The gate runs without a database." },
        root: "root",
        elements: {
          root: { type: "section", props: {}, children: ["status"] },
          status: { type: "metric", props: { label: "Checks", value: 6 } },
        },
      },
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ valid: true, kind: "standing" });
    expect(result.body.text_chars).toBeGreaterThan(0);
    expect(result.body.budget_remaining).toBeGreaterThan(0);
    expect(Array.isArray(result.body.collections)).toBe(true);
  });

  it("answers an invalid candidate with the same 422 a write would give", () => {
    const result = preflight({ spec: { root: "root", elements: {} } });
    expect(result.status).toBe(422);
    expect(result.body.code).toBe("invalid_spec");
  });
});

describe("an inline space missing its required fields", () => {
  it("states the idempotency rule and points at space_id instead of reading as secret", () => {
    const result = spaceShorthand({ space: { slug: "trip" } });
    expect(result).toMatchObject({
      status: 422,
      body: { code: "invalid_request", path: "/space", next: ["list_spaces", "put_page"] },
    });
    expect(JSON.stringify(result?.body)).toContain("space_id");
    expect(JSON.stringify(result?.body)).toContain("missing: name, emoji");
  });

  it("stays out of the way of complete bodies and non-space writes", () => {
    expect(spaceShorthand({ space: { slug: "trip", name: "Trip", emoji: "✈️" } })).toBeNull();
    expect(spaceShorthand({ title: "No space at all" })).toBeNull();
    expect(spaceShorthand(null)).toBeNull();
  });
});

describe("a content edit sent to the metadata endpoint", () => {
  it("names the /spec endpoint instead of listing the keys as unknown", () => {
    const result = specMisroute({ base_version: 3, summary: "Refreshed totals", ops: [] });
    expect(result).toMatchObject({
      status: 422,
      body: { code: "invalid_request", next: ["get_page", "patch_page_spec"] },
    });
    expect(JSON.stringify(result?.body)).toContain("/v1/pages/{id}/spec");
  });

  it("leaves metadata bodies and non-objects alone", () => {
    expect(specMisroute({ title: "A better name", shared: true })).toBeNull();
    expect(specMisroute(null)).toBeNull();
    expect(specMisroute("ops")).toBeNull();
  });
});

describe("renaming a page", () => {
  it("takes a title on its own, without a content write", () => {
    const parsed = SetPageBodySchema.safeParse({ title: "A better name" });
    expect(parsed.success).toBe(true);
  });

  it("refuses a blank name rather than storing one", () => {
    const parsed = SetPageBodySchema.safeParse({ title: "   " });
    expect(parsed.success).toBe(false);
  });

  it("refuses literal markup before a rename reaches the database", async () => {
    const result = await update({
      ...context,
      page_id: "00000000-0000-4000-8000-000000000003",
      actor: "agent",
      title: "<script>Roadmap</script>",
    });
    expect(result).toMatchObject({
      status: 422,
      body: { code: "literal_markup", path: "/title", next: ["set_page"] },
    });
  });

  it("still refuses a patch that asks for nothing, and says title is an option", async () => {
    const result = await update({ ...context, page_id: "00000000-0000-4000-8000-000000000003", actor: "agent" });
    expect(result.status).toBe(422);
    expect(result.body.code).toBe("empty_patch");
    expect(JSON.stringify(result.body)).toContain("title");
  });
});

describe("deleting a Page", () => {
  const db = getDb();
  const namespaceIds: string[] = [];

  afterEach(async () => {
    if (namespaceIds.length > 0) {
      await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
    }
  });

  /** Four blocks and a verdict, enough to pass the authoring quality gate. */
  function deletableSpec() {
    const elements: Record<string, unknown> = {
      root: { type: "section", props: {}, children: ["a", "b", "c", "d"] },
    };
    for (const id of ["a", "b", "c", "d"]) {
      elements[id] = { type: "callout", props: { text: `Block ${id}` }, children: [] };
    }
    return { root: "root", answer: { verdict: "Ready to go." }, elements };
  }

  async function onePage() {
    const created = await createCredentialNamespace({ baseUrl: context.baseUrl });
    namespaceIds.push(created.namespace_id);
    const ctx = { ...context, namespace_id: created.namespace_id, grant_id: created.grant_id };
    const written = await put(ctx, {
      space: { slug: "trip", name: "Trip", emoji: "🧳" },
      slug: "itinerary",
      title: "Itinerary",
      summary: "Created page",
      spec: deletableSpec(),
    });
    expect(written.status, JSON.stringify(written.body)).toBe(201);
    return { ctx, pageId: written.body.page_id as string };
  }

  it("refuses without confirmation, and says what is lost", async () => {
    const { ctx, pageId } = await onePage();
    const refused = await remove({ namespace_id: ctx.namespace_id, page_id: pageId });

    expect(refused).toMatchObject({ status: 422, body: { code: "confirm_required", path: "/confirm" } });
    // The refusal names the consequence and waits for the person.
    expect(String(refused.body.error)).toContain("links stop opening");
    const rows = await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.id, pageId));
    expect(rows).toHaveLength(1);
  });

  it("erases the row on confirmation, so its read key resolves nothing", async () => {
    const { ctx, pageId } = await onePage();
    const deleted = await remove({ namespace_id: ctx.namespace_id, page_id: pageId, confirm: true });

    expect(deleted).toMatchObject({ status: 200, body: { page_id: pageId, deleted: true } });
    const rows = await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.id, pageId));
    expect(rows).toHaveLength(0);
  });

  it("flips live steps as metadata, and refuses an empty patch", async () => {
    // Live steps is metadata, so it flips without a content write.
    expect(SetPageBodySchema.safeParse({ live_steps: true }).success).toBe(true);
    expect(SetPageBodySchema.safeParse({ live_steps: "on" }).success).toBe(false);
    const { ctx, pageId } = await onePage();
    const empty = await update({ ...ctx, page_id: pageId, actor: "user" });
    expect(empty).toMatchObject({ status: 422, body: { code: "empty_patch" } });
    expect(String(empty.body.error)).toBe("Send shared, space_id, title, or live_steps.");
  });
});

describe("reading one Page", () => {
  const db = getDb();
  const namespaceIds: string[] = [];

  afterEach(async () => {
    if (namespaceIds.length > 0) {
      await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
    }
  });

  async function onePage() {
    const created = await createCredentialNamespace({ baseUrl: context.baseUrl });
    namespaceIds.push(created.namespace_id);
    const ctx = { ...context, namespace_id: created.namespace_id, grant_id: created.grant_id };
    const elements: Record<string, unknown> = {
      root: { type: "section", props: {}, children: ["a", "b", "c", "d"] },
    };
    for (const id of ["a", "b", "c", "d"]) {
      elements[id] = { type: "callout", props: { text: `Block ${id}` }, children: [] };
    }
    const written = await put(ctx, {
      space: { slug: "trip", name: "Trip", emoji: "🧳" },
      slug: "itinerary",
      title: "Itinerary",
      summary: "Created page",
      spec: { root: "root", answer: { verdict: "Ready to go." }, elements },
    });
    expect(written.status, JSON.stringify(written.body)).toBe(201);
    return { ctx, pageId: written.body.page_id as string };
  }

  it("says in meta whether the page is shared, so exposure needs no second list call", async () => {
    const { ctx, pageId } = await onePage();
    const ref = { namespace_id: ctx.namespace_id, page_id: pageId, baseUrl: context.baseUrl };

    const fresh = await get(ref);
    expect(fresh.status).toBe(200);
    // Also under `meta`, beside owner_url and url.
    expect(fresh.body.meta).toMatchObject({ shared: false });
    expect(fresh.body.shared).toBe(false);

    const shared = await update({ ...ctx, page_id: pageId, actor: "user", shared: true });
    expect(shared.status, JSON.stringify(shared.body)).toBe(200);

    const after = await get(ref);
    expect(after.body.meta).toMatchObject({ shared: true });
    expect(after.body.shared).toBe(true);
  });
});
