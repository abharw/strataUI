/**
 * Sign-in actions: no account enumeration on the email step, a usable `__Host-` cookie after
 * verify, and no open redirect via `?next=`. Cross-site posts are rejected by Next.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

interface StoredCookie { value: string; options: Record<string, unknown> }

const jar = vi.hoisted(() => new Map<string, { value: string; options: Record<string, unknown> }>());
const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
const magic = vi.hoisted((): { current: import("@/server/auth/workos").MagicAuth } => ({
  current: {
    async start() {},
    async verify() {
      return { userId: "", email: "" };
    },
  },
}));
const landings = vi.hoisted(() => [] as string[]);

vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
  cookies: async () => ({
    get: (name: string) => {
      const found = jar.get(name);
      return found === undefined ? undefined : { name, value: found.value };
    },
    set: (name: string, value: string, options: Record<string, unknown>) => {
      jar.set(name, { value, options });
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    landings.push(path);
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock("@/server/auth/workos", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/auth/workos")>(),
  workosMagicAuth: () => magic.current,
}));

import { getDb, schema } from "@/server/db";
import { resolveOwnerSession } from "@/server/auth/owner-session";
import { WEB_SESSION_COOKIE } from "@/server/auth/session-cookie";
import { MagicAuthError, type MagicAuth } from "@/server/auth/workos";
import { AUTH_STARTS_PER_EMAIL_PER_HOUR } from "@/server/credentials/provision/rate-limit";

import { openStrata, resendSignInCode, sendSignInCode } from "./actions";

const db = getDb();
const userIds: string[] = [];
const startedAt = new Date();

beforeEach(() => {
  jar.clear();
  landings.length = 0;
  requestHeaders.current = new Headers({ "x-real-ip": source(), "user-agent": "vitest" });
});

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

function source(): string {
  return `203.0.113.${Math.floor(Math.random() * 200) + 1}:${randomBytes(4).toString("hex")}`;
}

function identity(): { userId: string; email: string } {
  const handle = randomBytes(6).toString("hex");
  const userId = `user_test_${handle}`;
  userIds.push(userId);
  return { userId, email: `katherine+${handle}@strata.test` };
}

function accepting(who: { userId: string; email: string }): MagicAuth {
  return {
    async start() {},
    async verify() {
      return who;
    },
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

async function landing(run: Promise<unknown>): Promise<string | null> {
  try {
    await run;
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.startsWith("NEXT_REDIRECT:")) throw error;
    return message.slice("NEXT_REDIRECT:".length);
  }
}

function sessionCookie(): StoredCookie | undefined {
  return jar.get(WEB_SESSION_COOKIE);
}

describe("sendSignInCode", () => {
  it("sends the person to the code step, carrying the address it asked about", async () => {
    const who = identity();
    magic.current = accepting(who);

    const to = await landing(sendSignInCode(null, form({ email: who.email.toUpperCase() })));

    expect(to).not.toBeNull();
    const url = new URL(to!, "https://strata.test");
    expect(url.pathname).toBe("/home/sign-in");
    expect(url.searchParams.get("stage")).toBe("code");
    // Normalized to lowercase.
    expect(url.searchParams.get("email")).toBe(who.email);
    expect(sessionCookie()).toBeUndefined();
  });

  it("answers a bad address in place rather than navigating anywhere", async () => {
    magic.current = accepting(identity());
    await expect(sendSignInCode(null, form({ email: "not-an-address" })))
      .resolves.toEqual({ failure: "invalid_email" });
    expect(landings).toEqual([]);
  });

  it("says only that it could not send, for an address the provider refuses", async () => {
    magic.current = {
      async start() {
        throw new MagicAuthError("undeliverable_email");
      },
      async verify() {
        throw new MagicAuthError("invalid_code");
      },
    };
    // Known and unknown addresses get the same answer (no membership oracle).
    await expect(sendSignInCode(null, form({ email: "someone@nowhere.invalid" })))
      .resolves.toEqual({ failure: "invalid_email" });
  });
});

describe("resendSignInCode", () => {
  it("sends to the same normalized address and stays on the code step", async () => {
    const who = identity();
    const start = vi.fn(async () => {});
    magic.current = { ...accepting(who), start };

    await expect(resendSignInCode(null, form({ email: who.email.toUpperCase(), next: "/home?tab=recent" })))
      .resolves.toEqual({ sent: true });
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ email: who.email }));
    expect(landings).toEqual([]);
    expect(sessionCookie()).toBeUndefined();
  });

  it("shares the initial send quota and reports a retryable failure in place", async () => {
    const who = identity();
    const start = vi.fn(async () => {});
    magic.current = { ...accepting(who), start };

    await landing(sendSignInCode(null, form({ email: who.email })));
    landings.length = 0;
    for (let sent = 1; sent < AUTH_STARTS_PER_EMAIL_PER_HOUR; sent += 1) {
      await expect(resendSignInCode(null, form({ email: who.email })))
        .resolves.toEqual({ sent: true });
    }
    await expect(resendSignInCode(null, form({ email: who.email })))
      .resolves.toEqual({ failure: "rate_limited" });
    expect(start).toHaveBeenCalledTimes(AUTH_STARTS_PER_EMAIL_PER_HOUR);
    expect(landings).toEqual([]);
  });

  it("keeps provider failures on the code step without claiming a send", async () => {
    magic.current = {
      ...accepting(identity()),
      async start() { throw new MagicAuthError("unavailable"); },
    };
    await expect(resendSignInCode(null, form({ email: identity().email })))
      .resolves.toEqual({ failure: "unavailable" });
    expect(landings).toEqual([]);
  });
});

describe("openStrata", () => {
  it("opens an owner session for this browser and sends it Home", async () => {
    const who = identity();
    magic.current = accepting(who);

    const to = await landing(openStrata(null, form({ email: who.email, code: "123456" })));
    expect(to).toBe("/home");

    const cookie = sessionCookie();
    expect(cookie).toBeDefined();
    expect(cookie!.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    // `__Host-` cookies must not set Domain.
    expect(cookie!.options).not.toHaveProperty("domain");

    const session = await resolveOwnerSession(cookie!.value);
    expect(session).not.toBeNull();

    const [row] = await db
      .select()
      .from(schema.ownerSessions)
      .where(eq(schema.ownerSessions.id, session!.id));
    expect(row.namespaceId).toBe(session!.namespaceId);
    expect(row.revokedAt).toBeNull();
  });

  it("ends the session this browser already held, rather than stacking a second", async () => {
    const who = identity();
    magic.current = accepting(who);

    await landing(openStrata(null, form({ email: who.email, code: "123456" })));
    const held = sessionCookie()!.value;

    await landing(openStrata(null, form({ email: who.email, code: "123456" })));
    const now = sessionCookie()!.value;

    expect(now).not.toBe(held);
    // Re-signing in revokes the previous session on this browser.
    await expect(resolveOwnerSession(held)).resolves.toBeNull();
    await expect(resolveOwnerSession(now)).resolves.not.toBeNull();
  });

  it("honours a same-origin ?next= and discards anything else", async () => {
    const wanted = identity();
    magic.current = accepting(wanted);
    const landed = await landing(openStrata(null, form({
      email: wanted.email,
      code: "123456",
      next: "/pages/6f1d6f4a-0000-4000-8000-000000000000",
    })));
    expect(landed).toBe("/pages/6f1d6f4a-0000-4000-8000-000000000000");

    const elsewhere = identity();
    magic.current = accepting(elsewhere);
    const dropped = await landing(openStrata(null, form({
      email: elsewhere.email,
      code: "123456",
      // Protocol-relative URLs resolve to another host.
      next: "//evil.example/steal",
    })));
    expect(dropped).toBe("/home");
  });

  it("keeps the screen where it is, and mints nothing, when the code is wrong", async () => {
    const who = identity();
    magic.current = {
      async start() {},
      async verify() {
        throw new MagicAuthError("invalid_code");
      },
    };

    await expect(openStrata(null, form({
      email: who.email,
      code: "000000",
      next: "/home?tab=recent",
    }))).resolves.toEqual({ failure: "invalid_code" });
    expect(landings).toEqual([]);
    expect(sessionCookie()).toBeUndefined();
  });

  it("refuses a code that is not one before it reaches the provider", async () => {
    const who = identity();
    let asked = false;
    magic.current = {
      async start() {},
      async verify() {
        asked = true;
        return who;
      },
    };

    await expect(openStrata(null, form({ email: who.email, code: "" })))
      .resolves.toEqual({ failure: "invalid_code" });
    expect(asked).toBe(false);
  });
});
