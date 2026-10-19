/**
 * A writer minting a static credential: it is a real writer credential, its grant records the
 * issuer, and minting requires `namespace:pair`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { createGrant, issueTokenPair, verifyAccessToken } from "@/server/credentials";
import { BUCKETS, STATIC_MINTS_PER_NAMESPACE_PER_HOUR } from "@/server/credentials/provision/rate-limit";
import { createCredentialNamespace } from "@/test/namespace";

import { POST } from "./route";

const BASE = "https://strata.test";
const db = getDb();
const namespaceIds: string[] = [];
const startedAt = new Date();

afterEach(async () => {
  if (namespaceIds.length > 0) {
    await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
  }
  await db
    .delete(schema.rateLimitEvents)
    .where(sql`${schema.rateLimitEvents.createdAt} >= ${startedAt}`);
});

async function writer(displayName = "Arav's Strata") {
  const ns = await createCredentialNamespace({ baseUrl: BASE, label: "instinct", displayName });
  namespaceIds.push(ns.namespace_id);
  return ns;
}

async function mint(body: unknown, token?: string) {
  const response = await POST(new Request(`${BASE}/v1/credentials/static`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() as Record<string, unknown>, response };
}

describe("POST /v1/credentials/static", () => {
  it("mints a usable static writer credential and names the Strata it opens", async () => {
    const ns = await writer();
    const { status, body, response } = await mint(
      { driver: "chatgpt", label: "chatgpt action" },
      ns.access_token,
    );

    expect(status).toBe(201);
    // `warnings` comes first so a model reading the body sees it.
    expect(Object.keys(body)[0]).toBe("warnings");
    expect(body.mode).toBe("static");
    expect(body.label).toBe("chatgpt action");
    expect(body.namespace_display_name).toBe("Arav's Strata");
    expect(body.namespace_id).toBe(ns.namespace_id);
    // Present and null rather than omitted.
    expect(body.refresh_token).toBeNull();
    expect(body.expires_in).toBeNull();
    expect(body.scope).toContain("pages:write");
    expect(body.next).toEqual(["get_manifest", "put_page"]);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const verified = await verifyAccessToken(body.access_token as string);
    expect(verified?.namespaceId).toBe(ns.namespace_id);
    expect(verified?.kind).toBe("writer");
    expect(verified?.expiresAt).toBeNull();
  });

  it("records the calling grant as the issuer", async () => {
    const ns = await writer();
    const { body } = await mint({ driver: "chatgpt" }, ns.access_token);

    const [grant] = await db
      .select()
      .from(schema.grants)
      .where(eq(schema.grants.id, body.grant_id as string));
    expect(grant.issuedByGrantId).toBe(ns.grant_id);
    expect(grant.mode).toBe("static");
    expect(grant.kind).toBe("writer");
    // The original grant came from the owner's email code, so it has no issuer.
    const [issuer] = await db
      .select()
      .from(schema.grants)
      .where(eq(schema.grants.id, ns.grant_id));
    expect(issuer.issuedByGrantId).toBeNull();
  });

  it("refuses a viewer credential before it consults scope", async () => {
    const ns = await writer();
    const viewer = await createGrant({
      namespaceId: ns.namespace_id,
      kind: "viewer",
      driver: "strata-mobile",
    });
    const pair = await issueTokenPair(viewer);

    const { status, body, response } = await mint({ driver: "chatgpt" }, pair.accessToken);
    expect(status).toBe(403);
    expect(body.code).toBe("insufficient_scope");
    expect(response.headers.get("www-authenticate")).toContain('scope="pages:write"');
    expect(await grantCount(ns.namespace_id)).toBe(2);
  });

  it("refuses a writer whose grant does not hold namespace:pair", async () => {
    const ns = await writer();
    const narrow = await createGrant({
      namespaceId: ns.namespace_id,
      kind: "writer",
      driver: "instinct",
      scope: ["pages:read", "pages:write"],
    });
    const pair = await issueTokenPair(narrow);

    const { status, body, response } = await mint({ driver: "chatgpt" }, pair.accessToken);
    expect(status).toBe(403);
    expect(body.code).toBe("insufficient_scope");
    expect(response.headers.get("www-authenticate")).toContain('scope="namespace:pair"');
  });

  it("challenges a request with no credential", async () => {
    const { status, body, response } = await mint({ driver: "chatgpt" });
    expect(status).toBe(401);
    expect(body.code).toBe("unauthenticated");
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("names the drivers it knows rather than inventing one", async () => {
    const ns = await writer();
    const { status, body } = await mint({ driver: "skynet" }, ns.access_token);
    expect(status).toBe(422);
    expect(body.code).toBe("invalid_driver");
    expect(body.valid).toContain("chatgpt");
  });

  it("stops one namespace at its hourly static-credential budget", async () => {
    const ns = await writer();
    await db.insert(schema.rateLimitEvents).values(
      Array.from({ length: STATIC_MINTS_PER_NAMESPACE_PER_HOUR }, () => ({
        bucket: BUCKETS.staticMint,
        key: ns.namespace_id,
      })),
    );

    const { status, body, response } = await mint({ driver: "chatgpt" }, ns.access_token);
    expect(status).toBe(429);
    expect(body.resource).toBe("static_credentials_namespace");
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);

    // The budget is per namespace.
    const other = await writer();
    expect((await mint({ driver: "chatgpt" }, other.access_token)).status).toBe(201);
  });
});

async function grantCount(namespaceId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.grants.id })
    .from(schema.grants)
    .where(eq(schema.grants.namespaceId, namespaceId));
  return rows.length;
}
