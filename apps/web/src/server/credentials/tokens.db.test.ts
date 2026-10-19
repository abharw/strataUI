/**
 * Credential lifecycle against a real database. Both replay orderings (attacker after a rotation,
 * agent retrying a lost response past the grace window) must revoke the grant, not just the token.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb, schema } from "@/server/db";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_REPLAY_GRACE_SECONDS, TOKEN_PREFIXES } from "./config";
import { InvalidGrant, InvalidRequest, ReuseDetected } from "./errors";
import { createGrant } from "./grants";
import {
  issueTokenPair,
  revokeGrant,
  rotateRefreshToken,
  sweepExpired,
  verifyAccessToken,
  type GrantRow,
} from "./tokens";

const db = getDb();
const WRITER_SCOPE = ["pages:read", "pages:write", "namespace:pair"];

let namespaceId: string;

async function makeGrant(
  overrides: Partial<Parameters<typeof createGrant>[0]> = {},
): Promise<GrantRow> {
  return createGrant({ namespaceId, kind: "writer", driver: "instinct", ...overrides });
}

beforeAll(async () => {
  const [namespace] = await db
    .insert(schema.namespaces)
    .values({})
    .returning();
  namespaceId = namespace.id;
});

afterAll(async () => {
  // The namespace cascade takes its grants and their tokens.
  await db.delete(schema.namespaces).where(eq(schema.namespaces.id, namespaceId));
});

describe("issuing and verifying", () => {
  it("mints a prefixed pair and resolves it to its grant", async () => {
    const grant = await makeGrant();
    const pair = await issueTokenPair(grant);

    expect(pair.accessToken.startsWith(TOKEN_PREFIXES.writer)).toBe(true);
    expect(pair.refreshToken?.startsWith(TOKEN_PREFIXES.refresh)).toBe(true);
    expect(pair.expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);

    const verified = await verifyAccessToken(pair.accessToken);
    expect(verified).not.toBeNull();
    expect(verified?.namespaceId).toBe(namespaceId);
    expect(verified?.scope).toEqual(WRITER_SCOPE);
    expect(verified?.kind).toBe("writer");
    expect(verified?.grant.id).toBe(grant.id);
  });

  it("stores only hashes", async () => {
    const grant = await makeGrant();
    const pair = await issueTokenPair(grant);
    const rows = await db
      .select()
      .from(schema.credentialTokens)
      .where(eq(schema.credentialTokens.grantId, grant.id));
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain(pair.accessToken);
    expect(stored).not.toContain(pair.refreshToken);
  });

  it("gives a viewer grant an sv_ token and refuses to read it as a writer", async () => {
    const grant = await makeGrant({ kind: "viewer", label: "iPhone" });
    const pair = await issueTokenPair(grant);

    expect(pair.accessToken.startsWith(TOKEN_PREFIXES.viewer)).toBe(true);
    expect((await verifyAccessToken(pair.accessToken))?.kind).toBe("viewer");
    // Same secret, writer prefix: a category error, not a promotion.
    const swapped = TOKEN_PREFIXES.writer + pair.accessToken.slice(TOKEN_PREFIXES.viewer.length);
    expect(await verifyAccessToken(swapped)).toBeNull();
  });

  it("returns null for an unprefixed, unknown, or refresh token", async () => {
    const grant = await makeGrant();
    const pair = await issueTokenPair(grant);
    expect(await verifyAccessToken("nonsense")).toBeNull();
    expect(await verifyAccessToken(`${TOKEN_PREFIXES.writer}not-a-real-token`)).toBeNull();
    expect(await verifyAccessToken(pair.refreshToken as string)).toBeNull();
  });

  it("returns null once the access token has expired", async () => {
    const grant = await makeGrant();
    const past = new Date(Date.now() - (ACCESS_TOKEN_TTL_SECONDS + 60) * 1000);
    const pair = await issueTokenPair(grant, { now: past });
    expect(await verifyAccessToken(pair.accessToken)).toBeNull();
  });

  it("bumps last_used_at without writing on every call", async () => {
    const grant = await makeGrant();
    const pair = await issueTokenPair(grant);
    expect(grant.lastUsedAt).toBeNull();

    await verifyAccessToken(pair.accessToken);
    const [afterFirst] = await db
      .select()
      .from(schema.grants)
      .where(eq(schema.grants.id, grant.id));
    expect(afterFirst.lastUsedAt).not.toBeNull();

    await verifyAccessToken(pair.accessToken);
    const [afterSecond] = await db
      .select()
      .from(schema.grants)
      .where(eq(schema.grants.id, grant.id));
    expect(afterSecond.lastUsedAt?.getTime()).toBe(afterFirst.lastUsedAt?.getTime());
  });
});

describe("static credentials", () => {
  it("issues one never-expiring access token and no refresh token", async () => {
    const grant = await makeGrant({ mode: "static", label: "chatgpt actions" });
    const pair = await issueTokenPair(grant);

    expect(pair.refreshToken).toBeNull();
    expect(pair.accessExpiresAt).toBeNull();
    expect(pair.expiresIn).toBeNull();
    expect(pair.mode).toBe("static");

    const rows = await db
      .select()
      .from(schema.credentialTokens)
      .where(eq(schema.credentialTokens.grantId, grant.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("access");
    expect(rows[0].expiresAt).toBeNull();

    // No expiry: only revocation ends it.
    const later = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    expect(await verifyAccessToken(pair.accessToken, { now: later })).not.toBeNull();
    expect(await revokeGrant(grant.id, "owner")).toBe(true);
    expect(await verifyAccessToken(pair.accessToken)).toBeNull();
  });

  it("refuses to rotate a refresh token that names a static grant", async () => {
    // Rotating when minted, static now: the leftover refresh token must not work.
    const grant = await makeGrant();
    const pair = await issueTokenPair(grant);
    await db
      .update(schema.grants)
      .set({ mode: "static" })
      .where(eq(schema.grants.id, grant.id));

    await expect(rotateRefreshToken(pair.refreshToken as string)).rejects.toBeInstanceOf(InvalidGrant);
  });
});

describe("revocation", () => {
  it("kills every token under the grant, immediately", async () => {
    const grant = await makeGrant();
    const first = await issueTokenPair(grant);
    const second = await issueTokenPair(grant);
    expect(await verifyAccessToken(first.accessToken)).not.toBeNull();

    expect(await revokeGrant(grant.id, "owner")).toBe(true);

    expect(await verifyAccessToken(first.accessToken)).toBeNull();
    expect(await verifyAccessToken(second.accessToken)).toBeNull();
    await expect(rotateRefreshToken(first.refreshToken as string)).rejects.toBeInstanceOf(InvalidGrant);
  });

  it("keeps the first reason when revoked twice", async () => {
    const grant = await makeGrant();
    await revokeGrant(grant.id, "reuse_detected");
    expect(await revokeGrant(grant.id, "owner")).toBe(false);
    const [row] = await db.select().from(schema.grants).where(eq(schema.grants.id, grant.id));
    expect(row.revokedBy).toBe("reuse_detected");
  });
});

describe("refresh rotation", () => {
  it("chains the new pair to the old one inside the same family", async () => {
    const grant = await makeGrant();
    const first = await issueTokenPair(grant);
    const second = await rotateRefreshToken(first.refreshToken as string);

    expect(second.familyId).toBe(first.familyId);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(await verifyAccessToken(second.accessToken)).not.toBeNull();
    // The superseded access token dies with the rotation that replaced it.
    expect(await verifyAccessToken(first.accessToken)).toBeNull();

    const rows = await db
      .select()
      .from(schema.credentialTokens)
      .where(eq(schema.credentialTokens.grantId, grant.id));
    const consumed = rows.filter((row) => row.consumedAt !== null);
    expect(consumed).toHaveLength(1);
    expect(rows.some((row) => row.parentId === consumed[0].id)).toBe(true);
  });

  it("rotates again and again", async () => {
    const grant = await makeGrant();
    let pair = await issueTokenPair(grant);
    for (let round = 0; round < 3; round += 1) {
      pair = await rotateRefreshToken(pair.refreshToken as string);
    }
    expect(await verifyAccessToken(pair.accessToken)).not.toBeNull();
  });

  it("kills the grant when a replay arrives after the grace window", async () => {
    const grant = await makeGrant();
    const first = await issueTokenPair(grant);
    const second = await rotateRefreshToken(first.refreshToken as string);

    // An attacker presents the spent token long after any lost response could be retried.
    const later = new Date(Date.now() + (REFRESH_REPLAY_GRACE_SECONDS + 5) * 1000);
    await expect(rotateRefreshToken(first.refreshToken as string, { now: later }))
      .rejects.toBeInstanceOf(ReuseDetected);

    const [row] = await db.select().from(schema.grants).where(eq(schema.grants.id, grant.id));
    expect(row.revokedAt).not.toBeNull();
    expect(row.revokedBy).toBe("reuse_detected");
    // The legitimate agent's live pair dies with the grant, as it must.
    expect(await verifyAccessToken(second.accessToken)).toBeNull();
    await expect(rotateRefreshToken(second.refreshToken as string)).rejects.toBeInstanceOf(InvalidGrant);
  });

  it("kills the grant when the chain has already moved past the replayed token", async () => {
    const grant = await makeGrant();
    const first = await issueTokenPair(grant);
    const second = await rotateRefreshToken(first.refreshToken as string);
    // A spent successor proves the response arrived, so this is a replay.
    await rotateRefreshToken(second.refreshToken as string);

    await expect(rotateRefreshToken(first.refreshToken as string))
      .rejects.toBeInstanceOf(ReuseDetected);
    const [row] = await db.select().from(schema.grants).where(eq(schema.grants.id, grant.id));
    expect(row.revokedBy).toBe("reuse_detected");
  });

  it("recovers a rotation whose response was lost, without killing the grant", async () => {
    const grant = await makeGrant();
    const first = await issueTokenPair(grant);
    // The response was lost, so the agent retries with the token it still holds.
    const lost = await rotateRefreshToken(first.refreshToken as string);
    const recovered = await rotateRefreshToken(first.refreshToken as string);

    expect(recovered.refreshToken).not.toBe(lost.refreshToken);
    expect(await verifyAccessToken(recovered.accessToken)).not.toBeNull();
    const [row] = await db.select().from(schema.grants).where(eq(schema.grants.id, grant.id));
    expect(row.revokedAt).toBeNull();
    // The recovery spent the unreceived successor, so presenting it is a replay.
    await rotateRefreshToken(recovered.refreshToken as string);
    await expect(rotateRefreshToken(lost.refreshToken as string))
      .rejects.toBeInstanceOf(ReuseDetected);
  });

  it("does not let the grace window revive a grant that is already revoked", async () => {
    const grant = await makeGrant();
    const first = await issueTokenPair(grant);
    await rotateRefreshToken(first.refreshToken as string);
    await revokeGrant(grant.id, "owner");

    await expect(rotateRefreshToken(first.refreshToken as string))
      .rejects.toBeInstanceOf(ReuseDetected);
  });

  it("refuses an access token and an expired refresh token", async () => {
    const grant = await makeGrant();
    const pair = await issueTokenPair(grant);
    await expect(rotateRefreshToken(pair.accessToken)).rejects.toBeInstanceOf(InvalidRequest);

    const expired = await issueTokenPair(grant, {
      now: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
    });
    await expect(rotateRefreshToken(expired.refreshToken as string)).rejects.toBeInstanceOf(InvalidGrant);
  });
});

describe("sweeping", () => {
  it("removes what can no longer authorize anything and keeps what can", async () => {
    const grant = await makeGrant();
    await issueTokenPair(grant, { now: new Date(Date.now() - 2 * 60 * 60 * 1000) });
    const live = await issueTokenPair(grant);
    const staticGrant = await makeGrant({ mode: "static" });
    const forever = await issueTokenPair(staticGrant, {
      now: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    });

    const result = await sweepExpired();
    expect(result.tokens).toBeGreaterThanOrEqual(1);
    // Sweeping never touches a live credential, and a static token has no expiry.
    expect(await verifyAccessToken(live.accessToken)).not.toBeNull();
    expect(await verifyAccessToken(forever.accessToken)).not.toBeNull();
  });
});
