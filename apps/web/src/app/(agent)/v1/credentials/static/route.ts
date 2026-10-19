/**
 * A connected writer mints a static credential for an agent that can only hold a fixed string
 * (a ChatGPT Action, a cron job). Requires `namespace:pair`; the new grant records its issuer.
 */
import * as credentials from "@/server/credentials/handlers";
import { authenticate, requireScope, requireWriter } from "@/server/api/http/auth";
import { onlyParams, parseBody, readJson } from "@/server/api/http/body";
import { guard } from "@/server/api/http/guard";
import { SCOPES } from "@/server/credentials";

const NEXT = ["get_manifest", "put_page"] as const;

export async function POST(request: Request): Promise<Response> {
  return guard(request, async () => {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.result;
    // Kind before scope: a viewer is read-only whatever its scope string says.
    const readOnly = requireWriter(auth.ctx);
    if (readOnly !== null) return readOnly;
    const denied = requireScope(auth.ctx, SCOPES.namespacePair);
    if (denied !== null) return denied;

    const unknown = onlyParams(request, []);
    if (unknown !== null) return unknown;
    const body = await readJson(request);
    if (!body.ok) return body.result;

    const input = parseBody(credentials.StaticAgentBodySchema, body.value, [...NEXT]);
    if ("status" in input) return input;

    // Records the calling grant as issuer. Revoking the issuer does not cascade.
    return credentials.mintStaticAgent(
      auth.ctx.namespace_id,
      { driver: input.driver, label: input.label },
      auth.ctx.grant_id,
    );
  });
}
