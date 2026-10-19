import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  resolveOwnerSession: vi.fn(),
}));
const cookieMocks = vi.hoisted(() => ({
  get: vi.fn(),
}));
const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  unstable_rethrow: vi.fn(),
}));

vi.mock("./owner-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./owner-session")>()),
  resolveOwnerSession: authMocks.resolveOwnerSession,
}));
vi.mock("next/headers", () => ({ cookies: async () => cookieMocks }));
vi.mock("next/navigation", () => navigationMocks);

import {
  readHomeData,
  requireWebSessionNamespace,
  WEB_SESSION_COOKIE,
} from "./web-session";

const originalPublicBaseUrl = process.env.PUBLIC_BASE_URL;
// A preview deployment mints links on its own hostname; neutralize it to test the canonical origin.
const originalVercelEnv = process.env.VERCEL_ENV;

beforeEach(() => {
  delete process.env.VERCEL_ENV;
  authMocks.resolveOwnerSession.mockReset();
  cookieMocks.get.mockReset();
  navigationMocks.notFound.mockClear();
  navigationMocks.unstable_rethrow.mockReset();
  process.env.PUBLIC_BASE_URL = "https://strata.test";
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalPublicBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = originalPublicBaseUrl;
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
});

describe("web-session DAL", () => {
  it("returns the namespace from a live database-backed session", async () => {
    const secret = `ows_${"s".repeat(43)}`;
    cookieMocks.get.mockReturnValue({ value: secret });
    authMocks.resolveOwnerSession
      .mockResolvedValue({ namespaceId: "namespace-id" });
    await expect(requireWebSessionNamespace())
      .resolves.toEqual({ namespaceId: "namespace-id" });
    expect(cookieMocks.get).toHaveBeenCalledWith(WEB_SESSION_COOKIE);
    expect(authMocks.resolveOwnerSession).toHaveBeenCalledWith(secret);
  });

  it("fails closed without a cookie and for a revoked session", async () => {
    cookieMocks.get.mockReturnValue(undefined);
    await expect(requireWebSessionNamespace()).rejects.toThrow("NEXT_NOT_FOUND");

    cookieMocks.get.mockReturnValue({ value: `ows_${"s".repeat(43)}` });
    authMocks.resolveOwnerSession.mockResolvedValue(null);
    await expect(requireWebSessionNamespace()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigationMocks.notFound).toHaveBeenCalledTimes(2);
  });

  it("never queries for a cookie that is not an owner-session secret", async () => {
    // `ows_` is the only session Strata issues; any other prefix is not a session.
    cookieMocks.get.mockReturnValue({ value: `dws_${"s".repeat(43)}` });
    await expect(requireWebSessionNamespace()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(authMocks.resolveOwnerSession).not.toHaveBeenCalled();
  });

  it("redacts a session database failure before failing closed", async () => {
    const secret = `ows_${"s".repeat(43)}`;
    const databaseError = Object.assign(
      new Error("connect postgresql://reader:super-secret@db.example/strata failed"),
      { code: "08006", query: "select session_hash from owner_sessions" },
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    cookieMocks.get.mockReturnValue({ value: secret });
    authMocks.resolveOwnerSession.mockRejectedValue(databaseError);

    await expect(requireWebSessionNamespace()).rejects.toThrow("NEXT_NOT_FOUND");

    expect(consoleError).toHaveBeenCalledWith(
      "home: web session resolution failed",
      {
        name: "Error",
        code: "08006",
        message: "connect postgres://[redacted] failed",
      },
    );
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain("super-secret");
    expect(logged).not.toContain("session_hash");
    expect(navigationMocks.notFound).toHaveBeenCalledOnce();
  });
});

describe("authenticated Home data error boundary", () => {
  it("logs only a redacted projection and throws a fresh sanitized error", async () => {
    const databaseError = Object.assign(
      new Error("query postgresql://reader:super-secret@db.example/strata failed"),
      { code: "XX000", query: "select * from private_pages" },
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const failure = await readHomeData(async () => {
      throw databaseError;
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBe(databaseError);
    expect(failure).toMatchObject({
      message: "Authenticated Home data could not be loaded.",
    });
    expect(failure).not.toHaveProperty("cause");
    expect(failure).not.toHaveProperty("query");
    expect(consoleError).toHaveBeenCalledWith(
      "home: authenticated data read failed",
      {
        name: "Error",
        code: "XX000",
        message: "query postgres://[redacted] failed",
      },
    );
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain("super-secret");
    expect(logged).not.toContain("private_pages");
  });

  it("preserves Next control-flow errors without logging or replacement", async () => {
    const nextError = new Error("NEXT_NOT_FOUND");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    navigationMocks.unstable_rethrow.mockImplementationOnce((error: unknown) => {
      throw error;
    });

    await expect(readHomeData(async () => {
      throw nextError;
    })).rejects.toBe(nextError);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
