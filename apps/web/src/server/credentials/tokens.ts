/**
 * Agent credentials: opaque, stored only as sha256, plaintext shown once. The grant is the unit
 * of revocation and is joined on every verify, so revoking it kills every token instantly.
 */
import { randomBytes } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb, schema } from "@/server/db";
import { SECRET_BYTES, sha256Hex, verifyHash } from "@/server/credentials/keys";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  LAST_USED_RESOLUTION_SECONDS,
  REFRESH_REPLAY_GRACE_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  STATIC_ACCESS_EXPIRES_AT,
  TOKEN_PREFIXES,
} from "./config";
import { InvalidGrant, InvalidRequest, ReuseDetected } from "./errors";

type Database = NodePgDatabase<typeof schema>;
/** A pool handle or an open transaction; every function here accepts either. */
export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export type GrantRow = typeof schema.grants.$inferSelect;
export type GrantKind = GrantRow["kind"];
export type GrantMode = GrantRow["mode"];
export type RevokedBy = NonNullable<GrantRow["revokedBy"]>;

/** The one moment a token is plaintext. Static grants get null refresh and expiry fields. */
export interface IssuedTokenPair {
  grantId: string;
  accessToken: string;
  refreshToken: string | null;
  accessExpiresAt: Date | null;
  refreshExpiresAt: Date | null;
  /** Seconds, for the `expires_in` field of a token response. Null when static. */
  expiresIn: number | null;
  familyId: string;
  scope: string[];
  kind: GrantKind;
  mode: GrantMode;
}

export interface VerifiedAccessToken {
  grant: GrantRow;
  /** The only tenancy key. A token can never name another namespace. */
  namespaceId: string;
  scope: string[];
  kind: GrantKind;
  tokenId: string;
  /** Null for a static credential, which does not expire. */
  expiresAt: Date | null;
}

export interface GrantSubject {
  id: string;
  kind: GrantKind;
  mode: GrantMode;
  scope: string[];
}

function mintSecret(prefix: string): string {
  return prefix + randomBytes(SECRET_BYTES).toString("base64url");
}

function accessPrefix(kind: GrantKind): string {
  return kind === "viewer" ? TOKEN_PREFIXES.viewer : TOKEN_PREFIXES.writer;
}

function seconds(from: Date, count: number): Date {
  return new Date(from.getTime() + count * 1000);
}

/**
 * Mint an access token, plus a refresh token when the grant rotates. Rotation passes the family
 * and parent so the chain is walkable. Static grants get one non-expiring access token.
 */
export async function issueTokenPair(
  grant: GrantSubject,
  options: {
    db?: Executor;
    now?: Date;
    familyId?: string;
    parentTokenId?: string | null;
  } = {},
): Promise<IssuedTokenPair> {
  const db = options.db ?? getDb();
  const now = options.now ?? new Date();
  const familyId = options.familyId ?? crypto.randomUUID();
  const isStatic = grant.mode === "static";
  const accessToken = mintSecret(accessPrefix(grant.kind));
  const refreshToken = isStatic ? null : mintSecret(TOKEN_PREFIXES.refresh);
  const accessExpiresAt = isStatic
    ? STATIC_ACCESS_EXPIRES_AT
    : seconds(now, ACCESS_TOKEN_TTL_SECONDS);
  const refreshExpiresAt = isStatic ? null : seconds(now, REFRESH_TOKEN_TTL_SECONDS);

  const rows: (typeof schema.credentialTokens.$inferInsert)[] = [
    {
      grantId: grant.id,
      kind: "access",
      tokenHash: sha256Hex(accessToken),
      familyId,
      parentId: options.parentTokenId ?? null,
      expiresAt: accessExpiresAt,
      createdAt: now,
    },
  ];
  if (refreshToken !== null) {
    rows.push({
      grantId: grant.id,
      kind: "refresh",
      tokenHash: sha256Hex(refreshToken),
      familyId,
      parentId: options.parentTokenId ?? null,
      expiresAt: refreshExpiresAt,
      createdAt: now,
    });
  }
  await db.insert(schema.credentialTokens).values(rows);

  return {
    grantId: grant.id,
    accessToken,
    refreshToken,
    accessExpiresAt,
    refreshExpiresAt,
    expiresIn: isStatic ? null : ACCESS_TOKEN_TTL_SECONDS,
    familyId,
    scope: grant.scope,
    kind: grant.kind,
    mode: grant.mode,
  };
}

