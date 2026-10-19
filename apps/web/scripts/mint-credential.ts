/**
 * Mints a writer credential and owner session directly in the database, for agent-loop.mjs
 * without an inbox. Development and CI only.
 *   pnpm exec dotenv -e .env.local -- tsx scripts/mint-credential.ts "Proof run"
 */
import { createGrant } from "../src/server/credentials/grants";
import { createSession } from "../src/server/auth/owner-session";
import { issueTokenPair } from "../src/server/credentials/tokens";
import { getDb } from "../src/server/db";
import { createNamespaceIn } from "../src/server/credentials/provision";

async function main(): Promise<void> {
  const displayName = process.argv[2] ?? "Agent loop";
  const { namespace_id } = await createNamespaceIn(getDb(), { displayName });
  const grant = await createGrant({
    namespaceId: namespace_id,
    kind: "writer",
    driver: "instinct",
    label: "instinct",
    mode: "rotating",
    issuedByGrantId: null,
  });
  const pair = await issueTokenPair(grant);
  // An owner session for `--session`, since sign-in is Server Actions a script cannot post to.
  // The row matches what the verify action writes.
  const session = await createSession({ namespaceId: namespace_id });
  console.log(JSON.stringify({
    namespace_id,
    namespace_display_name: displayName,
    grant_id: grant.id,
    access_token: pair.accessToken,
    refresh_token: pair.refreshToken,
    session_secret: session.secret,
  }, null, 2));
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
