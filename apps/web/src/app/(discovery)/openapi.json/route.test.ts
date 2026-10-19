import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { jsonBody } from "@/test/json-body";
import { GET } from "./route";

describe("openapi.json", () => {
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

  it("publishes every call as bearer-scoped except the public connection endpoints", async () => {
    process.env.PUBLIC_BASE_URL = "https://strata.test";
    const response = GET(new Request("https://internal.test/openapi.json"));
    const body = await jsonBody(response);
    expect(body).toMatchObject({
      openapi: "3.1.1",
      servers: [{ url: "https://strata.test" }],
      security: [{ strataCredential: [] }],
      paths: {
        "/v1/auth/start": {
          post: { security: [], operationId: "start_auth" },
        },
        "/v1/auth/verify": {
          post: { security: [], operationId: "verify_auth" },
        },
        "/v1/credentials/static": {
          post: {
            security: [{ strataCredential: ["namespace:pair"] }],
            operationId: "mint_static_credential",
          },
        },
        "/v1/auth/refresh": {
          post: { security: [], operationId: "refresh_credential" },
        },
        "/v1/auth/revoke": {
          post: { operationId: "revoke_own_credential" },
        },
        // /home reads accept only the browser session cookie.
        "/home/agents": { get: { security: [{ cookieAuth: [] }], operationId: "owner_list_agents" } },
        "/home/search": { get: { security: [{ cookieAuth: [] }], operationId: "owner_search_pages" } },
        "/v1/assets/{id}/bytes": {
          put: { security: [] },
        },
        "/v1/pages": { put: { operationId: "put_page" } },
        "/v1/manifest": {
          get: {
            operationId: "get_manifest",
            parameters: [expect.objectContaining({ name: "components", in: "query" })],
            responses: { "200": expect.any(Object) as object, "422": expect.any(Object) as object },
          },
        },
      },
    });
    expect(body.components.securitySchemes.strataCredential).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "sw_ writer or sv_ viewer access token",
    });
    for (const prefix of ["sw_", "sv_"]) {
      expect(body.components.securitySchemes.strataCredential.description).toContain(prefix);
    }
    // One bearer scheme. `cookieAuth` exists only to describe the /home reads; agents never mint it.
    expect(Object.keys(body.components.securitySchemes)).toEqual(["strataCredential", "cookieAuth"]);
    expect(body.components.securitySchemes.cookieAuth).toMatchObject({ type: "apiKey", in: "cookie" });
    // No device credentials: no scheme, schema or path.
    expect(body.components.securitySchemes).not.toHaveProperty("deviceCredential");
    for (const schema of Object.keys(body.components.schemas)) {
      expect(schema, schema).not.toMatch(/^Device/);
    }
    expect(body.paths).not.toHaveProperty("/v1/tokens/rotate");
    expect(body.paths).not.toHaveProperty("/v1/keys/rotate");
    expect(body.paths).not.toHaveProperty("/v1/sessions/from-credential");
    expect(body.paths["/v1/pages"].put.responses["401"].headers["WWW-Authenticate"].example).toBe(
      'Bearer realm="strata"',
    );
    expect(body.paths["/v1/pages"].put.responses["403"].headers["WWW-Authenticate"].example).toContain(
      'error="insufficient_scope"',
    );
    expect(body.components.schemas.Element.required).toEqual(["type", "props"]);
    expect(body.components.schemas.SpaceReference.properties.name.maxLength).toBe(30);
    expect(body.components.schemas.SpaceReference.required).toContain("emoji");
    expect(body.components.schemas.SpaceCreateRequest.properties.name.maxLength).toBe(30);
    expect(body.components.schemas.SpaceCreateRequest.required).toContain("emoji");
    expect(body.components.schemas.SpacePatchRequest.properties.name.maxLength).toBe(30);
    expect(JSON.stringify(body)).not.toContain("partner");
  });
});
