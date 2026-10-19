/**
 * Rolling-window budgets on one Postgres table, for low-volume auth and static-mint endpoints.
 * Indexed timestamp cutoffs define the windows; advisory locks make check-and-charge atomic.
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import type { Tx } from "./index";

/* ------------------------------------------------------------- constants */

/** Static mints per namespace per hour. Low because each one is a permanent key until revoked. */
export const STATIC_MINTS_PER_NAMESPACE_PER_HOUR = 10;
/** Code requests per source per hour, however many addresses it types. */
const AUTH_STARTS_PER_SOURCE_PER_HOUR = 10;
/**
 * Codes one address may receive per hour from anywhere. Below WorkOS's own limit so we answer with
 * a `Retry-After` instead of the provider's opaque 400.
 */
export const AUTH_STARTS_PER_EMAIL_PER_HOUR = 6;
/** Wrong codes one request source may send per hour before it is cut off. */
export const AUTH_VERIFY_FAILURES_PER_SOURCE_PER_HOUR = 10;
/**
 * Wrong codes per address per code lifetime, which bounds many sources against one address.
 * Allows a couple of typos and leaves a guesser 5 in 10^6.
 */
export const AUTH_VERIFY_FAILURES_PER_EMAIL = 5;
/** The provider's code lifetime, and therefore the window this budget covers. */
const CODE_TTL_SECONDS = 600;

export const BUCKETS = {
  staticMint: "static-mint",
  authStart: "auth-start",
  authStartEmail: "auth-start-email",
  authVerifyFailure: "auth-verify-failure",
  authVerifyFailureEmail: "auth-verify-failure-email",
} as const;

export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

/* ---------------------------------------------------------------- errors */

export class RateLimited extends Error {
  constructor(
    readonly resource: string,
    readonly limit: number,
    readonly retryAfterSeconds: number,
    message: string,
  ) {
    super(message);
    this.name = "RateLimited";
  }
}

/* ---------------------------------------------------------------- window */

export interface BudgetWindow {
  bucket: Bucket;
  /** The key to count. `null` counts the whole bucket, for a deployment-wide limit. */
  key: string | null;
  limit: number;
  windowSeconds: number;
  /** Machine handle for the exhausted resource, echoed in the 429 body. */
  resource: string;
  /** Prose the agent reads. */
  message: string;
}

/**
 * Count each window; if all have room, record one event against the first (narrowest) window.
 * Other windows are different readings of the same rows.
 *
 * @throws RateLimited for the first exhausted window, narrowest first.
 */
async function reserveBudget(
  tx: Tx,
  windows: readonly BudgetWindow[],
  now: Date = new Date(),
): Promise<void> {
  const [primary] = windows;
  if (primary === undefined) throw new Error("reserveBudget needs at least one window.");

  // Same locks in the same order on every path, so two instances cannot both see room and insert.
  // A `key: null` window reads across keys, so it also needs the bucket-wide lock.
  if (windows.some((window) => window.key === null)) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`strata:budget:${primary.bucket}`}, 0))`);
  }
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`strata:budget:${primary.bucket}:${primary.key ?? "global"}`}, 0))`);

  for (const window of windows) {
    const used = await measure(tx, window, now);
    if (used.count >= window.limit) {
      throw new RateLimited(
        window.resource,
        window.limit,
        used.retryAfterSeconds ?? window.windowSeconds,
        window.message,
      );
    }
  }

  await tx.insert(schema.rateLimitEvents).values({
    bucket: primary.bucket,
    key: primary.key ?? "global",
    createdAt: now,
  });
}

/** `reserveBudget` on its own connection, for callers with no transaction open. */
export async function reserve(
  windows: readonly BudgetWindow[],
  now: Date = new Date(),
): Promise<void> {
  await getDb().transaction((tx) => reserveBudget(tx, windows, now));
}

/** A charged wrong-code slot that must be returned when the provider accepts it. */
export interface FailureReservation {
  readonly eventIds: readonly string[];
}

/**
 * Reserve both wrong-code axes (source and email) before the provider call, so concurrent requests
 * cannot all see room and all guess. The committed rows are the lease; a verified code or a
 * non-`invalid_code` refusal releases them.
 */
