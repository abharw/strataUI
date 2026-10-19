/**
 * One-shot upload URL. The query-string signature is the capability (one asset, a few minutes,
 * one push), which keeps the access token out of a URL an agent may hand to another client.
 */
import * as assets from "@/server/assets/handlers";
import { guard } from "@/server/api/http/guard";
import { MAX_ASSET_BYTES } from "@/page-content/document/limits";

interface Context { params: Promise<{ id: string }> }

export async function PUT(request: Request, context: Context): Promise<Response> {
  return guard(request, async () => {
    const { id } = await context.params;
    const url = new URL(request.url);
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_ASSET_BYTES) {
      return {
        status: 413,
        body: {
          error: `That file is larger than the ${String(MAX_ASSET_BYTES)} byte limit for one asset.`,
          code: "asset_too_large",
          next: ["reserve_asset"],
        },
      };
    }
    const bytes = Buffer.from(await request.arrayBuffer());
    return assets.upload({
      asset_id: id,
      expires: url.searchParams.get("expires"),
      signature: url.searchParams.get("signature"),
      bytes,
    });
  });
}
