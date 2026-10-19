/**
 * Email sign-in handlers: `start` is no membership oracle, one WorkOS user is one namespace, and
 * each provider refusal maps to its error. `MagicAuth` is an object literal, so no network.
 */
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { getDb, schema } from "@/server/db";
import { MagicAuthError, type MagicAuth } from "./workos";
import {
  AUTH_VERIFY_FAILURES_PER_EMAIL,
  AUTH_VERIFY_FAILURES_PER_SOURCE_PER_HOUR,
  BUCKETS,
} from "@/server/credentials/provision/rate-limit";

import { start, verify, verifySignIn } from "./handlers";

const db = getDb();
const userIds: string[] = [];
const startedAt = new Date();

afterEach(async () => {
  if (userIds.length > 0) {
    await db
      .delete(schema.namespaces)
      .where(inArray(schema.namespaces.workosUserId, userIds.splice(0)));
  }
  await db
    .delete(schema.rateLimitEvents)
    .where(sql`${schema.rateLimitEvents.createdAt} >= ${startedAt}`);
});

/** A fresh pseudonym per case, so one test's budget is never another's. */
function source(): string {
  return `source-${randomBytes(12).toString("hex")}`;
}

/** A fresh address per case, so one test's per-address budget is never another's. */
function address(): string {
  return `ada.lovelace+${randomBytes(6).toString("hex")}@strata.test`;
}

/** An identity nobody else in this file will collide with. */
function identity(): { userId: string; email: string } {
  const handle = randomBytes(6).toString("hex");
  const userId = `user_test_${handle}`;
  userIds.push(userId);
  return { userId, email: `ada.lovelace+${handle}@strata.test` };
}

/** A provider that always says yes, and records what it was asked. */
function accepting(who: { userId: string; email: string }): MagicAuth & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    async start(input) {
      sent.push(input.email);
    },
    async verify() {
      return who;
    },
  };
}

/** A provider that always refuses, with one translated failure. */
function refusing(error: MagicAuthError): MagicAuth {
  return {
    async start() {
      throw error;
    },
    async verify() {
      throw error;
    },
  };
}

interface BlockingInvalidCodeMagic extends MagicAuth {
  readonly calls: number;
  waitUntilCapacity(): Promise<void>;
  release(): void;
}

/** Hold the provider response until every locally permitted call has arrived. */
function blockingInvalidCode(capacity: number): BlockingInvalidCodeMagic {
  let calls = 0;
  let reportCapacity: (() => void) | undefined;
  let releaseProvider: (() => void) | undefined;
  const capacityReached = new Promise<void>((resolve) => {
    reportCapacity = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });

  return {
    get calls() {
      return calls;
    },
    waitUntilCapacity() {
      return capacityReached;
    },
    release() {
      releaseProvider?.();
    },
    async start() {},
    async verify() {
      calls += 1;
      if (calls === capacity) reportCapacity?.();
      await released;
      throw new MagicAuthError("invalid_code");
    },
  };
}

async function namespaceFor(userId: string) {
  const [row] = await db
    .select()
    .from(schema.namespaces)
    .where(eq(schema.namespaces.workosUserId, userId));
  return row;
}

