/** `GET /share/:spk/pages/:id/assets/:resource`: attachment redirect for a bundle member. */
import { bundleAttachmentRedirect } from "@/server/pages/read/assemble";
import { loadSpace } from "@/server/spaces/read/lists";

interface Context { params: Promise<{ key: string; id: string; resource: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { key, id, resource } = await context.params;
  const bundle = await loadSpace(key);
  if (!bundle.ok) return new Response(null, { status: 404 });
  return bundleAttachmentRedirect(request, bundle.value.id, id, decodeURIComponent(resource));
}
