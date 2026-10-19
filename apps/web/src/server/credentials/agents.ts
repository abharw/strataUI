/** The agents roster for Home, from `listGrants`, in the same `PageWriter` shape as page marks. */
import { listGrants } from "./grants";
import type { PageWriter } from "@/server/pages/read/provenance";

export interface AgentRoster extends PageWriter {
  /** `static`: one fixed key that never rotates; revoking is its only rotation. */
  mode: "rotating" | "static";
}

/**
 * How long a disconnected agent stays listed. Its pages keep its mark, so the row must outlive the
 * key long enough to look it up, without the roster becoming a log.
 */
const REVOKED_VISIBLE_DAYS = 30;

export async function loadAgentsForNamespace(
  namespaceId: string,
  now: Date = new Date(),
): Promise<AgentRoster[]> {
  const cutoff = now.getTime() - REVOKED_VISIBLE_DAYS * 86_400_000;
  return (await listGrants(namespaceId))
    .filter((grant) => grant.revokedAt === null || grant.revokedAt.getTime() >= cutoff)
    .map((grant) => ({
      grantId: grant.id,
      label: grant.label,
      driver: grant.driver,
      connectedAt: grant.createdAt.toISOString(),
      lastUsedAt: grant.lastUsedAt?.toISOString() ?? null,
      revokedAt: grant.revokedAt?.toISOString() ?? null,
      mode: grant.mode,
    }));
}
