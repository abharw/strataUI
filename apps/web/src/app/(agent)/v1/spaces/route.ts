/** `POST /v1/spaces` creates a space; `GET` lists spaces with page counts and latest change. */
import * as spaces from "@/server/spaces/handlers";
import { authenticate, requireScope, requireWriter } from "@/server/api/http/auth";
import { onlyParams, parseBody, readJson } from "@/server/api/http/body";
import { guard } from "@/server/api/http/guard";

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

    const input = parseBody(spaces.CreateSpaceBodySchema, body.value, ["get_guide", "create_space"]);
    if ("status" in input) return input;

    return spaces.create({
      namespace_id: auth.ctx.namespace_id,
      slug: input.slug,
      name: input.name,
      emoji: input.emoji,
      shared: input.shared === true,
      baseUrl: auth.ctx.baseUrl,
    });
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
    return spaces.list({ namespace_id: auth.ctx.namespace_id });
  });
}
