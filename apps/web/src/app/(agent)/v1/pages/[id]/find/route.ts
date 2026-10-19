import * as pages from "@/server/pages/handlers";
import { authenticate, requireScope } from "@/server/api/http/auth";
import { onlyParams, param } from "@/server/api/http/body";
import { guard } from "@/server/api/http/guard";

interface Context { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  return guard(request, async () => {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.result;
    const denied = requireScope(auth.ctx, "pages:read");
    if (denied !== null) return denied;
    const unknown = onlyParams(request, ["component", "text"]);
    if (unknown !== null) return unknown;
    const { id } = await context.params;
    return pages.find({ namespace_id: auth.ctx.namespace_id, page_id: id, component: param(request, "component"), text: param(request, "text") });
  });
}
