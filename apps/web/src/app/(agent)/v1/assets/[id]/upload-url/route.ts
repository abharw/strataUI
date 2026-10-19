/**
 * Re-issues the upload URL for a reservation whose bytes never arrived, keeping its quota. The
 * signature is bound to the row's window, so moving it invalidates the previous URL.
 */
import * as assets from "@/server/assets/handlers";
import { authenticate, requireScope, requireWriter } from "@/server/api/http/auth";
import { onlyParams } from "@/server/api/http/body";
import { guard } from "@/server/api/http/guard";
import { baseUrl } from "@/server/api/http/origin";

interface Context { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  return guard(request, async () => {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.result;
    const denied = requireWriter(auth.ctx) ?? requireScope(auth.ctx, "pages:write");
    if (denied !== null) return denied;
    const unknown = onlyParams(request, []);
    if (unknown !== null) return unknown;
    const { id } = await context.params;
    return assets.reissue({ namespace_id: auth.ctx.namespace_id, asset_id: id, baseUrl: baseUrl(request) });
  });
}
