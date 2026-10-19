/**
 * Unauthenticated liveness and Postgres check. The probe is memoized so anonymous traffic cannot
 * drive Neon compute or keep it awake. The body reports health only, never version details.
 */
import { sql } from "drizzle-orm";

import { getDb } from "@/server/db";
import { redactError } from "@/server/api/http/guard";

export const dynamic = "force-dynamic";

/**
 * Per-instance probe cache. Long enough to absorb scrapers, short enough that a once-a-minute
 * uptime check sees an outage on its next tick.
 */
const PROBE_TTL_MS = 30_000;

let probe: { at: number; ok: boolean } | null = null;

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export async function GET(): Promise<Response> {
  const healthy = await database();
  return Response.json(
    { ok: healthy, db: healthy ? "ok" : "error" },
    { status: healthy ? 200 : 503, headers: HEADERS },
  );
}

async function database(): Promise<boolean> {
  const now = Date.now();
  if (probe !== null && now - probe.at < PROBE_TTL_MS) return probe.ok;
  try {
    await getDb().execute(sql`select 1`);
    probe = { at: now, ok: true };
  } catch (error) {
    // The neon driver embeds the connection string, credentials included, in error messages.
    console.error("health: db check failed", redactError(error));
    probe = { at: now, ok: false };
  }
  return probe.ok;
}
