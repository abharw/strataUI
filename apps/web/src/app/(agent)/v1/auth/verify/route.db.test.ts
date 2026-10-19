// Wire-level checks: the full credential body in order, and per-source code-guessing limits.
import { afterEach, describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { getDb, schema } from "@/server/db";
import { MagicAuthError, type MagicAuth } from "@/server/auth/workos";
import {
  AUTH_VERIFY_FAILURES_PER_EMAIL,
  AUTH_VERIFY_FAILURES_PER_SOURCE_PER_HOUR,
} from "@/server/credentials/provision/rate-limit";
import { jsonBody } from "@/test/json-body";

import { authVerifyPost } from "./route";

const BASE = "https://strata.test";
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

/** A fresh source per case so rate-limit budgets do not leak between tests. */
function source(): string {
  return `198.51.100.${Math.floor(Math.random() * 200) + 1}:${randomBytes(4).toString("hex")}`;
}

function identity(): { userId: string; email: string } {
  const handle = randomBytes(6).toString("hex");
  const userId = `user_test_${handle}`;
  userIds.push(userId);
  return { userId, email: `grace+${handle}@strata.test` };
}

function post(path: string, body: unknown, from: string = source()): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": from,
      "user-agent": "strata-tests/1",
    },
    body: JSON.stringify(body),
  });
}

function accepting(who: { userId: string; email: string }): MagicAuth {
  return {
    async start() {},
    async verify() {
      return who;
    },
  };
}

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

describe("POST /v1/auth/verify", () => {
  it("returns the §4.1 credential body, whole, warnings first", async () => {
    const who = identity();
    const verified = await authVerifyPost({ magic: () => accepting(who) })(
      post("/v1/auth/verify", {
        email: who.email,
        code: "123456",
        driver: "instinct",
        person_name: "Grace",
      }),
    );
    const fromEmail = await jsonBody(verified);

    expect(verified.status).toBe(201);
    // Key order is part of the contract: a model reads the top of an object first.
    expect(Object.keys(fromEmail)).toEqual([
      "warnings",
      "namespace_id",
      "namespace_display_name",
      "grant_id",
      "label",
      "access_token",
      "refresh_token",
      "token_type",
      "expires_in",
      "scope",
      "next",
      "contract_version",
    ]);
    // A newly created Strata is named from `person_name`.
    expect(fromEmail.namespace_display_name).toBe("Grace's Strata");
    expect(fromEmail.token_type).toBe("Bearer");
    expect(verified.headers.get("cache-control")).toContain("no-store");
    expect(verified.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("refuses a body that is not this endpoint's", async () => {
    const who = identity();
    const handler = authVerifyPost({ magic: () => accepting(who) });

    const badEmail = await handler(
      post("/v1/auth/verify", { email: "not-an-address", code: "123456", driver: "instinct" }),
    );
    expect(badEmail.status).toBe(422);
    expect((await jsonBody(badEmail)).path).toBe("/email");

    const extra = await handler(
      post("/v1/auth/verify", { email: who.email, code: "123456", driver: "instinct", scope: "all" }),
    );
    expect(extra.status).toBe(422);

    const blankName = await handler(
      post("/v1/auth/verify", { email: who.email, code: "123456", driver: "instinct", display_name: "   " }),
    );
    expect(blankName.status).toBe(422);
    expect((await jsonBody(blankName)).path).toBe("/display_name");

    const blankPerson = await handler(
      post("/v1/auth/verify", { email: who.email, code: "123456", driver: "instinct", person_name: " " }),
    );
    expect(blankPerson.status).toBe(422);
    expect((await jsonBody(blankPerson)).path).toBe("/person_name");

    const longPerson = await handler(
      post("/v1/auth/verify", { email: who.email, code: "123456", driver: "instinct", person_name: "n".repeat(81) }),
    );
    expect(longPerson.status).toBe(422);
    expect((await jsonBody(longPerson)).path).toBe("/person_name");

    const query = await handler(
      post("/v1/auth/verify?debug=1", { email: who.email, code: "123456", driver: "instinct" }),
    );
    expect(query.status).toBe(422);
    expect((await jsonBody(query)).code).toBe("unknown_parameter");
  });

  it("cuts one request source off after its wrong codes are spent", async () => {
    const from = source();
    const handler = authVerifyPost({ magic: () => refusing(new MagicAuthError("invalid_code")) });
    // A fresh email each time, so only the per-source budget is spent.
    const attempt = () => handler(
      post("/v1/auth/verify", { email: identity().email, code: "000000", driver: "instinct" }, from),
    );

    for (let n = 0; n < AUTH_VERIFY_FAILURES_PER_SOURCE_PER_HOUR; n += 1) {
      const wrong = await attempt();
      expect(wrong.status).toBe(400);
      expect((await jsonBody(wrong)).code).toBe("invalid_code");
    }

    const cut = await attempt();
    expect(cut.status).toBe(429);
    expect(cut.headers.get("Retry-After")).not.toBeNull();

    const other = await handler(
      post("/v1/auth/verify", { email: identity().email, code: "000000", driver: "instinct" }),
    );
    expect(other.status).toBe(400);
  });

  it("cuts every source off once one address has collected its wrong codes", async () => {
    const who = identity();
    const handler = authVerifyPost({ magic: () => refusing(new MagicAuthError("invalid_code")) });
    // A fresh source each request, so only the per-email budget applies.
    const attempt = () => handler(
      post("/v1/auth/verify", { email: who.email, code: "000000", driver: "instinct" }),
    );

    for (let n = 0; n < AUTH_VERIFY_FAILURES_PER_EMAIL; n += 1) {
      expect((await attempt()).status).toBe(400);
    }

    const cut = await attempt();
    expect(cut.status).toBe(429);
    expect(cut.headers.get("Retry-After")).not.toBeNull();
  });

  it("renders a provider fault as an internal error that leaks nothing", async () => {
    const response = await authVerifyPost({
      magic: () => refusing(new MagicAuthError("unavailable")),
    })(post("/v1/auth/verify", { email: "grace@strata.test", code: "000000", driver: "instinct" }));

    expect(response.status).toBe(500);
    const body = await jsonBody(response);
    expect(body.code).toBe("internal_error");
    expect(JSON.stringify(body)).not.toMatch(/workos/i);
  });
});