describe("POST /v1/auth/start", () => {
  it("answers the same bytes for an address it knows and one it has never seen", async () => {
    const known = identity();
    const magic = accepting(known);
    // Make the first address real: it now owns a namespace.
    await verify(
      { email: known.email, code: "123456", driver: "instinct", source_hash: source() },
      magic,
    );

    const first = await start(
      { email: known.email, driver: "instinct", source_hash: source() },
      magic,
    );
    const second = await start(
      { email: `nobody-${randomBytes(6).toString("hex")}@strata.test`, driver: "instinct", source_hash: source() },
      magic,
    );

    expect(first.status).toBe(202);
    expect(JSON.stringify(second.body)).toBe(JSON.stringify(first.body));
    expect(first.body.next).toEqual(["verify_auth"]);
    expect(first.body.expires_in).toBe(600);
  });

  it("refuses an unknown driver before anybody is emailed", async () => {
    const magic = accepting(identity());
    const result = await start(
      { email: "someone@strata.test", driver: "not-a-driver", source_hash: source() },
      magic,
    );

    expect(result.status).toBe(422);
    expect(result.body.code).toBe("invalid_driver");
    expect(magic.sent).toEqual([]);
  });

  it("says so when no code can ever arrive", async () => {
    const result = await start(
      { email: "someone@nowhere.invalid", driver: "instinct", source_hash: source() },
      refusing(new MagicAuthError("undeliverable_email")),
    );

    expect(result.status).toBe(422);
    expect(result.body.code).toBe("invalid_email");
    expect(result.body.path).toBe("/email");
  });

  it("renders the provider's own throttle as a budget the caller can act on", async () => {
    const result = await start(
      { email: "someone@strata.test", driver: "instinct", source_hash: source() },
      refusing(new MagicAuthError("rate_limited", 30)),
    );

    expect(result.status).toBe(429);
    expect(result.body.code).toBe("rate_limited");
    expect(result.headers?.["Retry-After"]).toBe("30");
  });

  it("lets a provider fault become the 500 it is, rather than a lie", async () => {
    await expect(start(
      { email: "someone@strata.test", driver: "instinct", source_hash: source() },
      refusing(new MagicAuthError("unavailable")),
    )).rejects.toBeInstanceOf(MagicAuthError);
  });

  it("charges the address's budget before the request source's", async () => {
    const magic = accepting(identity());
    const email = `budget-${randomBytes(6).toString("hex")}@strata.test`;
    await start({ email, driver: "instinct", source_hash: source() }, magic);

    const [counted] = await db
      .select({ bucket: schema.rateLimitEvents.bucket, key: schema.rateLimitEvents.key })
      .from(schema.rateLimitEvents)
      .where(eq(schema.rateLimitEvents.bucket, BUCKETS.authStartEmail));
    expect(counted).toBeDefined();
    // A digest, never the address: these rows outlive the request.
    expect(counted.key).toMatch(/^[0-9a-f]{64}$/);
    expect(counted.key).not.toContain("@");
  });
});

