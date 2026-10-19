/**
 * The connect steps, rendered into both `/llms.txt` and `/auth.md` so the two cannot disagree.
 * `base` is the origin for llms.txt (absolute URLs) or "" for auth.md (relative).
 */
import { DRIVERS } from "@/server/credentials/config";

/** Literal request bodies an agent can send without composing them. */
export const START_BODY = '{"email":"<address>","driver":"<your driver>","label":"<your name>"}';
export const VERIFY_BODY =
  '{"email":"<address>","code":"<digits>","driver":"<your driver>","label":"<your name>","person_name":"<the person\'s name>"}';

/** The connect steps; each document lays them out in its own format. */
export interface ConnectLadder {
  /** Preamble: work in order, stop at the first that applies. */
  order: string;
  /** Step 1: tokens already held. */
  held: string;
  /** Step 2 headline: connect with two calls. */
  connect: string;
  /** Step 2, first call. */
  start: string;
  /** Step 2, second call. */
  verify: string;
  /** Step 2, storing the result. */
  vault: string;
}

export function connectLadder(base: string): ConnectLadder {
  return {
    order: "Work through these in order and stop at the first that applies.",
    held:
      "**You already hold Strata tokens for this person** — an `sw_` access token and an `sr_` refresh token in your vault. Use them. Skip to \"Once connected\".",
    connect:
      "**Otherwise, connect.** The same two calls whether or not they have a Strata yet; never ask which, because the address answers it.",
    start:
      `Ask the person for the email address they read mail at, then \`POST ${base}/v1/auth/start\` \`${START_BODY}\` → \`202 {expires_in: 600}\`. A six-digit code is on its way to that address; it lives ten minutes.`,
    verify:
      `Ask them for the code, then \`POST ${base}/v1/auth/verify\` \`${VERIFY_BODY}\` → \`{"access_token":"sw_…","refresh_token":"sr_…","namespace_display_name":"…"}\`. The first verify creates their Strata; every later one opens the same one — send \`person_name\` if you know their name; it names the Strata and lets Home greet them, and both are used only when the Strata is created.`,
    vault: "Vault both tokens. Reply \"Connected to <namespace_display_name>.\"",
  };
}

/** Rendered from `DRIVERS`, the list `createGrant` validates against, so docs and validation match. */
export const DRIVER_SENTENCE = `\`driver\` must be one of ${
  DRIVERS.map((driver) => `\`${driver}\``).join(", ")
}. Anything else is \`422 invalid_driver\`.`;

/** What an agent may claim about connecting a second assistant. */
export const ANOTHER_ASSISTANT =
  "**Another assistant** (ChatGPT, Claude, …) can independently use this REST flow only when it has HTTP tools and durable credential storage. If that integration is not configured, explain that it is not configured; do not claim it can send a code, borrow your tokens, or mint a credential for it.";

/** When to mint a fixed API key. */
export function staticKeyRule(base: string): string {
  return `**Mint a static key** with \`POST ${base}/v1/credentials/static\` \`{"driver":"chatgpt","label":"chatgpt"}\` → \`{"access_token":"sw_…"}\` only when the person names an integration that can hold nothing but a fixed API key (a custom GPT's Actions, a webhook), and then hand them the key once — it is returned once and never shown again. It never expires and cannot be refreshed; your credential needs the \`namespace:pair\` scope.`;
}
