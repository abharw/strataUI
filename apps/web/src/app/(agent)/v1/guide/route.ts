/**
 * `GET /v1/guide?topic=` returns one authoring guide topic. An omitted `topic` returns
 * `authoring`, the compact page contract (~900 tokens).
 */
import * as guide from "@/server/api/authoring/guide";
import { authenticate, requireScope } from "@/server/api/http/auth";
import { onlyParams, param } from "@/server/api/http/body";
import { guard } from "@/server/api/http/guard";

export async function GET(request: Request): Promise<Response> {
  return guard(request, async () => {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.result;
    const denied = requireScope(auth.ctx, "pages:read");
    if (denied !== null) return denied;
    const unknown = onlyParams(request, ["topic"]);
    if (unknown !== null) return unknown;
    return guide.get({ topic: param(request, "topic") });
  });
}
