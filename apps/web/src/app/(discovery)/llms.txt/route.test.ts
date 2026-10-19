import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { REFRESH_REPLAY_GRACE_SECONDS } from "@/server/credentials/config";
import { GET } from "./route";

describe("llms.txt", () => {
  const configured = process.env.PUBLIC_BASE_URL;
  // Preview deployments mint links on their own host; clear VERCEL_ENV to test PUBLIC_BASE_URL.
  const configuredVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    if (configured === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = configured;
    if (configuredVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = configuredVercelEnv;
  });

  it("is a self-contained agent door that starts at the connection guide", async () => {
    process.env.PUBLIC_BASE_URL = "https://strata.test";
    const response = GET(new Request("https://internal.test/llms.txt"));
    const body = await response.text();
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(body).toContain("# Strata");
    expect(body).toContain("## Connect first");
    expect(body).toContain("https://strata.test/auth.md");
    expect(body).toContain("POST https://strata.test/v1/auth/start");
    expect(body).toContain("POST https://strata.test/v1/auth/verify");
    expect(body).toContain("POST https://strata.test/v1/auth/refresh");
    // An email address maps to one Strata, so there is nothing to ask.
    expect(body).not.toContain("Do you already have a Strata?");
    expect(body).toContain("namespace_display_name");
    expect(body).toContain('"person_name":"<the person\'s name>"');
    expect(body).not.toContain('"display_name":"<the person\'s name>\'s Strata"');
    expect(body).toContain("https://strata.test/.well-known/strata.json");
    expect(body).toContain("https://strata.test/openapi.json");
    expect(body).toContain("GET /v1/guide?topic=authoring");
    expect(body).toContain("component chooser is generated from the same catalog as the manifest");
    expect(body).toContain("re-fetch it when that contract changes");
    expect(body).toContain("/v1/manifest?components=<comma-separated component names>");
    expect(body).toContain("Do not optimize for component variety");
    expect(body).toContain("2-4 word navigation label");
    expect(body).not.toMatch(/(?:^|[^A-Za-z])pk_/);
  });

  it("limits independent assistants and treats a phone as a browser", async () => {
    process.env.PUBLIC_BASE_URL = "https://strata.test";
    const body = await GET(new Request("https://internal.test/llms.txt")).text();
    expect(body).toContain("### Adding another agent, or the person's phone");
    expect(body).toContain("HTTP tools and durable credential storage");
    expect(body).toContain("integration is not configured");
    expect(body).toContain("do not claim it can send a code, borrow your tokens, or mint a credential for it");
    expect(body).toContain("only when the person names an integration that can hold nothing but a fixed API key");
    expect(body).toContain("namespace:pair");
    expect(body).toContain("https://strata.test/home");
  });

  it("describes serialized refresh and bounded recovery", async () => {
    process.env.PUBLIC_BASE_URL = "https://strata.test";
    const body = await GET(new Request("https://internal.test/llms.txt")).text();
    expect(body).toContain("one credential owner sole authority to refresh");
    expect(body).toContain("Replace both in the vault");
    expect(body).toContain(`within ${REFRESH_REPLAY_GRACE_SECONDS} seconds`);
    expect(body).toContain("only while its direct successor is unspent");
    expect(body).not.toContain("presenting it again revokes this connection");
    expect(body).toContain("`400 invalid_grant`");
    expect(body).toContain("Never create a second Strata for a person who had one");
  });

  it("points a revoked agent back at the email flow", async () => {
    process.env.PUBLIC_BASE_URL = "https://strata.test";
    const body = await GET(new Request("https://internal.test/llms.txt")).text();
    // The Strata outlives a revoked credential, and reconnecting uses the email flow.
    expect(body).toContain("Their Strata and pages still exist");
    expect(body).toContain("connect again from step 2");
    expect(body).toContain("/v1/auth/start");
  });
});
