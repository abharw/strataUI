import { requireWebSessionNamespace } from "@/server/auth/web-session";
import { guard } from "@/server/api/http/guard";
import { listSessionOwnedChanges } from "@/server/pages/read/assemble";

interface Context { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { namespaceId } = await requireWebSessionNamespace();
  return guard(request, async () => {
    const { id } = await context.params;
    const params = new URL(request.url).searchParams;
    const raw = params.get("since");
    const wantAssets = params.get("assets") === "refresh";
    return listSessionOwnedChanges(
      id,
      namespaceId,
      raw === null ? Number.NaN : Number(raw),
      wantAssets,
    );
  });
}
