/** `GET /v1/manifest[?components=chart,table]` returns the component catalog or a named subset. */
import * as manifest from "@/server/api/authoring/manifest";
import { authenticate, requireScope } from "@/server/api/http/auth";
import { onlyParams } from "@/server/api/http/body";
import { guard } from "@/server/api/http/guard";

export async function GET(request: Request): Promise<Response> {
  return guard(request, async () => {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.result;
    const denied = requireScope(auth.ctx, "pages:read");
    if (denied !== null) return denied;
    const unknown = onlyParams(request, ["components"]);
    if (unknown !== null) return unknown;
    const components = new URL(request.url).searchParams.get("components");
    return manifest.get({ components: components ?? undefined });
  });
}
