/** Owner-only search over the text inside the owner's Pages. */

import "server-only";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { MAX_PAGES_PER_NAMESPACE } from "@/page-content/document/limits";
import { textSpans } from "@/page-content/document/text";
import { MAX_OWNER_SEARCH_CHARS, normalizeOwnerSearch } from "@/shared/navigation/search";

export { MAX_OWNER_SEARCH_CHARS };

/**
 * Page ids whose reader-visible text contains `query`. Documents are read only on search, within
 * the 250-page ceiling, so Home's payload stays small and there is no second index to drift.
 */
export async function searchOwnedPageText(namespaceId: string, query: string): Promise<string[]> {
  const needle = normalizeOwnerSearch(query);
  if (needle === "") return [];

  const rows = await getDb().select({
    id: schema.pages.id,
    document: schema.pages.document,
  })
    .from(schema.pages)
    .where(eq(schema.pages.namespaceId, namespaceId))
    .limit(MAX_PAGES_PER_NAMESPACE);

  return rows.flatMap((row) => textSpans(row.document).some(
    (span) => normalizeOwnerSearch(span.text).includes(needle),
  ) ? [row.id] : []);
}
