/**
 * `GET /home/agents`: connected agents, owner session only. Without the cookie it is
 * `notFound()`, so a share link cannot enumerate credentials.
 */
import { requireWebSessionNamespace } from "@/server/auth/web-session";
import { listAgents } from "@/server/credentials/handlers";
import { guard } from "@/server/api/http/guard";

export async function GET(request: Request): Promise<Response> {
  const { namespaceId } = await requireWebSessionNamespace();
  return guard(request, () => listAgents(namespaceId));
}
