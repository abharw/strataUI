import * as pages from "@/server/pages/handlers";
import { authenticate, requireScope, requireWriter } from "@/server/api/http/auth";
import { boolParam, onlyParams, parseBody, readJson } from "@/server/api/http/body";
import { guard } from "@/server/api/http/guard";

interface Context { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  return guard(request, async () => {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.result;
    const denied = requireScope(auth.ctx, "pages:read");
    if (denied !== null) return denied;
    const unknown = onlyParams(request, []);
    if (unknown !== null) return unknown;
    const { id } = await context.params;
    return pages.get({ namespace_id: auth.ctx.namespace_id, page_id: id, baseUrl: auth.ctx.baseUrl });
  });
}

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
    const misroute = pages.specMisroute(body.value);
    if (misroute !== null) return misroute;
    const input = parseBody(pages.SetPageBodySchema, body.value, ["get_guide", "set_page"]);
    if ("status" in input) return input;

    return pages.update({
      namespace_id: auth.ctx.namespace_id,
      page_id: id,
      shared: input.shared,
      space_id: input.space_id,
      title: input.title,
      on_behalf_of_user: input.on_behalf_of_user,
      actor: "agent",
      grant_id: auth.ctx.grant_id,
      baseUrl: auth.ctx.baseUrl,
    });
  });
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return guard(request, async () => {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.result;
    const denied = requireWriter(auth.ctx) ?? requireScope(auth.ctx, "pages:write");
    if (denied !== null) return denied;
    const unknown = onlyParams(request, ["confirm"]);
    if (unknown !== null) return unknown;
    const { id } = await context.params;
    const body = await readJson(request);
    if (body.ok) {
      const input = parseBody(pages.DeletePageBodySchema, body.value, ["get_page", "delete_page"]);
      if ("status" in input) return input;
    }
    const confirmParam = boolParam(request, "confirm");
    if (!confirmParam.ok) return confirmParam.result;
    const confirm = confirmParam.value === true || (body.ok && body.value.confirm === true);
    return pages.remove({ namespace_id: auth.ctx.namespace_id, page_id: id, confirm });
  });
}
