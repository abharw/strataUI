/**
 * `GET /share/:key/assets/:resource`: mints the short-lived asset signature at tap time, so a page
 * left open never holds expired links. An `spk_` key works only for a one-page bundle.
 */
import { hasKeyPrefix } from "@/server/credentials/keys";
import { assemblePage, attachmentRedirect, bundleAttachmentRedirect } from "@/server/pages/read/assemble";
import { loadSpace } from "@/server/spaces/read/lists";

interface Context { params: Promise<{ key: string; resource: string }> }

const NOT_FOUND = new Response(null, { status: 404 });

export async function GET(request: Request, context: Context): Promise<Response> {
  const { key, resource } = await context.params;
  const resourceId = decodeURIComponent(resource);

  if (hasKeyPrefix(key, "space")) {
    const bundle = await loadSpace(key);
    if (!bundle.ok || bundle.value.pages.length !== 1) return NOT_FOUND;
    return bundleAttachmentRedirect(request, bundle.value.id, bundle.value.pages[0].id, resourceId);
  }

  const assembled = await assemblePage(key);
  if (!assembled.ok) return NOT_FOUND;
  // `attachmentRedirect` reads `?w=thumb` off the request and falls back to the original.
  return attachmentRedirect(
    request,
    { spec: assembled.value.document.spec, steps: assembled.value.steps },
    assembled.value.namespaceId,
    resourceId,
  );
}
