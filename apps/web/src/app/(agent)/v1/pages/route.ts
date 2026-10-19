import * as pages from "@/server/pages/handlers";
import { authenticate, requireScope, requireWriter } from "@/server/api/http/auth";
import { onlyParams, param, readJson } from "@/server/api/http/body";
import { guard } from "@/server/api/http/guard";

export async function PUT(request: Request): Promise<Response> {
  return guard(request, async () => {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.result;
    const denied = requireWriter(auth.ctx) ?? requireScope(auth.ctx, "pages:write");
    if (denied !== null) return denied;
    const unknown = onlyParams(request, []);
    if (unknown !== null) return unknown;
    const body = await readJson(request);
    if (!body.ok) return body.result;
    return pages.put(auth.ctx, body.value);
  });
}

export async function GET(request: Request): Promise<Response> {
  return guard(request, async () => {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.result;
    const denied = requireScope(auth.ctx, "pages:read");
    if (denied !== null) return denied;
    const unknown = onlyParams(request, ["space_id"]);
    if (unknown !== null) return unknown;
    return pages.list({
      namespace_id: auth.ctx.namespace_id,
      space_id: param(request, "space_id"),
    });
  });
}