export async function reserveFailureBudgets(
  windows: readonly BudgetWindow[],
  now: Date = new Date(),
): Promise<FailureReservation> {
  if (windows.length === 0) throw new Error("reserveFailureBudgets needs at least one window.");
  if (windows.some((window) => window.key === null)) {
    throw new Error("reserveFailureBudgets needs independently keyed windows.");
  }

  return getDb().transaction(async (tx) => {
    // Stable lock order so callers passing the same axes in a different order cannot deadlock.
    const ordered = [...windows].sort((left, right) =>
      `${left.bucket}\u0000${left.key ?? "global"}`.localeCompare(`${right.bucket}\u0000${right.key ?? "global"}`),
    );
    for (const window of ordered) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`strata:budget:${window.bucket}:${window.key ?? "global"}`}, 0))`);
    }

    for (const window of windows) {
      const used = await measure(tx, window, now);
      if (used.count >= window.limit) {
        throw new RateLimited(
          window.resource,
          window.limit,
          used.retryAfterSeconds ?? window.windowSeconds,
          window.message,
        );
      }
    }

    const rows = await tx
      .insert(schema.rateLimitEvents)
      .values(windows.map((window) => ({
        bucket: window.bucket,
        key: window.key ?? "global",
        createdAt: now,
      })))
      .returning({ id: schema.rateLimitEvents.id });
    return { eventIds: rows.map((row) => row.id) };
  });
}

/** Release the slots of a verification that succeeded or failed for another reason. */
export async function releaseFailureReservation(reservation: FailureReservation): Promise<void> {
  if (reservation.eventIds.length === 0) return;
  await getDb()
    .delete(schema.rateLimitEvents)
    .where(inArray(schema.rateLimitEvents.id, [...reservation.eventIds]));
}

interface Measurement {
  count: number;
  /** Seconds until the oldest counted event ages out, or null when none exist. */
  retryAfterSeconds: number | null;
}

type Reader = Pick<Tx, "select">;

async function measure(
  tx: Reader,
  window: BudgetWindow,
  now: Date,
): Promise<Measurement> {
  const since = new Date(now.getTime() - window.windowSeconds * 1000);
  const where = window.key === null
    ? eq(schema.rateLimitEvents.bucket, window.bucket)
    : and(
        eq(schema.rateLimitEvents.bucket, window.bucket),
        eq(schema.rateLimitEvents.key, window.key),
      );

  const [row] = await tx
    .select({
      count: sql<number>`count(*)::int`,
      oldest: sql<Date | null>`min(${schema.rateLimitEvents.createdAt})`,
    })
    .from(schema.rateLimitEvents)
    .where(and(where, sql`${schema.rateLimitEvents.createdAt} >= ${since}`));

  const count = row?.count ?? 0;
  const oldest = row?.oldest ?? null;
  if (oldest === null) return { count, retryAfterSeconds: null };
  const readyAt = new Date(oldest).getTime() + window.windowSeconds * 1000;
  return {
    count,
    retryAfterSeconds: Math.max(1, Math.ceil((readyAt - now.getTime()) / 1000)),
  };
}

/* ------------------------------------------------------- window builders */

export function staticMintWindows(namespaceId: string): readonly BudgetWindow[] {
  return [
    {
      bucket: BUCKETS.staticMint,
      key: namespaceId,
      limit: STATIC_MINTS_PER_NAMESPACE_PER_HOUR,
      windowSeconds: 60 * 60,
      resource: "static_credentials_namespace",
      message: `This Strata has minted ${STATIC_MINTS_PER_NAMESPACE_PER_HOUR} static credentials in the last hour. Revoke one that is no longer used, or wait.`,
    },
  ];
}

/**
 * Separate from the source budget because `reserveBudget` records one row per call. Charged first,
 * so a refusal for a flooded inbox costs the source nothing.
 */
export function authStartEmailWindows(emailHash: string): readonly BudgetWindow[] {
  return [
    {
      bucket: BUCKETS.authStartEmail,
      key: emailHash,
      limit: AUTH_STARTS_PER_EMAIL_PER_HOUR,
      windowSeconds: 60 * 60,
      resource: "auth_starts_email",
      message: `That address has been sent ${AUTH_STARTS_PER_EMAIL_PER_HOUR} sign-in codes in the last hour. Ask the person for the most recent one rather than sending another.`,
    },
  ];
}

export function authStartWindows(sourceHash: string): readonly BudgetWindow[] {
  return [
    {
      bucket: BUCKETS.authStart,
      key: sourceHash,
      limit: AUTH_STARTS_PER_SOURCE_PER_HOUR,
      windowSeconds: 60 * 60,
      resource: "auth_starts_source",
      message: `This request source has asked for ${AUTH_STARTS_PER_SOURCE_PER_HOUR} sign-in codes in the last hour.`,
    },
  ];
}

function authVerifyFailureWindow(sourceHash: string): BudgetWindow {
  return {
    bucket: BUCKETS.authVerifyFailure,
    key: sourceHash,
    limit: AUTH_VERIFY_FAILURES_PER_SOURCE_PER_HOUR,
    windowSeconds: 60 * 60,
    resource: "auth_verify_failures_source",
    message: "Too many wrong codes from this request source. Ask the person to request a fresh one and try again later.",
  };
}

/**
 * Wrong codes for one address. The window is the code lifetime: once the code expires there is
 * nothing left to guess, and carrying failures over would lock out the person's fresh code.
 */
function authVerifyFailureEmailWindow(emailHash: string): BudgetWindow {
  return {
    bucket: BUCKETS.authVerifyFailureEmail,
    key: emailHash,
    limit: AUTH_VERIFY_FAILURES_PER_EMAIL,
    windowSeconds: CODE_TTL_SECONDS,
    resource: "auth_verify_failures_email",
    message: "Too many wrong codes for that address. Ask the person to request a fresh code and read it back carefully.",
  };
}

/** The source and address capacities charged by one code verification. */
export function authVerifyFailureWindows(
  sourceHash: string,
  emailHash: string,
): readonly [BudgetWindow, BudgetWindow] {
  return [
    authVerifyFailureWindow(sourceHash),
    authVerifyFailureEmailWindow(emailHash),
  ];
}

/* --------------------------------------------------------------- sweeping */

/** Retention for counted events: the widest window plus an hour of slack. */
export const RATE_LIMIT_EVENT_RETENTION_MS = (Math.max(
  ...[
    ...staticMintWindows("sweep"),
    ...authStartEmailWindows("sweep"),
    ...authStartWindows("sweep"),
    authVerifyFailureWindow("sweep"),
    authVerifyFailureEmailWindow("sweep"),
  ].map((window) => window.windowSeconds),
) + 60 * 60) * 1000;

/** Delete events no window can still see. `measure` never deletes, so it cannot widen a budget. */
export async function sweepRateLimitEvents(
  { now = new Date(), retentionMs = RATE_LIMIT_EVENT_RETENTION_MS }: {
    now?: Date;
    retentionMs?: number;
  } = {},
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionMs);
  let removed = 0;
  for (;;) {
    // Bounded batches so a backlog cannot hold one long lock.
    const result = await getDb().execute(sql`
      delete from ${schema.rateLimitEvents}
      where ctid in (
        select ctid from ${schema.rateLimitEvents}
        where ${schema.rateLimitEvents.createdAt} < ${cutoff}
        limit ${SWEEP_BATCH}
      )
    `);
    const deleted = result.rowCount ?? 0;
    removed += deleted;
    if (deleted < SWEEP_BATCH) return removed;
  }
}

/** `namespace_usage` retention. Only the daily write cap reads it, for today; a week is slack. */
export const NAMESPACE_USAGE_RETENTION_MS = 7 * 24 * 60 * 60_000;

/** How many rows one sweep statement removes. */
const SWEEP_BATCH = 10_000;

/** Delete days of write accounting older than the retention. */
export async function sweepNamespaceUsage(
  { now = new Date(), retentionMs = NAMESPACE_USAGE_RETENTION_MS }: {
    now?: Date;
    retentionMs?: number;
  } = {},
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionMs).toISOString().slice(0, 10);
  let removed = 0;
  for (;;) {
    const result = await getDb().execute(sql`
      delete from ${schema.namespaceUsage}
      where ctid in (
        select ctid from ${schema.namespaceUsage}
        where ${schema.namespaceUsage.day} < ${cutoff}
        limit ${SWEEP_BATCH}
      )
    `);
    const deleted = result.rowCount ?? 0;
    removed += deleted;
    if (deleted < SWEEP_BATCH) return removed;
  }
}
