/**
 * Re-seals stored capability keys with STRATA_URL_KEY during a rotation (old key in
 * STRATA_URL_KEY_OLD). Idempotent; rows that open with neither key are reported, not overwritten.
 *     pnpm --filter @strata/web exec dotenv -e .env.local -- tsx scripts/rewrap-sealed-keys.ts
 */
import { eq } from "drizzle-orm";

import { getDb, schema } from "../src/server/db";
import { openKey, sealKey } from "../src/server/credentials/keys/at-rest";

async function main(): Promise<void> {
  const db = getDb();
  const pageRows = await db
    .select({ id: schema.pages.id, sealed: schema.pages.sealedReadKey })
    .from(schema.pages);
  const spaceRows = await db
    .select({ id: schema.spaces.id, sealed: schema.spaces.sealedShareKey })
    .from(schema.spaces);

  let rewrapped = 0;
  const stuck: string[] = [];
  for (const row of pageRows) {
    let plain: string;
    try {
      plain = openKey(row.sealed);
    } catch {
      stuck.push(row.id);
      continue;
    }
    await db.update(schema.pages).set({ sealedReadKey: sealKey(plain) }).where(eq(schema.pages.id, row.id));
    rewrapped += 1;
  }

  for (const row of spaceRows) {
    if (row.sealed === null) continue;
    let plain: string;
    try {
      plain = openKey(row.sealed);
    } catch {
      stuck.push(`space:${row.id}`);
      continue;
    }
    await db.update(schema.spaces).set({ sealedShareKey: sealKey(plain) }).where(eq(schema.spaces.id, row.id));
    rewrapped += 1;
  }

  const storedSpaceKeys = spaceRows.filter((row) => row.sealed !== null).length;
  console.log(`${pageRows.length} page keys and ${storedSpaceKeys} Space keys; ${rewrapped} rewrapped with the current key.`);
  if (stuck.length > 0) {
    console.log(`${stuck.length} would not open with either key and were left untouched:`);
    for (const id of stuck) console.log(`  ${id}`);
  }
  process.exit(stuck.length > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
