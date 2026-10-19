/** `GET /v1/decisions` returns a page of the approval answers this namespace has recorded. */
import * as decisions from "@/server/pages/decisions/handlers";
import { authenticate, requireScope } from "@/server/api/http/auth";
import { onlyParams, param } from "@/server/api/http/body";
import { guard } from "@/server/api/http/guard";

export async function GET(request: Request): Promise<Response> {
  return guard(request, async () => {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.result;
    const denied = requireScope(auth.ctx, "pages:read");
    if (denied !== null) return denied;
    const unknown = onlyParams(request, ["page_id", "limit", "before"]);
    if (unknown !== null) return unknown;
    return decisions.list({
      namespace_id: auth.ctx.namespace_id,
      page_id: param(request, "page_id"),
      limit: param(request, "limit"),
      before: param(request, "before"),
    });
  });
}
