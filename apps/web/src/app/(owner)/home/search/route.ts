/**
 * `GET /home/search`: body-text matches for the owner, returned as Page IDs only so no content
 * or capabilities reach the client. `owner` adds the no-cache/no-index headers.
 */
import { requireWebSessionNamespace } from "@/server/auth/web-session";
import { guard, redactError } from "@/server/api/http/guard";
import { owner } from "@/server/credentials/handlers";
import { fail, ok } from "@/shared/api/types";
import {
  MAX_OWNER_SEARCH_CHARS,
  searchOwnedPageText,
} from "@/server/pages/read/search";

export async function GET(request: Request): Promise<Response> {
  const { namespaceId } = await requireWebSessionNamespace();
  return guard(request, async () => {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    if ([...query].length > MAX_OWNER_SEARCH_CHARS) {
      return owner(fail(400, {
        error: `Search is limited to ${MAX_OWNER_SEARCH_CHARS} characters.`,
        code: "invalid_request",
        path: "/q",
        next: ["open_home"],
      }));
    }

    try {
      return owner(ok({ page_ids: await searchOwnedPageText(namespaceId, query) }));
    } catch (error) {
      // A 500, not an empty result, so Home can offer a retry.
      console.error("home: Page search failed", redactError(error));
      return owner(fail(500, {
        error: "Page text could not be searched.",
        code: "internal_error",
        next: ["open_home"],
      }));
    }
  });
}
