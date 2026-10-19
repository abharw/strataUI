import { readHomeData, requireWebSessionNamespace } from "@/server/auth/web-session";
import { assembleOwnedPage, attachmentRedirect } from "@/server/pages/read/assemble";

interface Context { params: Promise<{ id: string; resource: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { namespaceId } = await requireWebSessionNamespace();
  const { id, resource } = await context.params;
  const assembled = await readHomeData(() => assembleOwnedPage(id, namespaceId));
  if (!assembled.ok) return new Response(null, { status: 404 });
  // `attachmentRedirect` reads the variant (`?w=thumb`) off the request and falls back to the
  // original when none exists.
  return readHomeData(() => attachmentRedirect(
    request,
    { spec: assembled.value.document.spec, steps: assembled.value.steps },
    assembled.value.namespaceId,
    decodeURIComponent(resource),
  ));
}
