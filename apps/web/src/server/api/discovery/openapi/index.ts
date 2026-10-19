/**
 * `GET /openapi.json`, assembled from one module per tag under `paths/`, response shapes in
 * `schemas.ts`, and request bodies compiled from Zod. Component prop schemas live at `/v1/manifest`.
 */
import { WEB_SESSION_COOKIE } from "@/server/auth/session-cookie";
import { CONTRACT_HEADER, CONTRACT_VERSION } from "@/shared/api/version";
import { REQUEST_SCHEMAS } from "./request-schemas";
import { RESPONSE_SCHEMAS } from "./schemas";
import { apiSecurity, errorBody } from "./shared";
import { ASSET_PATHS } from "@/server/api/discovery/openapi/paths/assets";
import { AUTHORING_PATHS } from "@/server/api/discovery/openapi/paths/authoring";
import { CONNECTION_PATHS } from "@/server/api/discovery/openapi/paths/connection";
import { OWNER_PATHS } from "@/server/api/discovery/openapi/paths/owner";
import { PAGE_PATHS } from "@/server/api/discovery/openapi/paths/pages";
import { SPACE_PATHS } from "@/server/api/discovery/openapi/paths/spaces";

export function openApi(origin: string): Record<string, unknown> {
  return {
    openapi: "3.1.1",
    info: {
      title: "Strata REST API",
      // The contract version shared with /llms.txt and /auth.md, not a package version.
      version: CONTRACT_VERSION,
      description:
        "Agent-first API for maintaining JSON Render pages inside one private namespace. Every credential is namespace-scoped and authorized by a person. Read /llms.txt first; select a representation, then fetch only its component schemas from /v1/manifest?components=….",
      license: { name: "All rights reserved", identifier: "LicenseRef-Proprietary" },
    },
    servers: [{ url: origin }],
    externalDocs: { description: "Agent instructions", url: `${origin}/llms.txt` },
    security: apiSecurity,
    tags: [
      { name: "pages", description: "Read and maintain stable JSON Render pages." },
      { name: "spaces", description: "Manage named membership, lifecycle, and sharing boundaries." },
      { name: "connection", description: "Connect with the person's email address, refresh, and revoke. Start at /auth.md." },
      { name: "owner", description: "Routes the person calls from their own signed-in Home. No agent credential opens them." },
      { name: "authoring", description: "Read the compact page contract once, then load only the selected component schemas." },
    ],
    paths: withContractHeader({
      ...CONNECTION_PATHS,
      ...OWNER_PATHS,
      ...SPACE_PATHS,
      ...PAGE_PATHS,
      ...ASSET_PATHS,
      ...AUTHORING_PATHS,
    }),
    components: {
      securitySchemes: {
        strataCredential: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "sw_ writer or sv_ viewer access token",
          description:
            "The credential Strata issued when an agent verified the person's email code. sw_ is a writer (pages:read, pages:write, namespace:pair); sv_ is a viewer and is read-only for the life of the grant. Both expire in one hour and are renewed with the sr_ refresh token at POST /v1/auth/refresh; a static writer credential carries the same sw_ prefix and never expires. Vault it: it authorizes exactly one namespace and never belongs in a URL or a message.",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          // From the module that sets the cookie, so the name cannot drift.
          name: WEB_SESSION_COOKIE,
          description:
            "The owner session the person's browser holds after signing in at /home/sign-in. It is not a credential an agent can obtain, hold, or be handed: nothing an agent calls mints one, and no /v1 route accepts one. It is published so the /home reads say what actually opens them - an agent presenting a bearer token there gets 404, the same as a browser with no session.",
        },
      },
      schemas: { ...RESPONSE_SCHEMAS, ...REQUEST_SCHEMAS },
    },
  };
}

/** The request header every write may carry, and the refusal a stale one earns. */
const CONTRACT_PARAMETER = {
  name: CONTRACT_HEADER,
  in: "header",
  required: false,
  description:
    "The contract version you learned from /llms.txt. A value older than the server's is refused with 409 contract_changed before anything is written, and the refusal lists what moved; omit it and the write runs with a warning.",
  schema: { type: "string", example: CONTRACT_VERSION },
};

const CONTRACT_CONFLICT =
  "X-Strata-Contract named a contract older than this server's (`contract_changed`): `changes` lists what moved. Re-read /llms.txt and the authoring guide before resending.";

/** Added to every mutating operation centrally, so a new write cannot omit it. */
function withContractHeader(paths: Record<string, unknown>): Record<string, unknown> {
  const decorated: Record<string, unknown> = {};
  for (const [path, item] of Object.entries(paths)) {
    const operations = { ...(item as Record<string, unknown>) };
    for (const method of ["post", "put", "patch", "delete"]) {
      const operation = operations[method] as Record<string, unknown> | undefined;
      if (operation === undefined) continue;
      const parameters = [...((operation.parameters as unknown[] | undefined) ?? []), CONTRACT_PARAMETER];
      const responses = { ...(operation.responses as Record<string, unknown>) };
      const conflict = responses["409"] as { description?: string } | undefined;
      responses["409"] = conflict === undefined
        ? errorBody(CONTRACT_CONFLICT)
        : { ...conflict, description: `${conflict.description ?? ""} Or: ${CONTRACT_CONFLICT}` };
      operations[method] = { ...operation, parameters, responses };
    }
    decorated[path] = operations;
  }
  return decorated;
}
