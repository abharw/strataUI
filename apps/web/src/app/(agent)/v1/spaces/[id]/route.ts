/**
 * `PATCH /v1/spaces/:id` renames a Space or shares its current Pages.
 * `DELETE /v1/spaces/:id?with_pages=true` permanently removes a Space.
 */
import * as spaces from "@/server/spaces/handlers";
import { authenticate, requireScope, requireWriter } from "@/server/api/http/auth";
import { boolParam, onlyParams, parseBody, readJson } from "@/server/api/http/body";
import { guard } from "@/server/api/http/guard";

interface Context {
  params: Promise<{ id: string }>;
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

    const input = parseBody(spaces.UpdateSpaceBodySchema, body.value, ["get_guide", "set_space"]);
    if ("status" in input) return input;

    return spaces.update({
      namespace_id: auth.ctx.namespace_id,
      space_id: id,
      name: input.name,
      emoji: input.emoji,
      shared: input.shared === true,
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
    // No `confirm` param: the guard against deleting pages is the 409 `space_not_empty`.
    const unknown = onlyParams(request, ["with_pages"]);
    if (unknown !== null) return unknown;
    const { id } = await context.params;
    const withPages = boolParam(request, "with_pages");
    if (!withPages.ok) return withPages.result;

    return spaces.remove({
      namespace_id: auth.ctx.namespace_id,
      space_id: id,
      with_pages: withPages.value === true,
    });
  });
}
