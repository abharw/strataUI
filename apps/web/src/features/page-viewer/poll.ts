import type { AttachmentResources } from "@/page-content/attachments/resources";
import { POLL_HIDDEN_MS, POLL_VISIBLE_MS } from "@/page-content/document/limits";
import { IDLE_PARK_MS } from "@/shared/polling";

export function nextPollDelay(visible: boolean): number {
  return visible ? POLL_VISIBLE_MS : POLL_HIDDEN_MS;
}

export type PollStop = "gone" | "idle";

/**
 * Whether the loop stops entirely. A deleted page is final; a hidden tab idle for `IDLE_PARK_MS`
 * stops unless an agent is mid-write.
 */
export function pollStop(input: {
  gone: boolean;
  agentUpdating: boolean;
  visible: boolean;
  lastInteractionAt: number;
  now: number;
}): PollStop | null {
  if (input.gone) return "gone";
  if (input.visible || input.agentUpdating) return null;
  return input.now - input.lastInteractionAt >= IDLE_PARK_MS ? "idle" : null;
}

/** Session-storage key recording a spent reload. */
export const RELOAD_MARK_KEY = "strata:live-reload";

/**
 * Spends this tab's one reload for `reason`. A reload can return the same stale bundle (cache,
 * lagging edge, rolling deploy), so the mark is written first and a spent `reason` is refused.
 * Without session storage the reload cannot be counted, so it is refused too.
 */
export function spendReload(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
  reason: string,
  reload: () => void,
): boolean {
  try {
    if (storage === undefined) return false;
    if (storage.getItem(RELOAD_MARK_KEY) === reason) return false;
    storage.setItem(RELOAD_MARK_KEY, reason);
  } catch {
    return false;
  }
  reload();
  return true;
}

/** Serving URLs live 10 minutes; refreshing at the halfway mark keeps every link valid. */
const ASSET_REFRESH_MS = 5 * 60_000;

export function assetsRunningOut(assets: AttachmentResources, now: number): boolean {
  let soonest = Infinity;
  for (const { href: url } of Object.values(assets)) {
    const query = url.split("?")[1];
    if (query === undefined) continue;
    const expires = Number(new URLSearchParams(query).get("expires"));
    if (!Number.isFinite(expires) || expires <= 0) continue;
    soonest = Math.min(soonest, expires * 1000);
  }
  if (soonest === Infinity) return false;
  return soonest - now <= ASSET_REFRESH_MS;
}
