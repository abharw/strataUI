import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export * from "./schema";
export { schema };

let db: NodePgDatabase<typeof schema> | undefined;

/**
 * Connections per warm instance against the Neon pooler. Concurrency scales by instance (open tabs
 * poll every 3s), so 5 keeps a burst of instances well under the pooler's ceiling.
 */
const POOL_MAX = 5;

/**
 * `pg` waits forever by default, so a suspended or saturated Neon compute would hang requests
 * until the function is killed. 5s covers a cold Neon resume and fails fast otherwise.
 */
const CONNECT_TIMEOUT_MS = 5_000;

/**
 * Per-statement cap, applied with `SET` on connect: Neon's pooler silently drops a
 * `statement_timeout` startup parameter and rejects `options=-c statement_timeout=...`.
 */
const STATEMENT_TIMEOUT_MS = 10_000;

/**
 * Forces `sslmode=verify-full`. `pg` 8 treats `require` as `verify-full`, but `pg` 9 will give it
 * libpq semantics (certificate unverified), so the mode is pinned here rather than in the env URL.
 */
function verifiedTls(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a URL");
  }
  parsed.searchParams.set("sslmode", "verify-full");
  return parsed.toString();
}

/**
 * Lazily constructs the Drizzle client so nothing reads DATABASE_URL until a request runs
 * (`next build` works without env). Uses node-postgres over TCP: the pool is cached across
 * requests, which @neondatabase/serverless WebSocket pools do not support, and `pg` reconnects
 * after Neon suspends an idle compute. `attachDatabasePool` drains the pool when Vercel suspends
 * the instance. DATABASE_URL is the pooled string; migrations use DATABASE_URL_UNPOOLED.
 */
export function getDb(): NodePgDatabase<typeof schema> {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    const pool = new Pool({
      connectionString: verifiedTls(url),
      max: POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      application_name: "strata-web",
      // pg-pool awaits this before handing out the client, so the timeout applies to the first
      // query. @types/pg types the hook as returning void.
      // oxlint-disable-next-line typescript/no-misused-promises
      onConnect: async (client) => {
        await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      },
    });
    // An unhandled idle-client 'error' (e.g. Neon suspended the compute) would crash the process.
    // Log only the name: the driver's messages include the connection string.
    pool.on("error", (error: { name?: string; message?: string }) => {
      console.error("db: idle client error", { name: error?.name });
    });
    attachDatabasePool(pool);
    db = drizzle(pool, { schema });
  }
  return db;
}

/**
 * Postgres `unique_violation` (SQLSTATE 23505), anywhere in the `cause` chain. Drizzle wraps the
 * driver error in `DrizzleQueryError`, so checking `error.code` directly never matches.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== null && current !== undefined; depth += 1) {
    if (typeof current !== "object") return false;
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
