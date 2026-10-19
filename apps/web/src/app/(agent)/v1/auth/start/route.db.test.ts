// The response must not reveal whether the address has a Strata or which identity provider is used.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { getDb, schema } from "@/server/db";
import { MagicAuthError, type MagicAuth } from "@/server/auth/workos";
import { CONTRACT_HEADER, CONTRACT_VERSION } from "@/shared/api/version";
import { AUTH_STARTS_PER_EMAIL_PER_HOUR } from "@/server/credentials/provision/rate-limit";
import { jsonBody } from "@/test/json-body";

import { authStartPost } from "./route";

const BASE = "https://strata.test";
const db = getDb();
const startedAt = new Date();

afterEach(async () => {
  await db
    .delete(schema.rateLimitEvents)
    .where(sql`${schema.rateLimitEvents.createdAt} >= ${startedAt}`);
});

function source(): string {
  return `198.51.100.${Math.floor(Math.random() * 200) + 1}:${randomBytes(4).toString("hex")}`;
}

function address(): string {
  return `alan+${randomBytes(6).toString("hex")}@strata.test`;
}

function post(body: unknown, from: string = source()): Request {
  return new Request(`${BASE}/v1/auth/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": from,
      [CONTRACT_HEADER]: CONTRACT_VERSION,
    },
    body: JSON.stringify(body),
  });
}

function recording(): MagicAuth & { asked: { email: string; ipAddress?: string }[] } {
  const asked: { email: string; ipAddress?: string }[] = [];
  return {
    asked,
    async start(input) {
      asked.push({ email: input.email, ipAddress: input.ipAddress });
    },
    async verify() {
      throw new MagicAuthError("invalid_code");
    },
  };
}

describe("POST /v1/auth/start", () => {
  it("accepts the address, lowercases it, and says only that a code is coming", async () => {
    const magic = recording();
    const from = source();
    const email = address();
    const response = await authStartPost({ magic: () => magic })(
      post({ email: ` ${email.toUpperCase()} `, driver: "instinct" }, from),
    );

    expect(response.status).toBe(202);
    const body = await jsonBody(response);
    expect(body).toMatchObject({ warnings: [], expires_in: 600, next: ["verify_auth"] });
    // No id, name, or hint about whether the address already has a Strata.
    expect(Object.keys(body).sort()).toEqual(
      ["contract_version", "expires_in", "interval", "next", "warnings"],
    );
    expect(magic.asked).toEqual([{ email, ipAddress: from }]);
  });

  it("refuses an address that is not one, without asking the provider", async () => {
    const magic = recording();
    const response = await authStartPost({ magic: () => magic })(
      post({ email: "not-an-address", driver: "instinct" }),
    );

    expect(response.status).toBe(422);
    expect((await jsonBody(response)).path).toBe("/email");
    expect(magic.asked).toEqual([]);
  });

  it("bounds how many codes one address can be sent, whoever asks", async () => {
    const magic = recording();
    const handler = authStartPost({ magic: () => magic });
    const email = address();

    for (let n = 0; n < AUTH_STARTS_PER_EMAIL_PER_HOUR; n += 1) {
      // A new source each time, so only the per-address budget is tested.
      const sent = await handler(post({ email, driver: "instinct" }));
      expect(sent.status).toBe(202);
    }

    const refused = await handler(post({ email, driver: "instinct" }));
    expect(refused.status).toBe(429);
    const body = await jsonBody(refused);
    expect(body.code).toBe("rate_limited");
    expect(body.resource).toBe("auth_starts_email");
    expect(refused.headers.get("Retry-After")).not.toBeNull();
    expect(magic.asked).toHaveLength(AUTH_STARTS_PER_EMAIL_PER_HOUR);

    expect((await handler(post({ email: address(), driver: "instinct" }))).status).toBe(202);
  });
});
