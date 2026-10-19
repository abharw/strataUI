// Always 200, so revocation cannot be used to test whether a string is a live credential.
import { afterEach, describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import {
  createGrant,
  issueTokenPair,
  rotateRefreshToken,
  verifyAccessToken,
} from "@/server/credentials";
import { createCredentialNamespace } from "@/test/namespace";
import { CONTRACT_HEADER, CONTRACT_VERSION } from "@/shared/api/version";

import { POST } from "./route";

const BASE = "https://strata.test";
const db = getDb();
const namespaceIds: string[] = [];

afterEach(async () => {
  if (namespaceIds.length > 0) {
    await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
  }
});

async function strata() {
  const ns = await createCredentialNamespace({ baseUrl: BASE });
  namespaceIds.push(ns.namespace_id);
  return ns;
}

async function revoke(body: unknown, bearer?: string) {
  const response = await POST(new Request(`${BASE}/v1/auth/revoke`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [CONTRACT_HEADER]: CONTRACT_VERSION,
      ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

async function grantOf(id: string) {
  const [grant] = await db.select().from(schema.grants).where(sql`${schema.grants.id} = ${id}`);
  return grant;
}

describe("POST /v1/auth/revoke", () => {
  it("disconnects the agent presenting its own access token", async () => {
    const ns = await strata();
    const { status, body } = await revoke({}, ns.access_token);

    expect(status).toBe(200);
    // Only the contract stamp; anything more would be a lookup oracle.
    expect(body).toEqual({ contract_version: CONTRACT_VERSION });
    expect(await verifyAccessToken(ns.access_token)).toBeNull();

    const grant = await grantOf(ns.grant_id);
    expect(grant.revokedAt).not.toBeNull();
    expect(grant.revokedBy).toBe("agent");
  });

  it("accepts a refresh token in the body, for an agent that holds only that", async () => {
    const ns = await strata();
    const { status } = await revoke({ token: ns.refresh_token });

    expect(status).toBe(200);
    // Revokes the whole grant, so the paired access token is invalid too.
    expect(await verifyAccessToken(ns.access_token)).toBeNull();
    expect((await grantOf(ns.grant_id)).revokedBy).toBe("agent");
  });

  it("answers 200 for a token it has never seen", async () => {
    const { status, body } = await revoke({ token: `sw_${"q".repeat(43)}` });
    expect(status).toBe(200);
    expect(body).toEqual({ contract_version: CONTRACT_VERSION });
  });

  it("answers 200 with no credential at all", async () => {
    expect((await revoke({})).status).toBe(200);
  });

  it("is idempotent and keeps the first reason", async () => {
    const ns = await strata();
    await revoke({}, ns.access_token);
    const again = await revoke({ token: ns.refresh_token });

    expect(again.status).toBe(200);
    expect((await grantOf(ns.grant_id)).revokedBy).toBe("agent");
  });

  it("kills nothing for a credential that had already stopped working", async () => {
    const ns = await strata();
    // A leaked, already-superseded token must not be able to revoke the live grant.
    const rotated = await rotateRefreshToken(ns.refresh_token);

    expect((await revoke({ token: ns.refresh_token })).status).toBe(200);
    expect((await revoke({}, ns.access_token)).status).toBe(200);

    expect((await grantOf(ns.grant_id)).revokedAt).toBeNull();
    expect(await verifyAccessToken(rotated.accessToken)).not.toBeNull();
  });

  it("kills nothing for a token that has expired", async () => {
    const ns = await strata();
    const grant = await createGrant({
      namespaceId: ns.namespace_id,
      kind: "writer",
      driver: "chatgpt",
    });
    const stale = await issueTokenPair(grant, {
      now: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
    });

    expect((await revoke({ token: stale.accessToken })).status).toBe(200);
    expect((await grantOf(grant.id)).revokedAt).toBeNull();
  });

  it("touches only the grant behind the presented token", async () => {
    const ns = await strata();
    const other = await createGrant({
      namespaceId: ns.namespace_id,
      kind: "writer",
      driver: "chatgpt",
    });
    const otherPair = await issueTokenPair(other);

    await revoke({}, ns.access_token);

    expect((await grantOf(other.id)).revokedAt).toBeNull();
    expect(await verifyAccessToken(otherPair.accessToken)).not.toBeNull();
  });
});
