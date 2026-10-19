/**
 * Deployment origin resolution. Failures are silent in production (links to someone else's host),
 * so the policy is pinned here. Pure: no database or server.
 */
import { afterEach, describe, expect, it } from "vitest";

import { baseUrl } from "./origin";

describe("baseUrl", () => {
  const NODE_ENV = process.env.NODE_ENV;
  const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;
  const VERCEL_ENV = process.env.VERCEL_ENV;
  const VERCEL_URL = process.env.VERCEL_URL;

  afterEach(() => {
    setEnv("NODE_ENV", NODE_ENV);
    setEnv("PUBLIC_BASE_URL", PUBLIC_BASE_URL);
    setEnv("VERCEL_ENV", VERCEL_ENV);
    setEnv("VERCEL_URL", VERCEL_URL);
  });

  /** `NODE_ENV` is readonly in the Next types. */
  function setEnv(key: string, value: string | undefined) {
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string | undefined>)[key] = value;
  }

  function request(headers: Record<string, string> = {}) {
    return new Request("https://internal.vercel.app/v1/pages", { headers });
  }

  it("uses PUBLIC_BASE_URL when it is set, whatever the headers claim", () => {
    setEnv("VERCEL_ENV", undefined);
    setEnv("PUBLIC_BASE_URL", "https://strata.example");
    expect(baseUrl(request({ "x-forwarded-host": "evil.example" }))).toBe(
      "https://strata.example",
    );
  });

  it("trims a trailing slash so two configurations mint one URL", () => {
    setEnv("VERCEL_ENV", undefined);
    setEnv("PUBLIC_BASE_URL", "https://strata.example/");
    expect(baseUrl(request())).toBe("https://strata.example");
  });

  it("canonicalizes host casing and default ports for exact credential audiences", () => {
    setEnv("VERCEL_ENV", undefined);
    setEnv("PUBLIC_BASE_URL", "https://STRATA.EXAMPLE:443/");
    expect(baseUrl(request())).toBe("https://strata.example");
  });

  it("refuses a configured path instead of publishing two deployment identities", () => {
    setEnv("VERCEL_ENV", undefined);
    setEnv("PUBLIC_BASE_URL", "https://strata.example/not-an-origin");
    expect(() => baseUrl(request())).toThrow(/origin with no path/);
  });

  it("mints preview links on the Vercel deployment instead of production", () => {
    setEnv("VERCEL_ENV", "preview");
    setEnv("VERCEL_URL", "strata-preview-123.vercel.app");
    setEnv("PUBLIC_BASE_URL", "https://strata.example");
    expect(baseUrl(request())).toBe("https://strata-preview-123.vercel.app");
  });

  it("keeps a preview link on the branch alias the request actually arrived on", () => {
    setEnv("VERCEL_ENV", "preview");
    // The per-deployment host; links minted against it break on the next push.
    setEnv("VERCEL_URL", "strata-abc123-team.vercel.app");
    setEnv("PUBLIC_BASE_URL", "https://strata.example");
    expect(
      baseUrl(request({ "x-forwarded-host": "strata-git-auth-team.vercel.app" })),
    ).toBe("https://strata-git-auth-team.vercel.app");
  });

  it("accepts the configured host on a preview, and no other forged one", () => {
    setEnv("VERCEL_ENV", "preview");
    setEnv("VERCEL_URL", "strata-abc123-team.vercel.app");
    setEnv("PUBLIC_BASE_URL", "https://preview.strata.example");
    expect(baseUrl(request({ "x-forwarded-host": "preview.strata.example" }))).toBe(
      "https://preview.strata.example",
    );
    // Any other host is client-supplied, so the deployment URL wins.
    expect(baseUrl(request({ "x-forwarded-host": "evil.example" }))).toBe(
      "https://strata-abc123-team.vercel.app",
    );
  });

  it("falls back to the resolved request origin when a preview URL is unavailable", () => {
    setEnv("VERCEL_ENV", "preview");
    setEnv("VERCEL_URL", undefined);
    setEnv("PUBLIC_BASE_URL", "https://strata.example");
    expect(baseUrl(request({ "x-forwarded-host": "evil.example" }))).toBe(
      "https://internal.vercel.app",
    );
  });

  it("trusts the forwarded host outside production, where the host is a tunnel", () => {
    setEnv("VERCEL_ENV", undefined);
    setEnv("PUBLIC_BASE_URL", undefined);
    setEnv("NODE_ENV", "development");
    expect(
      baseUrl(request({ "x-forwarded-host": "abc.ngrok.io", "x-forwarded-proto": "https" })),
    ).toBe("https://abc.ngrok.io");
  });

  it("refuses to mint anything in production with no configured origin", () => {
    setEnv("VERCEL_ENV", undefined);
    setEnv("PUBLIC_BASE_URL", undefined);
    setEnv("NODE_ENV", "production");
    // Read keys travel in these links, so a misconfigured production deploy must fail loudly
    // rather than trust the request host.
    expect(() => baseUrl(request({ "x-forwarded-host": "evil.example" })))
      .toThrow(/PUBLIC_BASE_URL/);
  });

  it("treats an empty PUBLIC_BASE_URL as unset, which in production is fatal", () => {
    setEnv("VERCEL_ENV", undefined);
    setEnv("PUBLIC_BASE_URL", "   ");
    setEnv("NODE_ENV", "production");
    expect(() => baseUrl(request())).toThrow(/PUBLIC_BASE_URL/);
  });

});
