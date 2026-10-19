/**
 * Nightly cleanup of expired tokens, sessions, rate-limit events, usage and old views. Storage
 * only: read paths already refuse expired state. Namespaces are never swept (deleting one
 * cascades a person's credentials). Vercel cron authenticates with `Bearer $CRON_SECRET`.
 */
import { sweepOwnerSessions } from "@/server/auth/owner-session";
import { sweepExpired } from "@/server/credentials";
import { redactError } from "@/server/api/http/guard";
import { constantTimeEquals } from "@/server/credentials/keys";
import { sweepNamespaceUsage, sweepRateLimitEvents } from "@/server/credentials/provision/rate-limit";
import { sweepViewLog } from "@/server/pages/read/view-log";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Sequential: concurrent deletes on overlapping tables only add lock contention.
    const credentials = await sweepExpired();
    const sessions = await sweepOwnerSessions();
    const rateLimitEvents = await sweepRateLimitEvents();
    const namespaceUsage = await sweepNamespaceUsage();
    const views = await sweepViewLog();

    return Response.json({
      ok: true,
      swept: {
        credential_tokens: credentials.tokens,
        owner_sessions: sessions,
        rate_limit_events: rateLimitEvents,
        namespace_usage: namespaceUsage,
        view_log: views,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // The neon driver includes the connection string in its error text, so never return it.
    console.error("cron/sweep: failed", redactError(error));
    return Response.json({ ok: false }, { status: 500 });
  }
}

/**
 * Constant-time comparison against `CRON_SECRET`. An unset secret refuses everything, so a
 * missing env var disables the cron instead of exposing a public delete endpoint.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret === undefined || secret === "") return false;
  const header = request.headers.get("authorization");
  if (header === null) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match === null) return false;
  return constantTimeEquals(match[1].trim(), secret);
}
