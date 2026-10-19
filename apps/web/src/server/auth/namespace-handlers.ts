/** Namespace deletion. Owner only, via the `deleteStrata` Server Action; no `/v1` route. */
import { eraseNamespace } from "./namespaces";

import { isUuid, namespaceGone, ok, type HandlerResult } from "@/shared/api/types";

/** Erase one Strata. The id comes from the session; a missing namespace is `namespaceGone`. */
export async function remove(namespaceId: string): Promise<HandlerResult> {
  if (!isUuid(namespaceId)) return namespaceGone();

  const erased = await eraseNamespace(namespaceId);
  if (erased === null) return namespaceGone();

  // The only trace left; the id resolves to nothing from here on.
  console.info("namespace erased", { namespace_id: namespaceId, ...erased });
  return ok({ namespace_id: namespaceId, deleted: true, ...erased });
}
