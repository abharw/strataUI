// The sign-in code budgets and their sweep. Counting never deletes; only the sweep removes rows.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { getDb, schema } from "@/server/db";

import {
  authVerifyFailureWindows,
  AUTH_VERIFY_FAILURES_PER_EMAIL,
  BUCKETS,
  NAMESPACE_USAGE_RETENTION_MS,
  RateLimited,
  RATE_LIMIT_EVENT_RETENTION_MS,
  reserveFailureBudgets,
  sweepRateLimitEvents,
} from "./rate-limit";

const db = getDb();
const startedAt = new Date();

afterEach(async () => {
  await db
    .delete(schema.rateLimitEvents)
    .where(sql`${schema.rateLimitEvents.createdAt} >= ${startedAt}`);
});

function key(): string {
  return `rate-limit-test-${randomBytes(8).toString("hex")}`;
}

describe("the wrong-code budgets", () => {
  it("counts one address's failures whatever source they arrive from", async () => {
    const emailHash = key();

    for (let n = 0; n < AUTH_VERIFY_FAILURES_PER_EMAIL; n += 1) {
      await reserveFailureBudgets(authVerifyFailureWindows(key(), emailHash));
    }

    // Many sources against one address, which the per-source budget does not bound.
    await expect(reserveFailureBudgets(authVerifyFailureWindows(key(), emailHash)))
      .rejects.toBeInstanceOf(RateLimited);
    const otherAddressReservation = await reserveFailureBudgets(
      authVerifyFailureWindows(key(), key()),
    );
    expect(otherAddressReservation.eventIds).toHaveLength(2);
  });

  it("keeps the two buckets apart, so neither spends the other", async () => {
    const shared = key();
    await db.insert(schema.rateLimitEvents).values({
      bucket: BUCKETS.authVerifyFailureEmail,
      key: shared,
      createdAt: new Date(),
    });
    for (let n = 0; n < AUTH_VERIFY_FAILURES_PER_EMAIL; n += 1) {
      await db.insert(schema.rateLimitEvents).values({
        bucket: BUCKETS.authVerifyFailure,
        key: shared,
        createdAt: new Date(),
      });
    }

    const emailReservation = await reserveFailureBudgets(authVerifyFailureWindows(key(), shared));
    const sourceReservation = await reserveFailureBudgets(authVerifyFailureWindows(shared, key()));
    expect(emailReservation.eventIds).toHaveLength(2);
    expect(sourceReservation.eventIds).toHaveLength(2);
  });

  it("widens the retention window by construction when a budget is added", () => {
    expect(RATE_LIMIT_EVENT_RETENTION_MS).toBeGreaterThan(60 * 60 * 1000);
    expect(NAMESPACE_USAGE_RETENTION_MS).toBeGreaterThan(24 * 60 * 60 * 1000);
  });
});

describe("sweeping counted events", () => {
  it("removes what no window can still see and keeps what one can", async () => {
    const bucket = key();
    const stale = new Date(Date.now() - RATE_LIMIT_EVENT_RETENTION_MS - 60_000);
    await db.insert(schema.rateLimitEvents).values([
      { bucket, key: "stale", createdAt: stale },
      { bucket, key: "fresh", createdAt: new Date() },
    ]);

    // The count is read from `rowCount`.
    expect(await sweepRateLimitEvents()).toBeGreaterThanOrEqual(1);

    const left = await db
      .select({ key: schema.rateLimitEvents.key })
      .from(schema.rateLimitEvents)
      .where(eq(schema.rateLimitEvents.bucket, bucket));
    expect(left.map((row) => row.key)).toEqual(["fresh"]);
  });
});
