/**
 * `POST /v1/auth/refresh`, end to end. Replaying a token the chain has moved past revokes the
 * whole grant; retrying the latest token after a lost response gets a fresh pair.
 */
import { afterEach, describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { createGrant, issueTokenPair, verifyAccessToken } from "@/server/credentials";
import { createCredentialNamespace } from "@/test/namespace";
import { RECOVERY } from "@/shared/api/recovery";
import { CONTRACT_VERSION } from "@/shared/api/version";

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
  const ns = await createCredentialNamespace({ baseUrl: BASE, label: "instinct" });
  namespaceIds.push(ns.namespace_id);
  return ns;
}

async function refresh(body: unknown) {
  const response = await POST(new Request(`${BASE}/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() as Record<string, unknown>, response };
}

// The one body for every refresh failure; `start_auth` is the operation id of POST /v1/auth/start.
const INVALID_GRANT = {
  error: "invalid_grant",
  code: "invalid_grant",
  next: ["start_auth"],
  // Read from the recovery table so the wording cannot drift.
  error_description: RECOVERY.invalid_grant.truth,
  avoid: RECOVERY.invalid_grant.avoid,
  recover: {
    ...RECOVERY.invalid_grant.recover,
    path: `${BASE}${RECOVERY.invalid_grant.recover.path}`,
  },
  contract_version: CONTRACT_VERSION,
};

async function grantOf(id: string) {
  const [grant] = await db.select().from(schema.grants).where(sql`${schema.grants.id} = ${id}`);
  return grant;
}

describe("POST /v1/auth/refresh", () => {
  // Every response carries the contract version so a long-lived agent notices changes.
  it("stamps the contract version on a success, in the body and the header", async () => {
    const ns = await strata();
    const { status, body, response } = await refresh({ refresh_token: ns.refresh_token });
    expect(status).toBe(200);
    expect(body.contract_version).toBe(CONTRACT_VERSION);
    expect(response.headers.get("X-Strata-Contract")).toBe(CONTRACT_VERSION);
  });

  it("stamps it on a failure too, beside a recovery that is a whole URL", async () => {
    const { status, body, response } = await refresh({ refresh_token: "sr_nothing" });
    expect(status).toBe(400);
    expect(body.contract_version).toBe(CONTRACT_VERSION);
    expect(response.headers.get("X-Strata-Contract")).toBe(CONTRACT_VERSION);
    // Relative in the table to match openapi.json; absolute on the wire for the agent.
    expect((body.recover as { path: string }).path).toBe(`${BASE}/v1/auth/start`);
  });

  it("rotates both tokens and keeps the grant identity", async () => {
    const ns = await strata();
    const { status, body, response } = await refresh({ refresh_token: ns.refresh_token });

    expect(status).toBe(200);
    expect(Object.keys(body)[0]).toBe("warnings");
    expect(body).toMatchObject({
      namespace_id: ns.namespace_id,
      grant_id: ns.grant_id,
      label: "instinct",
      token_type: "Bearer",
      scope: "pages:read pages:write namespace:pair",
    });
    expect(body.access_token).toMatch(/^sw_/);
    expect(body.refresh_token).toMatch(/^sr_/);
    expect(body.refresh_token).not.toBe(ns.refresh_token);
    expect(body.access_token).not.toBe(ns.access_token);
    expect(response.headers.get("cache-control")).toContain("no-store");

    // The superseded access token is invalid as soon as its replacement exists.
    expect(await verifyAccessToken(body.access_token as string)).not.toBeNull();
    expect(await verifyAccessToken(ns.access_token)).toBeNull();
  });

  it("kills the grant when the replay follows a rotation the chain moved past", async () => {
    const ns = await strata();
    const rotated = await refresh({ refresh_token: ns.refresh_token });
    expect(rotated.status).toBe(200);
    // Using the new pair proves the response arrived, so replaying the old token is theft.
    const again = await refresh({ refresh_token: rotated.body.refresh_token as string });
    expect(again.status).toBe(200);

    const replay = await refresh({ refresh_token: ns.refresh_token });
    expect(replay.status).toBe(400);
    expect(replay.body).toEqual(INVALID_GRANT);

    const grant = await grantOf(ns.grant_id);
    expect(grant.revokedAt).not.toBeNull();
    expect(grant.revokedBy).toBe("reuse_detected");
    // Revocation covers every token under the grant, including the latest pair.
    expect(await verifyAccessToken(again.body.access_token as string)).toBeNull();
    expect((await refresh({ refresh_token: again.body.refresh_token as string })).status).toBe(400);
  });

  it("hands a fresh pair to an agent whose rotation response was lost", async () => {
    const ns = await strata();
    // The rotation succeeded but the client never saw the response, so it retries.
    const lost = await refresh({ refresh_token: ns.refresh_token });
    expect(lost.status).toBe(200);

    const retry = await refresh({ refresh_token: ns.refresh_token });
    expect(retry.status).toBe(200);
    expect(retry.body.refresh_token).not.toBe(lost.body.refresh_token);
    expect(await verifyAccessToken(retry.body.access_token as string)).not.toBeNull();

    const grant = await grantOf(ns.grant_id);
    expect(grant.revokedAt).toBeNull();
  });

  it("answers unknown, wrong-kind and revoked material with the same body", async () => {
    const ns = await strata();
    const revoked = await createGrant({
      namespaceId: ns.namespace_id,
      kind: "writer",
      driver: "instinct",
    });
    const pair = await issueTokenPair(revoked);
    await db
      .update(schema.grants)
      .set({ revokedAt: new Date(), revokedBy: "owner" })
      .where(sql`${schema.grants.id} = ${revoked.id}`);

    const attempts = [
      await refresh({ refresh_token: `sr_${"z".repeat(43)}` }),
      await refresh({ refresh_token: pair.refreshToken }),
    ];

    for (const attempt of attempts) {
      expect(attempt.status).toBe(400);
      expect(attempt.body).toEqual(INVALID_GRANT);
    }
  });

  it("answers material that is not refresh-shaped with invalid_request, not a dead grant", async () => {
    const ns = await strata();
    // Rejected by prefix before any lookup, so this split is not a probing oracle.
    const attempt = await refresh({ refresh_token: ns.access_token });
    expect(attempt.status).toBe(400);
    expect(attempt.body.code).toBe("invalid_request");
    expect(attempt.body.next).toEqual(["refresh_credential", "start_auth"]);
    expect(attempt.body).not.toEqual(INVALID_GRANT);
  });

  it("refuses a static credential: revoking is its only rotation", async () => {
    const ns = await strata();
    const staticGrant = await createGrant({
      namespaceId: ns.namespace_id,
      kind: "writer",
      driver: "chatgpt",
      mode: "static",
    });
    const pair = await issueTokenPair(staticGrant);
    expect(pair.refreshToken).toBeNull();

    const { status } = await refresh({ refresh_token: pair.accessToken });
    expect(status).toBe(400);
  });

  it("refuses a body that names no token", async () => {
    const { status, body } = await refresh({});
    expect(status).toBe(422);
    expect(body.code).toBe("invalid_request");
  });
});
