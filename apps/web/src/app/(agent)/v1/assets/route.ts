/**
 * `POST` reserves an asset and returns its upload URL; `GET` reports usage and limits.
 * Both authenticate before validating the query, so anonymous callers get 401, not 422.
 */
import * as assets from "@/server/assets/handlers";
import { authenticate, requireScope, requireWriter } from "@/server/api/http/auth";
import { onlyParams, readJson } from "@/server/api/http/body";
import { guard } from "@/server/api/http/guard";
import { baseUrl } from "@/server/api/http/origin";

export async function POST(request: Request): Promise<Response> {
  return guard(request, async () => {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.result;
    const denied = requireWriter(auth.ctx) ?? requireScope(auth.ctx, "pages:write");
    if (denied !== null) return denied;
    const unknown = onlyParams(request, []);
    if (unknown !== null) return unknown;
    const body = await readJson(request);
    if (!body.ok) return body.result;
    return assets.create({ namespace_id: auth.ctx.namespace_id, baseUrl: baseUrl(request), body: body.value });
  });
}

export async function GET(request: Request): Promise<Response> {
  return guard(request, async () => {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.result;
    const denied = requireScope(auth.ctx, "pages:read");
    if (denied !== null) return denied;
    const unknown = onlyParams(request, []);
    if (unknown !== null) return unknown;
    return assets.usage(auth.ctx.namespace_id);
  });
}