/** Resolve an access token to its grant. Null for every failure, so a 401 is not an oracle. */
export async function verifyAccessToken(
  raw: string,
  options: { db?: Executor; now?: Date } = {},
): Promise<VerifiedAccessToken | null> {
  const db = options.db ?? getDb();
  const now = options.now ?? new Date();
  const expectedKind: GrantKind | null = raw.startsWith(TOKEN_PREFIXES.writer)
    ? "writer"
    : raw.startsWith(TOKEN_PREFIXES.viewer)
      ? "viewer"
      : null;
  if (expectedKind === null) return null;

  const [row] = await db
    .select({ token: schema.credentialTokens, grant: schema.grants })
    .from(schema.credentialTokens)
    .innerJoin(schema.grants, eq(schema.grants.id, schema.credentialTokens.grantId))
    .where(eq(schema.credentialTokens.tokenHash, sha256Hex(raw)))
    .limit(1);
  if (row === undefined) return null;

  // Confirming compare, so a lookup that stopped being exact could not bypass auth.
  if (!verifyHash(raw, row.token.tokenHash)) return null;
  if (row.token.kind !== "access") return null;
  // An `sv_` string naming a writer grant is a category error, not a demotion.
  if (row.grant.kind !== expectedKind) return null;
  if (row.token.revokedAt !== null) return null;
  // A null expiry is a static credential; only revocation stops it.
  if (row.token.expiresAt !== null && row.token.expiresAt.getTime() <= now.getTime()) return null;
  if (row.grant.revokedAt !== null) return null;

  await touchGrant(db, row.grant, now);

  return {
    grant: row.grant,
    namespaceId: row.grant.namespaceId,
    scope: row.grant.scope,
    kind: row.grant.kind,
    tokenId: row.token.id,
    expiresAt: row.token.expiresAt,
  };
}

/** Update `last_used_at` at most once per `LAST_USED_RESOLUTION_SECONDS`. */
async function touchGrant(db: Executor, grant: GrantRow, now: Date): Promise<void> {
  const last = grant.lastUsedAt?.getTime() ?? 0;
  if (now.getTime() - last < LAST_USED_RESOLUTION_SECONDS * 1000) return;
  await db
    .update(schema.grants)
    .set({ lastUsedAt: now })
    .where(eq(schema.grants.id, grant.id));
}

/**
 * Spend a refresh token and return its successor. The row lock serializes concurrent use of one
 * token. A replay outside the grace window revokes the whole grant; inside it, an unspent
 * successor allows one bounded retry (see `REFRESH_REPLAY_GRACE_SECONDS`).
 */
export async function rotateRefreshToken(
  raw: string,
  options: { db?: Database; now?: Date } = {},
): Promise<IssuedTokenPair> {
  const db = options.db ?? getDb();
  const now = options.now ?? new Date();
  // The format is public, so rejecting a wrong prefix before lookup leaks nothing.
  // `invalid_grant` here would wrongly send the agent back through auth.
  if (!raw.startsWith(TOKEN_PREFIXES.refresh)) {
    throw new InvalidRequest(
      `refresh_token does not hold refresh-token material: a refresh token starts with ${TOKEN_PREFIXES.refresh}. Send the refresh token from your last rotation.`,
    );
  }

  // Throwing inside `transaction` would roll back the revocation, so the transaction reports the
  // replay, commits, and the grant is revoked afterwards.
  const outcome = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ token: schema.credentialTokens, grant: schema.grants })
      .from(schema.credentialTokens)
      .innerJoin(schema.grants, eq(schema.grants.id, schema.credentialTokens.grantId))
      .where(eq(schema.credentialTokens.tokenHash, sha256Hex(raw)))
      .limit(1)
      .for("update", { of: schema.credentialTokens });
    if (row === undefined) throw new InvalidGrant();
    if (!verifyHash(raw, row.token.tokenHash)) throw new InvalidGrant();
    if (row.token.kind !== "refresh") throw new InvalidGrant();

    // Reuse is checked first so no other failure can skip the revocation.
    if (row.token.consumedAt !== null) {
      // Only a live rotating grant can be recovered into; anything else is a replay.
      const successor = row.grant.revokedAt !== null || row.grant.mode === "static"
        ? null
        : await unspentSuccessor(tx, row.token, now);
      if (successor === null) return { kind: "reuse" as const, grantId: row.grant.id };
      // The grace path rotates the successor; it cannot tell a lost response from a replay.
      return { kind: "issued" as const, pair: await rotate(tx, { ...row, token: successor }, now) };
    }
    // A refresh token left over from a mode change does not rotate.
    if (row.grant.mode === "static") throw new InvalidGrant();
    if (row.token.revokedAt !== null) throw new InvalidGrant();
    if (row.token.expiresAt === null) throw new InvalidGrant();
    if (row.token.expiresAt.getTime() <= now.getTime()) throw new InvalidGrant();
    if (row.grant.revokedAt !== null) throw new InvalidGrant();

    return { kind: "issued" as const, pair: await rotate(tx, row, now) };
  });

  if (outcome.kind === "reuse") {
    await revokeGrantWith(db, outcome.grantId, "reuse_detected", now);
    throw new ReuseDetected(outcome.grantId);
  }
  return outcome.pair;
}

