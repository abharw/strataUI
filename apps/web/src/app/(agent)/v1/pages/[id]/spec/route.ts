import * as pages from "@/server/pages/handlers";
import { authenticate, requireScope, requireWriter } from "@/server/api/http/auth";
import { onlyParams, readJson } from "@/server/api/http/body";
import { guard } from "@/server/api/http/guard";

interface Context { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return guard(request, async () => {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.result;
    const denied = requireWriter(auth.ctx) ?? requireScope(auth.ctx, "pages:write");
    if (denied !== null) return denied;
    const unknown = onlyParams(request, []);
    if (unknown !== null) return unknown;
    const body = await readJson(request);
    if (!body.ok) return body.result;
    const { id } = await context.params;
    return pages.patchSpec(auth.ctx, id, body.value);
  });
}

/** Replaces the whole spec, for rebuilds a patch cannot express. */
export async function PUT(request: Request, context: Context): Promise<Response> {
  return guard(request, async () => {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.result;
    const denied = requireWriter(auth.ctx) ?? requireScope(auth.ctx, "pages:write");
    if (denied !== null) return denied;
    const unknown = onlyParams(request, []);
    if (unknown !== null) return unknown;
    const body = await readJson(request);
    if (!body.ok) return body.result;
    const { id } = await context.params;
    return pages.rewriteSpec(auth.ctx, id, body.value);
  });
}
