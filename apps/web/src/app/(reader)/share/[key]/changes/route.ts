/** `GET /share/:key/changes`: polling for an open share link. Page keys only; `spk_` keys 404. */
import { guard } from "@/server/api/http/guard";
import { listChanges } from "@/server/pages/read/assemble";

interface Context { params: Promise<{ key: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  return guard(request, async () => {
    const { key } = await context.params;
    const params = new URL(request.url).searchParams;
    const raw = params.get("since");
    const wantAssets = params.get("assets") === "refresh";
    return listChanges(key, raw === null ? Number.NaN : Number(raw), wantAssets);
  });
}
