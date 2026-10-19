import { discoveryResponse } from "@/server/api/discovery/response";
import { CONTRACT_VERSION } from "@/shared/api/version";
import { baseUrl } from "@/server/api/http/origin";

export const dynamic = "force-dynamic";

/**
 * Zero-configuration discovery for an agent that knows only the Strata host.
 * This document contains no user data and no credential.
 */
export function GET(request: Request): Response {
  const origin = baseUrl(request);
  const document = {
    name: "Strata",
    protocol: "strata-rest",
    protocol_version: 1,
    // Also echoed by every /v1 response and the X-Strata-Contract header.
    contract_version: CONTRACT_VERSION,
    api_base: `${origin}/v1`,
    // The only key for `/llms.txt`, so agents never treat it as two documents.
    agent_instructions: `${origin}/llms.txt`,
    service_description: `${origin}/openapi.json`,
    preferred_authentication: "strata_credential",
    agent_auth: {
      // Each agent connects for itself: email address, then the code mailed to it.
      kind: "email_code",
      auth_md: `${origin}/auth.md`,
      start: `${origin}/v1/auth/start`,
      verify: `${origin}/v1/auth/verify`,
      refresh: `${origin}/v1/auth/refresh`,
      instruction:
        "Ask the person for the email address they read mail at, then POST {\"driver\":\"<your driver>\",\"label\":\"<your name>\",\"email\":\"<address>\"} to start. A six-digit code is mailed there and the answer is 202 whether or not that address already has a Strata, so it is not a way to find out. Ask them to read the code back and POST the same body plus \"code\" to verify: the first verify creates their Strata, every later one opens the same one, and both return your tokens plus namespace_display_name. Never ask whether they already have a Strata — the address answers it. Read auth_md before any of it.",
    },
    authorization: {
      scheme: "Bearer",
      header: "Authorization: Bearer <credential>",
      token_scope: "one namespace",
      formats: ["sw_*", "sv_*"],
      instruction:
        "A namespace-scoped credential Strata issued: sw_ writes, sv_ reads only. Refresh either with sr_ at the refresh endpoint. Never put one in a URL.",
      read_capabilities: {
        formats: ["pgk_*", "spk_*"],
        instruction: "Browser capability URLs are never valid /v1 bearer credentials.",
      },
    },
    start: [
      `GET ${origin}/v1/guide?topic=authoring`,
      `GET ${origin}/v1/manifest?components=<selected-component-names>`,
      `PUT ${origin}/v1/pages`,
    ],
    inventory: {
      pages: `${origin}/v1/pages`,
      spaces: `${origin}/v1/spaces`,
    },
    phone: {
      home: `${origin}/home`,
      door: `${origin}/home/sign-in`,
      instruction:
        "The person's phone is a browser, not an agent. It holds no credential, and no agent mints one for it: the person opens door, gives the address they read mail at and the code it receives, and that browser is signed in to their own Strata for 90 days. The Strata app is a WebView over the same pages. No credential is ever returned to a phone, and capability links the person opened stay independent of the session.",
    },
  };
  return discoveryResponse(request, JSON.stringify(document), { contentType: "application/json" });
}
