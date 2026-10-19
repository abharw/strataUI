/** Email sign-in and the credential lifecycle: start, verify, refresh, revoke, and static keys. */
import { apiSecurity, authenticationErrorBody, JSON_MEDIA, errorBody, jsonBody, okBody, pairSecurity, rateLimitBody, responses, schemaRef } from "@/server/api/discovery/openapi/shared";
import { REFRESH_REPLAY_GRACE_SECONDS } from "@/server/credentials/config";

export const CONNECTION_PATHS: Record<string, unknown> = {
  "/v1/auth/start": {
    post: {
      operationId: "start_auth",
      tags: ["connection"],
      summary: "Have Strata email the person a one-time code",
      description:
        "The door for an agent that holds nothing. Ask the person for their email address and send it here; Strata mails them a short code. The answer is 202 and is identical whether or not that address already has a Strata - it is not a way to find out. Then ask the person to read the code back and call verify_auth. The code lives ten minutes. An address that cannot receive mail is the one exception: 422 invalid_email, because no code is coming and silence would be a lie. Rate-limited per request source and per address.",
      security: [],
      requestBody: jsonBody(schemaRef("AuthStartRequest")),
      responses: {
        "202": okBody(
          "A code is on its way; ask the person to read it back, then call verify_auth",
          schemaRef("AuthStartResponse"),
        ),
        "400": errorBody("Body is not parseable JSON, or is not an object. A body that parses but fails validation is 422."),
        "413": errorBody("Body over 256 KB"),
        "422": errorBody("The address cannot receive mail (invalid_email), the driver is unknown (invalid_driver), or a field failed validation; `path` names it"),
        "429": rateLimitBody("Too many code requests from this source, or to this address, in the last hour"),
        default: errorBody("Actionable error"),
      },
    },
  },
  "/v1/auth/verify": {
    post: {
      operationId: "verify_auth",
      tags: ["connection"],
      summary: "Spend the code the email carried and receive a credential",
      description:
        "Send the same email address and the code the person read back. Strata finds the Strata that address owns, creates one if there is none, and opens a rotating writer grant on it: there is no separate provisioning call and no question to ask the person about whether they already have one. Send person_name if you know the person's name; it names the Strata and lets Home greet them, and both it and display_name are used only when this call creates the Strata, ignored when the address already has one. Returns the same credential pair every issuing door returns, plus namespace_display_name - say it back to the person so a wrong address is caught before you write. A wrong, expired, or already-spent code is one identical 400 invalid_code. The response is no-store.",
      security: [],
      requestBody: jsonBody(schemaRef("AuthVerifyRequest")),
      responses: {
        ...responses(
          {
            description: "Connected; confirm namespace_display_name to the person and vault both tokens",
            schema: schemaRef("CredentialResponse"),
            created: true,
          },
          { body: true, public: true },
        ),
        "400": {
          description:
            "The code is wrong, expired, or already spent. All three answer identically on purpose; ask the person to request a fresh code rather than retrying this one.",
          content: { [JSON_MEDIA]: { schema: schemaRef("InvalidCodeError") } },
        },
        "429": rateLimitBody("Too many wrong codes from this request source in the last hour"),
      },
    },
  },
  "/v1/auth/refresh": {
    post: {
      operationId: "refresh_credential",
      tags: ["connection"],
      summary: "Exchange the refresh token for a fresh credential pair",
      description:
        `Send only the refresh token; no Authorization header. One credential owner must serialize refreshes and store both tokens from every response before another request uses them. If a refresh response is uncertain, re-read the vault first; if it has no newer pair, one retry of the old token within ${String(REFRESH_REPLAY_GRACE_SECONDS)} seconds can recover a lost response only while its direct successor is unspent. Outside that bounded recovery, a consumed-token replay closes the grant. A 400 invalid_grant is terminal for this connection, and only for this connection: it does not say whether revocation, expiry, or replay caused it. The person's Strata and pages are untouched. Say so in one line and connect again with POST /v1/auth/start, which the refusal carries verbatim in its recover field. The response is no-store.`,
      security: [],
      requestBody: jsonBody(schemaRef("RefreshRequest")),
      responses: {
        ...responses(
          { description: "A new access token and a new refresh token; store both", schema: schemaRef("CredentialResponse") },
          { body: true, public: true },
        ),
        "400": {
          description:
            "The connection cannot recover. It may have expired, been revoked, or encountered a replay outside the bounded lost-response recovery; do not infer which. Connect again from the person's email address.",
          content: { [JSON_MEDIA]: { schema: schemaRef("InvalidGrantError") } },
        },
        "429": rateLimitBody("Too many refresh attempts from this request source"),
      },
    },
  },
  "/v1/auth/revoke": {
    post: {
      operationId: "revoke_own_credential",
      tags: ["connection"],
      summary: "Disconnect yourself from this Strata",
      description:
        "An agent revoking itself. The credential in the Authorization header names the grant; every access and refresh token under it dies immediately. Always 200, including for a credential that was already revoked, so this is safe to call blind when the person asks you to disconnect. Only a credential that is still live revokes anything: an expired access token or a consumed refresh token is answered 200 and kills nothing, so a string that leaked after it stopped working is not a way to disconnect somebody else's agent. There is no undo: reconnecting means a fresh code to the person's email address.",
      security: apiSecurity,
      requestBody: jsonBody(schemaRef("RevokeRequest"), false),
      responses: {
        "200": okBody("The grant is revoked; discard both stored tokens", schemaRef("RevokeResponse")),
        "400": errorBody("Body is not parseable JSON, or is not an object"),
        "401": authenticationErrorBody("No credential was presented"),
        default: errorBody("Actionable error"),
      },
    },
  },
  "/v1/credentials/static": {
    post: {
      operationId: "mint_static_credential",
      tags: ["connection"],
      summary: "Mint a fixed-key credential for an agent that cannot hold runtime tokens",
      description:
        "A connected writer minting for another agent - a custom GPT's Actions, a webhook - that can only be configured with a fixed API key. Opens a static writer grant: the access token never expires, there is no refresh token, and revoking it is the only rotation. The token is returned once; hand it to the person to paste into that agent's API-key setting, or paste it yourself if you can operate that agent. The new grant records you as its issuer, so the person's Home shows who connected whom; revoking you does not revoke it. Ten per Strata per hour.",
      security: pairSecurity,
      requestBody: jsonBody(schemaRef("StaticCredentialRequest")),
      responses: {
        ...responses(
          {
            description: "The static credential, shown once; mode is static and refresh_token is null",
            schema: schemaRef("CredentialResponse"),
            created: true,
          },
          { body: true },
        ),
        "429": {
          ...errorBody("This Strata minted too many static credentials in the rolling hour"),
          headers: {
            "Retry-After": {
              description: "This Strata has minted 10 static credentials in the last hour; wait for retry_after_seconds.",
              schema: { type: "integer", minimum: 1 },
            },
          },
        },
      },
    },
  },
};