describe("POST /v1/auth/verify", () => {
  it("creates one Strata the first time and opens it every time after", async () => {
    const who = identity();
    const magic = accepting(who);

    const first = await verify(
      { email: who.email, code: "123456", driver: "instinct", source_hash: source() },
      magic,
    );
    const second = await verify(
      { email: who.email, code: "654321", driver: "chatgpt", source_hash: source() },
      magic,
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.namespace_id).toBe(first.body.namespace_id);

    // Two grants on one Strata: the second verify opened the existing one.
    const grants = await db
      .select()
      .from(schema.grants)
      .where(eq(schema.grants.namespaceId, first.body.namespace_id as string));
    expect(grants).toHaveLength(2);
    expect(grants.map((grant) => grant.driver).sort()).toEqual(["chatgpt", "instinct"]);
    expect(grants.every((grant) => grant.issuedByGrantId === null)).toBe(true);
  });

  it("anchors the Strata to the WorkOS user id and the address", async () => {
    const who = identity();
    await verify(
      { email: who.email, code: "123456", driver: "instinct", source_hash: source() },
      accepting(who),
    );

    const row = await namespaceFor(who.userId);
    expect(row.email).toBe(who.email);
    // Nothing named it, and an email local part is not a name.
    expect(row.displayName).toBe("Your Strata");
  });

  it("names the Strata and the person from person_name, and only on creation", async () => {
    const who = identity();
    const created = await verify(
      {
        email: who.email,
        code: "123456",
        driver: "instinct",
        person_name: "Ada",
        source_hash: source(),
      },
      accepting(who),
    );
    expect(created.body.namespace_display_name).toBe("Ada's Strata");
    expect((await namespaceFor(who.userId)).personName).toBe("Ada");

    // A later agent for the same person changes no names.
    await verify(
      {
        email: who.email,
        code: "123456",
        driver: "chatgpt",
        person_name: "Grace",
        display_name: "Something Else",
        source_hash: source(),
      },
      accepting(who),
    );
    const row = await namespaceFor(who.userId);
    expect(row.personName).toBe("Ada");
    expect(row.displayName).toBe("Ada's Strata");
  });

  it("lets display_name override the name person_name would have given", async () => {
    const who = identity();
    const created = await verify(
      {
        email: who.email,
        code: "123456",
        driver: "instinct",
        person_name: "Ada",
        display_name: "The Lovelace Works",
        source_hash: source(),
      },
      accepting(who),
    );
    expect(created.body.namespace_display_name).toBe("The Lovelace Works");
    // Both are recorded: one names the Strata, the other names the person.
    expect((await namespaceFor(who.userId)).personName).toBe("Ada");
  });

  it("names the Strata what the creating agent was told, and only then", async () => {
    const who = identity();
    const created = await verify(
      {
        email: who.email,
        code: "123456",
        driver: "instinct",
        display_name: "Ada's Strata",
        source_hash: source(),
      },
      accepting(who),
    );
    expect(created.body.namespace_display_name).toBe("Ada's Strata");

    // A second agent for the same person names nothing: the Strata exists.
    const later = await verify(
      {
        email: who.email,
        code: "123456",
        driver: "chatgpt",
        display_name: "Something Else",
        source_hash: source(),
      },
      accepting(who),
    );
    expect(later.body.namespace_display_name).toBe("Ada's Strata");
    expect((await namespaceFor(who.userId)).displayName).toBe("Ada's Strata");
  });

  it("hands back the credential body every issuing door returns, naming the Strata", async () => {
    const who = identity();
    const result = await verify(
      { email: who.email, code: "123456", driver: "instinct", label: "Ada's laptop", source_hash: source() },
      accepting(who),
    );

    expect(Object.keys(result.body)[0]).toBe("warnings");
    expect(result.body).toMatchObject({
      label: "Ada's laptop",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "pages:read pages:write namespace:pair",
      next: ["get_guide", "get_manifest", "put_page"],
    });
    expect(result.body.namespace_display_name).toBe("Your Strata");
    expect(result.body.access_token).toMatch(/^sw_/);
    expect(result.body.refresh_token).toMatch(/^sr_/);
  });

  it("maps every provider refusal to its row of the error table", async () => {
    const cases: readonly [MagicAuthError, number, string][] = [
      [new MagicAuthError("invalid_code"), 400, "invalid_code"],
      [new MagicAuthError("undeliverable_email"), 400, "invalid_code"],
      [new MagicAuthError("rate_limited", 12), 429, "rate_limited"],
    ];
    for (const [error, status, code] of cases) {
      const result = await verify(
        { email: "someone@strata.test", code: "000000", driver: "instinct", source_hash: source() },
        refusing(error),
      );
      expect(result.status, code).toBe(status);
      expect(result.body.code, code).toBe(code);
    }

    await expect(verify(
      { email: "someone@strata.test", code: "000000", driver: "instinct", source_hash: source() },
      refusing(new MagicAuthError("unavailable")),
    )).rejects.toBeInstanceOf(MagicAuthError);
  });

  it("cuts a guesser off once its wrong codes are spent", async () => {
    const sourceHash = source();
    const magic = refusing(new MagicAuthError("invalid_code"));
    // A fresh address each time, so the source budget is what is spent.
    const attempt = () => verify(
      { email: address(), code: "000000", driver: "instinct", source_hash: sourceHash },
      magic,
    );

    for (let n = 0; n < AUTH_VERIFY_FAILURES_PER_SOURCE_PER_HOUR; n += 1) {
      expect((await attempt()).status).toBe(400);
    }

    const cut = await attempt();
    expect(cut.status).toBe(429);
    expect(cut.body.code).toBe("rate_limited");
    expect(cut.headers?.["Retry-After"]).toBeDefined();
  });

  it("cuts a botnet off once one address has collected its wrong codes", async () => {
    const email = address();
    const magic = refusing(new MagicAuthError("invalid_code"));
    // A fresh source each time: many sources against one address.
    const attempt = () => verify(
      { email, code: "000000", driver: "instinct", source_hash: source() },
      magic,
    );

    for (let n = 0; n < AUTH_VERIFY_FAILURES_PER_EMAIL; n += 1) {
      expect((await attempt()).status).toBe(400);
    }

    const cut = await attempt();
    expect(cut.status).toBe(429);
    expect(cut.body.code).toBe("rate_limited");

    // Another address is untouched.
    const other = await verify(
      { email: address(), code: "000000", driver: "instinct", source_hash: source() },
      magic,
    );
    expect(other.status).toBe(400);
  });

  it("reserves an address's wrong-code capacity before concurrent agent checks", async () => {
    const email = address();
    const magic = blockingInvalidCode(AUTH_VERIFY_FAILURES_PER_EMAIL);
    const attempts = Array.from(
      { length: AUTH_VERIFY_FAILURES_PER_EMAIL + 3 },
      () => verify(
        { email, code: "000000", driver: "instinct", source_hash: source() },
        magic,
      ),
    );

    await magic.waitUntilCapacity();
    magic.release();
    const results = await Promise.all(attempts);

    expect(magic.calls).toBe(AUTH_VERIFY_FAILURES_PER_EMAIL);
    expect(results.filter((result) => result.status === 400)).toHaveLength(AUTH_VERIFY_FAILURES_PER_EMAIL);
    expect(results.filter((result) => result.status === 429)).toHaveLength(3);
  });

  it("never charges a failure for a code the provider accepted", async () => {
    const who = identity();
    const sourceHash = source();
    await verify(
      { email: who.email, code: "123456", driver: "instinct", source_hash: sourceHash },
      accepting(who),
    );

    const failures = await db
      .select()
      .from(schema.rateLimitEvents)
      .where(eq(schema.rateLimitEvents.bucket, BUCKETS.authVerifyFailure));
    expect(failures.filter((row) => row.key === sourceHash)).toEqual([]);
  });
});

