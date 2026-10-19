import { REGISTRY_VERSION } from "@/page-content/catalog-versions";
import type { ApprovalAsk } from "@/page-content/blocks/approval/view";

import type { ChangesPayload, PageSpace, PageState } from "./state";

/** Shared empty list, so every `Approval` reading `stale` keeps a stable identity across ticks. */
export const NO_STALE: readonly string[] = Object.freeze([]);

/** Cap on what a long-lived tab accumulates; matches the server's unseen-writes window. */
const MAX_RECENT = 8;

/**
 * One poll tick as a single patch. A newer server registry means this bundle is stale, so it
 * returns "reload" before taking the spec. A server that omits the field is not a skew.
 */
export function ingestPoll(
  current: PageState,
  payload: ChangesPayload,
): Partial<PageState> | "reload" {
  if (typeof payload.registry_version === "number" && payload.registry_version !== REGISTRY_VERSION) {
    return "reload";
  }
  const patch: Partial<PageState> = {
    agentUpdating: payload.agent_updating,
    updatedAt: payload.updated_at,
    offline: false,
  };
  // A stale mark clears only with a snapshot carrying the new wording. Asks arrive on every tick
  // as fresh JSON, so an unchanged list is dropped to avoid re-rendering every question.
  if (Array.isArray(payload.asks) && !sameAsks(current.asks, payload.asks)) {
    patch.asks = payload.asks;
  }
  // Asset URLs are not question wording, so they are safe to take on any tick.
  if (payload.assets !== undefined) patch.assets = payload.assets;
  // Rename and move write no spec, so they arrive on every tick; write only on real change.
  if (payload.title !== undefined && payload.title !== current.meta.title) {
    patch.meta = { ...current.meta, title: payload.title };
  }
  if (payload.space !== undefined && !sameSpace(current.space, payload.space)) {
    patch.space = payload.space;
  }
  // The poll is how a pin made from Home or another tab reaches this one.
  if (payload.user !== undefined && payload.user.pinned !== current.user.pinned) {
    patch.user = payload.user;
  }
  // An agent can take a page over without the version moving.
  if (payload.writer !== undefined) patch.writer = payload.writer;
  if (payload.snapshot === null) return patch;

  patch.spec = payload.snapshot.spec;
  patch.version = payload.version;
  patch.lastSummary = payload.snapshot.summary;
  patch.recent = [
    ...current.recent,
    { version: payload.version, summary: payload.snapshot.summary, at: payload.snapshot.at },
  ].slice(-MAX_RECENT);
  // The server sends the full trail for every write this tick spans.
  if (payload.steps !== undefined) patch.steps = payload.steps;
  // `sequence` only moves with a spec, so it is applied on this changed-tick branch.
  if (payload.sequence !== undefined) patch.sequence = payload.sequence;
  // This snapshot carries the wording stale marks were waiting for.
  if (current.stale.length > 0) patch.stale = NO_STALE;
  return patch;
}

function sameSpace(held: PageSpace | null, incoming: PageSpace): boolean {
  return held !== null && held.name === incoming.name && held.url === incoming.url;
}

function sameAsks(held: readonly ApprovalAsk[], incoming: readonly ApprovalAsk[]): boolean {
  if (held.length !== incoming.length) return false;
  return held.every((ask, index) => {
    const next = incoming[index];
    return (
      ask.approval_id === next.approval_id &&
      ask.ask_seq === next.ask_seq &&
      ask.question_key === next.question_key &&
      ask.answer?.chosen_id === next.answer?.chosen_id &&
      ask.answer?.answered_at === next.answer?.answered_at
    );
  });
}
