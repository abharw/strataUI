import {
  ANOTHER_ASSISTANT,
  connectLadder,
  DRIVER_SENTENCE,
  staticKeyRule,
} from "./connect-copy";
import { recoveryRows } from "./recovery-copy";
import { REFRESH_REPLAY_GRACE_SECONDS } from "@/server/credentials/config";


/**
 * `GET /auth.md`: how an agent gets a credential. Uses the person's vocabulary; "namespace"
 * appears only as an API field name.
 */
export function authMarkdown(origin: string): string {
  // Relative paths: auth.md is read at a known origin. `/llms.txt` passes its origin instead.
  const base = "";
  const ladder = connectLadder(base);
  return `# Connecting to Strata

You are an agent acting for a person. A Strata belongs to an email address;
the credential you hold is your own key to it. ${ladder.order}

1. ${ladder.held}
2. ${ladder.connect}
   - ${ladder.start}
   - ${ladder.verify}
   - ${ladder.vault}

${DRIVER_SENTENCE}

## Once connected

- Send \`Authorization: Bearer <access_token>\` on every \`/v1\` request.
- Give one credential owner sole authority to refresh. On \`401\`:
  \`POST /v1/auth/refresh\` \`{"refresh_token":"<refresh_token>"}\` → a new pair.
  Replace **both** in your vault, then retry once. If the refresh response is
  uncertain, re-read the vault first; if it has no newer pair, one retry of
  the old token within ${String(REFRESH_REPLAY_GRACE_SECONDS)} seconds can recover a lost response only while its direct successor is unspent. Do not repeat it after that.
- Never put a token in a page, a URL, or a message. Never construct or guess a
  share capability URL — relay API-returned \`url\` values verbatim. Authenticated
  page reads and writes return \`owner_url\` for the person's owner page. The
  person reaches their own Strata at \`<origin>/home\` with the same email and code.

## Another agent, or a fixed API key

- ${ANOTHER_ASSISTANT}
  Each connection is listed under its own name at \`<origin>/home\` and revocable there on its own.
- ${staticKeyRule(base)}

## Endpoints

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | \`/v1/auth/start\` | none | \`{email, driver, label?}\` | \`202 {warnings, expires_in, interval}\` — identical whether the address is known |
| POST | \`/v1/auth/verify\` | none | \`{email, code, driver, label?, mode?, person_name?, display_name?}\` | \`201 {warnings, namespace_id, namespace_display_name, grant_id, label, access_token, refresh_token, token_type, expires_in, scope}\` |
| POST | \`/v1/credentials/static\` | writer with \`namespace:pair\` | \`{driver, label?}\` | fixed-API-key integrations only: a static writer credential (\`mode: "static"\`, no refresh token, no expiry), shown once |
| POST | \`/v1/auth/refresh\` | none | \`{refresh_token}\` | a fresh access and refresh token |
| POST | \`/v1/auth/revoke\` | the credential itself | none | \`200\`, always |

The person's own surfaces sit behind the session \`<origin>/home/sign-in\` opens, and no agent may call them: \`GET /home/agents\` lists every connected agent. Disconnecting an agent, signing a browser out and signing out everywhere are acts the person performs from their own Home; they are Server Actions with no address, so there is nothing here for an agent to call.

## When a call fails

Every refusal carries \`code\`, one sentence of \`error\`, and — where one call fixes it — a \`recover\` block holding that call as a complete URL. Identical answers are deliberate: a wrong, expired and already-used code are one \`400 invalid_code\`, because the difference is a probing oracle.

| \`code\` | What is true | What to do |
|---|---|---|
${recoveryRows("auth", origin)}

## Credentials and scopes

| Kind | Prefix | Lifetime | Can |
|---|---|---|---|
| writer access | \`sw_\` | 1 hour, refreshed | read and write pages, mint static credentials |
| refresh | \`sr_\` | 90 days sliding, rotates | mint the next pair; one bounded lost-response recovery |
| static writer | \`sw_\` | no expiry, no refresh | as writer; revoking is the only rotation |

Scopes are \`pages:read\`, \`pages:write\`, and \`namespace:pair\`: a writer holds all
three. A viewer credential (\`sv_\`, read-only by kind) is refused on every mutating route
before scope is consulted. A \`401\` carries \`WWW-Authenticate: Bearer realm="strata"\`;
a scope refusal is \`403\` with \`error="insufficient_scope"\` and the scope it wanted.

## Machine-readable

[\`${origin}/openapi.json\`](${origin}/openapi.json) — every route with schemas · [\`${origin}/llms.txt\`](${origin}/llms.txt) — what to do once connected
`;
}