describe("browser sign-in verification", () => {
  it("reserves an address's wrong-code capacity before concurrent browser checks", async () => {
    const email = address();
    const magic = blockingInvalidCode(AUTH_VERIFY_FAILURES_PER_EMAIL);
    const attempts = Array.from(
      { length: AUTH_VERIFY_FAILURES_PER_EMAIL + 3 },
      () => verifySignIn({ email, code: "000000", sourceHash: source() }, magic),
    );

    await magic.waitUntilCapacity();
    magic.release();
    const results = await Promise.all(attempts);

    expect(magic.calls).toBe(AUTH_VERIFY_FAILURES_PER_EMAIL);
    expect(results.filter((result) => !result.ok && result.failure === "invalid_code"))
      .toHaveLength(AUTH_VERIFY_FAILURES_PER_EMAIL);
    expect(results.filter((result) => !result.ok && result.failure === "rate_limited")).toHaveLength(3);
  });

  it("returns a reserved slot when the provider is unavailable", async () => {
    const sourceHash = source();
    const result = await verifySignIn(
      { email: address(), code: "000000", sourceHash },
      refusing(new MagicAuthError("unavailable")),
    );

    expect(result).toEqual({ ok: false, failure: "unavailable", retryAfterSeconds: undefined });
    const failures = await db
      .select()
      .from(schema.rateLimitEvents)
      .where(eq(schema.rateLimitEvents.bucket, BUCKETS.authVerifyFailure));
    expect(failures.filter((row) => row.key === sourceHash)).toEqual([]);
  });
});
