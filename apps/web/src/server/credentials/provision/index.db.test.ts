import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { generateSecret, sha256Hex, verifyHash } from "@/server/credentials/keys";
import { sealKey } from "@/server/credentials/keys/at-rest";
import { createCredentialNamespace } from "@/test/namespace";
import {
  createNamespace,
  createSpace,
  rotateKey,
  shareSpace,
} from "./index";

const BASE = "https://strata.test";
const db = getDb();
const namespaceIds: string[] = [];
afterEach(async () => {
  if (namespaceIds.length > 0) await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
});

async function provision() {
  const result = await createCredentialNamespace({ baseUrl: BASE });
  namespaceIds.push(result.namespace_id);
  return result;
}

describe("page-first provisioning", () => {
  it("creates a namespace with no space and no grant", async () => {
    const ns = await createNamespace();
    namespaceIds.push(ns.namespace_id);
    const spaces = await db.select().from(schema.spaces).where(eq(schema.spaces.namespaceId, ns.namespace_id));
    expect(spaces).toEqual([]);
    const grants = await db.select().from(schema.grants).where(eq(schema.grants.namespaceId, ns.namespace_id));
    expect(grants).toEqual([]);
  });

  it("creates a named track and stable shared bundle", async () => {
    const ns = await provision();
    const space = await createSpace(ns.namespace_id, { slug: "germany-trip", name: "Germany trip", emoji: "🇩🇪" });
    expect(space).toMatchObject({ slug: "germany-trip", name: "Germany trip", emoji: "🇩🇪", share_key: null });
    const shared = await shareSpace(space.space_id, { baseUrl: BASE });
    expect(shared.space_url).toBe(`${BASE}/share/${shared.share_key}`);
    const [afterFirstShare] = await db.select({ updatedAt: schema.spaces.updatedAt })
      .from(schema.spaces).where(eq(schema.spaces.id, space.space_id));

    // Idempotent on the key; the URL is rebuilt against the requesting origin, nothing re-minted.
    const elsewhere = "https://a-different-origin.test";
    const repeated = await shareSpace(space.space_id, { baseUrl: elsewhere });
    expect(repeated).toEqual({ ...shared, space_url: `${elsewhere}/share/${shared.share_key}` });
    const [afterRepeat] = await db.select({ updatedAt: schema.spaces.updatedAt })
      .from(schema.spaces).where(eq(schema.spaces.id, space.space_id));
    expect(afterRepeat.updatedAt).toEqual(afterFirstShare.updatedAt);
  });

  it("will not rotate a Space nobody shared, because that would share it", async () => {
    const ns = await provision();
    const space = await createSpace(ns.namespace_id, { slug: "quiet", name: "Quiet", emoji: "🤫" });

    await expect(rotateKey({ scope: "space", id: space.space_id, baseUrl: BASE }))
      .rejects.toMatchObject({ name: "ProvisionError", code: "not_found" });

    // Nothing was minted and nothing was stamped: the Space is still private.
    const [row] = await db
      .select({ hash: schema.spaces.shareKeyHash, sealed: schema.spaces.sealedShareKey, sharedAt: schema.spaces.sharedAt })
      .from(schema.spaces)
      .where(eq(schema.spaces.id, space.space_id));
    expect(row).toMatchObject({ hash: null, sealed: null, sharedAt: null });

    // Once it is shared on purpose, rotating replaces that key and only it.
    const shared = await shareSpace(space.space_id, { baseUrl: BASE });
    const rotated = await rotateKey({ scope: "space", id: space.space_id, baseUrl: BASE });
    expect(rotated.key).not.toBe(shared.share_key);
    expect(rotated.url).toContain("/share/spk_");
  });

  it("rotates only the page capability", async () => {
    const ns = await provision();
    const space = await createSpace(ns.namespace_id, { slug: "trip", name: "Trip", emoji: "🧳" });
    const oldKey = generateSecret("page");
    const pageId = crypto.randomUUID();
    const [page] = await db.insert(schema.pages).values({
      id: pageId,
      namespaceId: ns.namespace_id,
      spaceId: space.space_id,
      slug: "itinerary",
      title: "Itinerary",
      document: { root: "root", answer: { verdict: "Spec under test." }, elements: { root: { type: "section", props: {}, children: [] } } },
      sealedReadKey: sealKey(oldKey),
      lastSummary: "Created",
      readKeyHash: sha256Hex(oldKey),
    }).returning({ id: schema.pages.id });
    const rotated = await rotateKey({ scope: "page", id: page.id, baseUrl: BASE });
    const [stored] = await db.select({ hash: schema.pages.readKeyHash }).from(schema.pages).where(eq(schema.pages.id, page.id));
    expect(rotated.url).toContain("/share/pgk_");
    expect(verifyHash(oldKey, stored.hash)).toBe(false);
    expect(verifyHash(rotated.key, stored.hash)).toBe(true);
  });
});
