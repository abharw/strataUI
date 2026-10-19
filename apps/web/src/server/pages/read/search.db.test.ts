import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { DEFAULT_WRITER_SCOPES } from "@/server/credentials";
import { put } from "@/server/pages/handlers";
import type { StrataSpec } from "@/page-content/schema";
import { createCredentialNamespace } from "@/test/namespace";

import { searchOwnedPageText } from "./search";

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
  return {
    namespaceId: created.namespace_id,
    ctx: {
      namespace_id: created.namespace_id,
      kind: "writer" as const,
      grant_id: created.grant_id,
      scope: DEFAULT_WRITER_SCOPES,
      baseUrl: BASE,
    },
  };
}

function proseSpec(text: string): StrataSpec {
  return {
    root: "root",
    answer: { verdict: "Standing answer without the search phrase." },
    elements: {
      root: { type: "section", props: {}, children: ["status", "body"] },
      status: { type: "metric", props: { label: "Status", value: "Current" }, children: [] },
      body: { type: "prose", props: { text }, children: [] },
    },
  };
}

async function createPage(owner: Awaited<ReturnType<typeof provision>>, slug: string, text: string) {
  const result = await put(owner.ctx, {
    space: { slug: "notes", name: "Notes", emoji: "📝" },
    slug,
    title: `Page ${slug}`,
    summary: "Created searchable Page",
    spec: proseSpec(text),
  });
  expect(result.status).toBe(201);
  return result.body.page_id as string;
}

describe("owner Page-text search", () => {
  it("matches literal visible text only inside the live owner's namespace", async () => {
    const mine = await provision();
    const theirs = await provision();
    const mineId = await createPage(mine, "lantern", "The Cobalt lantern is 20% brighter.");
    await createPage(theirs, "other-lantern", "The Cobalt lantern belongs elsewhere.");

    expect(await searchOwnedPageText(mine.namespaceId, "cobalt LANTERN")).toEqual([mineId]);
    // `%` is literal, not a SQL wildcard.
    expect(await searchOwnedPageText(mine.namespaceId, "20%")).toEqual([mineId]);

    // A deleted Page is not matched.
    await db.delete(schema.pages).where(eq(schema.pages.id, mineId));
    expect(await searchOwnedPageText(mine.namespaceId, "cobalt lantern")).toEqual([]);
  });
});
