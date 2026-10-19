/**
 * Owner sessions: a browser that proved the Strata's email once stays signed in. Only a SHA-256 of
 * the random secret is stored, and the namespace comes from the row, never from the browser.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { getDb, schema } from "@/server/db";
import { sha256Hex } from "@/server/credentials/keys";

/** 90 days, slid forward on use. */
export const OWNER_SESSION_TTL_MS = 90 * 24 * 60 * 60_000;
/** How stale a session must be before a read slides it; daily, so polling is not a write stream. */
export const OWNER_SESSION_SLIDE_AFTER_MS = 24 * 60 * 60_000;

const SECRET_PREFIX = "ows_";
const OWNER_SESSION_SECRET = /^ows_[A-Za-z0-9_-]{24,256}$/;

export function isOwnerSessionSecret(value: string): boolean {
  return OWNER_SESSION_SECRET.test(value);
}

export interface OwnerSessionSummary {
  id: string;
  /** True for the browser that asked, so the person can tell which row is this device. */
  current: boolean;
  /** e.g. "Safari on iPhone"; null when unrecognised or for older rows. */
  client_label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface ResolvedOwnerSession {
  id: string;
  namespaceId: string;
  expiresAt: Date;
  /** True when this resolution extended the row, so the cookie is stale too. */
  slid: boolean;
}

/**
 * Coarse browser and platform label. Only this result is stored, never the raw `User-Agent`, which
 * would be a fingerprint. Unverified. Most specific tokens first, since Chromium claims Safari and
 * Edge and Opera claim Chrome.
 */
export function describeClient(userAgent: string | undefined): string | null {
  if (userAgent === undefined || userAgent.trim() === "") return null;
  const agent = userAgent.slice(0, 512);
  const app = agent.includes("StrataMobile/");
  const browser = app
    ? "Strata app"
    : /\bEdgA?\//u.test(agent)
      ? "Edge"
      : /\bOPR\/|\bOpera\b/u.test(agent)
        ? "Opera"
        : /\bFirefox\/|\bFxiOS\//u.test(agent)
          ? "Firefox"
          : /\bCriOS\/|\bChrome\//u.test(agent)
            ? "Chrome"
            : /\bSafari\//u.test(agent)
              ? "Safari"
              : null;
  const platform = /\biPhone\b/u.test(agent)
    ? "iPhone"
    : /\biPad\b/u.test(agent)
      ? "iPad"
      : /\bAndroid\b/u.test(agent)
        ? "Android"
        : /\bMac OS X\b|\bMacintosh\b/u.test(agent)
          ? "Mac"
          : /\bWindows\b/u.test(agent)
            ? "Windows"
            : /\bLinux\b|\bX11\b/u.test(agent)
              ? "Linux"
              : null;
  if (browser !== null && platform !== null) return `${browser} on ${platform}`;
  return browser ?? platform;
}

/** Store the sign-in client label. Scoped by namespace so a stray id cannot label another row. */
export async function labelOwnerSession(
  namespaceId: string,
  sessionId: string,
  label: string | null,
): Promise<void> {
  if (label === null) return;
  await getDb()
    .update(schema.ownerSessions)
    .set({ clientLabel: label })
    .where(and(
      eq(schema.ownerSessions.id, sessionId),
      eq(schema.ownerSessions.namespaceId, namespaceId),
    ));
}

export interface CreateOwnerSessionOptions {
  now?: Date;
}

/** Mint one session for the namespace behind a verified email code. */
export async function createSession(
  input: CreateOwnerSessionOptions & { namespaceId: string },
): Promise<{ id: string; secret: string; expiresAt: Date }> {
  const { namespaceId, ...options } = input;
  return createOwnerSession(namespaceId, options);
}

/** Mint one session for a namespace. The plaintext is returned once. */
export async function createOwnerSession(
  namespaceId: string,
  options: CreateOwnerSessionOptions = {},
): Promise<{ id: string; secret: string; expiresAt: Date }> {
  const now = options.now ?? new Date();
  const secret = `${SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(now.getTime() + OWNER_SESSION_TTL_MS);
  const [row] = await getDb()
    .insert(schema.ownerSessions)
    .values({
      namespaceId,
      sessionHash: sha256Hex(secret),
      expiresAt,
      createdAt: now,
      lastUsedAt: now,
    })
    .returning({ id: schema.ownerSessions.id });
  if (row === undefined) throw new Error("Could not create an owner session.");
  return { id: row.id, secret, expiresAt };
}

/** Revalidate a cookie secret on every request; no cache, so revocation is instant. */
export async function resolveOwnerSession(
  secret: string,
  now: Date = new Date(),
): Promise<ResolvedOwnerSession | null> {
  if (!isOwnerSessionSecret(secret)) return null;
  const db = getDb();
  const [session] = await db
    .select({
      id: schema.ownerSessions.id,
      namespaceId: schema.ownerSessions.namespaceId,
      expiresAt: schema.ownerSessions.expiresAt,
      lastUsedAt: schema.ownerSessions.lastUsedAt,
      revokedAt: schema.ownerSessions.revokedAt,
    })
    .from(schema.ownerSessions)
    .where(eq(schema.ownerSessions.sessionHash, sha256Hex(secret)));
  if (
    session === undefined
    || session.revokedAt !== null
    || session.expiresAt.getTime() <= now.getTime()
  ) {
    return null;
  }

  const stale = session.lastUsedAt === null
    || session.lastUsedAt.getTime() <= now.getTime() - OWNER_SESSION_SLIDE_AFTER_MS;
  if (!stale) {
    return {
      id: session.id,
      namespaceId: session.namespaceId,
      expiresAt: session.expiresAt,
      slid: false,
    };
  }

  const expiresAt = new Date(now.getTime() + OWNER_SESSION_TTL_MS);
  await db
    .update(schema.ownerSessions)
    .set({ lastUsedAt: now, expiresAt })
    // A revocation between the read and this write wins; the next request fails closed.
    .where(and(
      eq(schema.ownerSessions.id, session.id),
      isNull(schema.ownerSessions.revokedAt),
    ));
  return { id: session.id, namespaceId: session.namespaceId, expiresAt, slid: true };
}

/** Every session on this Strata, newest first. No hash is recoverable here. */
export async function listOwnerSessions(
  namespaceId: string,
  currentSessionId: string | null = null,
): Promise<OwnerSessionSummary[]> {
  const rows = await getDb()
    .select({
      id: schema.ownerSessions.id,
      clientLabel: schema.ownerSessions.clientLabel,
      createdAt: schema.ownerSessions.createdAt,
      lastUsedAt: schema.ownerSessions.lastUsedAt,
      revokedAt: schema.ownerSessions.revokedAt,
    })
    .from(schema.ownerSessions)
    .where(eq(schema.ownerSessions.namespaceId, namespaceId))
    .orderBy(desc(schema.ownerSessions.createdAt));
  return rows.map((row) => ({
    id: row.id,
    current: row.id === currentSessionId,
    client_label: row.clientLabel,
    created_at: row.createdAt.toISOString(),
    last_used_at: row.lastUsedAt?.toISOString() ?? null,
    revoked_at: row.revokedAt?.toISOString() ?? null,
  }));
}

/**
 * Sign one browser out. Null when the id is not on this namespace; idempotent, returning the
 * original timestamp when already revoked.
 */
export async function revokeOwnerSession(
  namespaceId: string,
  sessionId: string,
  now: Date = new Date(),
): Promise<{ revokedAt: Date } | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: schema.ownerSessions.id, revokedAt: schema.ownerSessions.revokedAt })
    .from(schema.ownerSessions)
    .where(and(
      eq(schema.ownerSessions.id, sessionId),
      eq(schema.ownerSessions.namespaceId, namespaceId),
    ));
  if (row === undefined) return null;
  if (row.revokedAt !== null) return { revokedAt: row.revokedAt };
  await db
    .update(schema.ownerSessions)
    .set({ revokedAt: now })
    .where(and(
      eq(schema.ownerSessions.id, row.id),
      isNull(schema.ownerSessions.revokedAt),
    ));
  return { revokedAt: now };
}

/** Sign every browser out in one statement, including the one asking. */
export async function revokeOwnerSessionsForNamespace(
  namespaceId: string,
  now: Date = new Date(),
): Promise<number> {
  const revoked = await getDb()
    .update(schema.ownerSessions)
    .set({ revokedAt: now })
    .where(and(
      eq(schema.ownerSessions.namespaceId, namespaceId),
      isNull(schema.ownerSessions.revokedAt),
    ));
  return revoked.rowCount ?? 0;
}

/** How long a dead session row is kept before the sweep removes it. */
const OWNER_SESSION_RETENTION_MS = 30 * 24 * 60 * 60_000;

/**
 * Delete sessions expired or revoked over a month ago. Housekeeping only; the month keeps recent
 * revocations visible in the list.
 */
export async function sweepOwnerSessions(
  { now = new Date(), retentionMs = OWNER_SESSION_RETENTION_MS }: {
    now?: Date;
    retentionMs?: number;
  } = {},
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionMs);
  let removed = 0;
  for (;;) {
    // Bounded batches so a backlog cannot hold one long lock.
    const result = await getDb().execute(sql`
      delete from ${schema.ownerSessions}
      where ctid in (
        select ctid from ${schema.ownerSessions}
        where ${schema.ownerSessions.expiresAt} < ${cutoff}
           or ${schema.ownerSessions.revokedAt} < ${cutoff}
        limit ${SWEEP_BATCH}
      )
    `);
    const deleted = result.rowCount ?? 0;
    removed += deleted;
    if (deleted < SWEEP_BATCH) return removed;
  }
}

const SWEEP_BATCH = 10_000;
