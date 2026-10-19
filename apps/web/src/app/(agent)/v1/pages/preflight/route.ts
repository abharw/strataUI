/**
 * `POST /v1/pages/preflight` checks a candidate spec and reports its budgets
 * without storing it. Request metadata and database state are checked at write.
 */
import * as pages from "@/server/pages/handlers";
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

    const input = parseBody(pages.PreflightBodySchema, body.value, ["get_guide", "preflight_page"]);
    if ("status" in input) return input;

    return pages.preflight({ kind: input.kind, spec: input.spec });
  });
}
