import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { jsonBody } from "@/test/json-body";
import { GET } from "./route";

describe("Strata discovery", () => {
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

  it("lets an agent bootstrap from only the host without exposing a credential", async () => {
    process.env.PUBLIC_BASE_URL = "https://strata.test";
    const response = GET(new Request("https://internal.test/.well-known/strata.json"));
    const body = await jsonBody(response);
    expect(body).toMatchObject({
      protocol: "strata-rest",
      api_base: "https://strata.test/v1",
      agent_instructions: "https://strata.test/llms.txt",
      service_description: "https://strata.test/openapi.json",
      preferred_authentication: "strata_credential",
      agent_auth: {
        kind: "email_code",
        auth_md: "https://strata.test/auth.md",
        start: "https://strata.test/v1/auth/start",
        verify: "https://strata.test/v1/auth/verify",
        refresh: "https://strata.test/v1/auth/refresh",
      },
      authorization: {
        scheme: "Bearer",
        token_scope: "one namespace",
        formats: ["sw_*", "sv_*"],
        read_capabilities: { formats: ["pgk_*", "spk_*"] },
      },
      phone: {
        home: "https://strata.test/home",
        door: "https://strata.test/home/sign-in",
      },
      start: [
        "GET https://strata.test/v1/guide?topic=authoring",
        "GET https://strata.test/v1/manifest?components=<selected-component-names>",
        "PUT https://strata.test/v1/pages",
      ],
    });
    // `/llms.txt` appears under one key only.
    expect(body).not.toHaveProperty("documentation");
    expect(JSON.stringify(body).match(/llms\.txt/g)).toHaveLength(1);
    expect(JSON.stringify(body)).not.toMatch(/sk_[A-Za-z0-9_-]+/);
    expect(body.phone.instruction).toContain("a browser, not an agent");
    expect(body.phone.instruction).toContain("No credential is ever returned to a phone");
  });

  it("spells out the two calls in order without leaking a credential", async () => {
    process.env.PUBLIC_BASE_URL = "https://strata.test";
    const body = (await GET(
      new Request("https://internal.test/.well-known/strata.json"),
    ).json()) as { agent_auth: { instruction: string } };

    const instruction = body.agent_auth.instruction;
    expect(instruction).toContain("email address");
    expect(instruction.indexOf("to start")).toBeLessThan(instruction.indexOf("to verify"));
    expect(instruction).toContain("namespace_display_name");
    expect(instruction).toContain("Never ask whether they already have a Strata");
    expect(JSON.stringify(body)).not.toMatch(/(?:sw|sv|sr|sk)_[A-Za-z0-9_-]{8,}/);
  });
});
