/**
 * Namespace write quotas. `claimWrite` serializes each page write before counting and
 * `recordPageWrite` debits in the same transaction; all limits share one `quota_exceeded` code.
 */
import { and, eq, sql } from "drizzle-orm";

import { schema } from "@/server/db";
import { MAX_PAGE_WRITES_PER_NAMESPACE_PER_DAY } from "@/page-content/document/limits";
import { fail, type HandlerResult } from "@/shared/api/types";
import type { Tx } from "@/server/credentials/provision";

export function quotaExceeded(resource: "spaces" | "pages" | "page_writes", limit: number): HandlerResult {
  return {
    status: 429,
    body: {
      error: `This namespace has reached its ${resource.replace("_", " ")} limit of ${limit}.`,
      code: "quota_exceeded",
      resource,
      limit,
      // Dispatchable operations only. Write quotas reset on their own, so just list what exists.
      next: resource === "page_writes" ? ["list_pages"] : ["list_pages", "set_page", "delete_page"],
    },
  };
}

/**
 * The daily budget key, pinned to UTC. `current_date` follows the session `TimeZone`, which would
 * roll the budget over at a different instant than documented.
 */
const UTC_DAY = sql`(now() at time zone 'utc')::date`;

export async function recordPageWrite(tx: Tx, namespaceId: string): Promise<void> {
  await tx
    .insert(schema.namespaceUsage)
    .values({ namespaceId, day: UTC_DAY, pageWrites: 1 })
    .onConflictDoUpdate({
      target: [schema.namespaceUsage.namespaceId, schema.namespaceUsage.day],
      set: {
        pageWrites: sql`${schema.namespaceUsage.pageWrites} + 1`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Serialize quota checks and writes for one namespace so parallel agent calls
 * cannot all pass the same count and overrun the hard cap.
 */
export async function claimWrite(tx: Tx, namespaceId: string): Promise<HandlerResult | null> {
  const [namespace] = await tx
    .select({ id: schema.namespaces.id })
    .from(schema.namespaces)
    .where(eq(schema.namespaces.id, namespaceId))
    .for("update");
  if (namespace === undefined) {
    return fail(401, { error: "This namespace no longer exists.", code: "unauthenticated", next: ["get_guide"] });
  }
  const [usage] = await tx
    .select({ writeCount: schema.namespaceUsage.pageWrites })
    .from(schema.namespaceUsage)
    .where(and(
      eq(schema.namespaceUsage.namespaceId, namespaceId),
      eq(schema.namespaceUsage.day, UTC_DAY),
    ));
  if ((usage?.writeCount ?? 0) >= MAX_PAGE_WRITES_PER_NAMESPACE_PER_DAY) {
    return quotaExceeded("page_writes", MAX_PAGE_WRITES_PER_NAMESPACE_PER_DAY);
  }
  return null;
}