type TokenRow = typeof schema.credentialTokens.$inferSelect;

/** Consume one refresh token, revoke its family's access tokens, and mint the successor. */
async function rotate(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  row: { token: TokenRow; grant: GrantRow },
  now: Date,
): Promise<IssuedTokenPair> {
  await tx
    .update(schema.credentialTokens)
    .set({ consumedAt: now })
    .where(eq(schema.credentialTokens.id, row.token.id));
  // Otherwise a stolen access token would outlive the rotation meant to end it.
  await tx
    .update(schema.credentialTokens)
    .set({ revokedAt: now })
    .where(and(
      eq(schema.credentialTokens.familyId, row.token.familyId),
      eq(schema.credentialTokens.kind, "access"),
      isNull(schema.credentialTokens.revokedAt),
    ));
  await tx
    .update(schema.grants)
    .set({ lastUsedAt: now })
    .where(eq(schema.grants.id, row.grant.id));

  return issueTokenPair(row.grant, {
    db: tx,
    now,
    familyId: row.token.familyId,
    parentTokenId: row.token.id,
  });
}

/**
 * The unspent successor of a consumed refresh token inside the grace window, or null. Its
 * presence permits a retry; it does not prove the response was lost.
 */
async function unspentSuccessor(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  token: TokenRow,
  now: Date,
): Promise<TokenRow | null> {
  const consumedAt = token.consumedAt;
  if (consumedAt === null) return null;
  if (now.getTime() - consumedAt.getTime() > REFRESH_REPLAY_GRACE_SECONDS * 1000) return null;

  const [successor] = await tx
    .select()
    .from(schema.credentialTokens)
    .where(and(
      eq(schema.credentialTokens.familyId, token.familyId),
      eq(schema.credentialTokens.kind, "refresh"),
      eq(schema.credentialTokens.parentId, token.id),
    ))
    .limit(1)
    .for("update");
  if (successor === undefined) return null;
  if (successor.consumedAt !== null || successor.revokedAt !== null) return null;
  if (successor.expiresAt === null || successor.expiresAt.getTime() <= now.getTime()) return null;
  return successor;
}

/** Revoke a grant and its tokens. Idempotent and keeps the first reason, e.g. `reuse_detected`. */
export async function revokeGrant(
  grantId: string,
  by: RevokedBy,
  options: { db?: Executor; now?: Date } = {},
): Promise<boolean> {
  return revokeGrantWith(options.db ?? getDb(), grantId, by, options.now ?? new Date());
}

async function revokeGrantWith(
  db: Executor,
  grantId: string,
  by: RevokedBy,
  now: Date,
): Promise<boolean> {
  const revoked = await db
    .update(schema.grants)
    .set({ revokedAt: now, revokedBy: by })
    .where(and(eq(schema.grants.id, grantId), isNull(schema.grants.revokedAt)))
    .returning({ id: schema.grants.id });
  await db
    .update(schema.credentialTokens)
    .set({ revokedAt: now })
    .where(and(
      eq(schema.credentialTokens.grantId, grantId),
      isNull(schema.credentialTokens.revokedAt),
    ));
  return revoked.length > 0;
}

export interface SweepResult {
  tokens: number;
}

/**
 * Delete expired tokens. Housekeeping only: every read path checks expiry. Static tokens have a
 * null `expires_at`, which `<` skips.
 */
export async function sweepExpired(
  options: { db?: Executor; now?: Date } = {},
): Promise<SweepResult> {
  const db = options.db ?? getDb();
  const now = options.now ?? new Date();

  let tokens = 0;
  for (;;) {
    // Bounded batches so a first run against a backlog cannot hold one long lock.
    const result = await db.execute(sql`
      delete from ${schema.credentialTokens}
      where ctid in (
        select ctid from ${schema.credentialTokens}
        where ${schema.credentialTokens.expiresAt} < ${now}
        limit ${SWEEP_BATCH}
      )
    `);
    const deleted = result.rowCount ?? 0;
    tokens += deleted;
    if (deleted < SWEEP_BATCH) return { tokens };
  }
}

const SWEEP_BATCH = 10_000;
