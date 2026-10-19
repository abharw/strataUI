import type { Meta } from "@/page-content/document/types";
import type { AttachmentResources } from "@/page-content/attachments/resources";
import type { AssembledSequence, RecentChange } from "@/server/pages/read/assemble";
import type { PageWriter } from "@/server/pages/read/provenance";
import type { ApprovalAsk } from "@/page-content/blocks/approval/view";
import type { StrataSpec } from "@/page-content/schema";

/** A page's Space, as the owner reaches it. Owner audiences only. */
export type PageSpace = { name: string; url: string };

export type ChangesPayload = {
  version: number;
  /** Current title. A rename writes no spec, so it never moves the version or arrives as a snapshot. */
  title?: string;
  user?: { pinned: boolean };
  /** Owner audiences only. */
  space?: PageSpace;
  asks?: ApprovalAsk[];
  /** Fresh serving URLs, sent on a new spec or when the tab's own are near expiry. */
  assets?: AttachmentResources;
  /**
   * The full "View steps" trail on a changed tick. Sent whole because several writes can land
   * between two ticks.
   */
  steps?: RecentChange[];
  /** Sequence position for this reader. Derived from the spec, so sent only on a changed tick. */
  sequence?: AssembledSequence | null;
  /** The registry the server is writing specs against; see `ingestPoll`. */
  registry_version: number;
  agent_updating: boolean;
  updated_at: string;
  /** Last writer, when known and visible to this reader. `undefined` means leave it unchanged. */
  writer?: PageWriter | null;
  snapshot: { spec: StrataSpec; summary: string; at: string } | null;
};

/**
 * What the page shows and the poll can move. The poll applies each tick in one `set`, so a
 * subscriber reading two fields never sees half a tick.
 */
export interface DocumentState {
  meta: Meta;
  /** Null for readers: a page key is a capability on the page, not on the owner's Space. */
  space: PageSpace | null;
  spec: StrataSpec;
  version: number;
  updatedAt: string;
  /** Oldest last, so `.at(-1)` is the newest. */
  recent: readonly RecentChange[];
  /** The "View steps" trail, oldest last; null when the page does not show the section. */
  steps: readonly RecentChange[] | null;
  /** Null when the spec has no sequence or none of it resolves for this audience. */
  sequence: AssembledSequence | null;
  /** resource_id -> a server-minted URL valid for this render. */
  assets: AttachmentResources;
  /** The agent behind the last write, or null when there is nobody to name. */
  writer: PageWriter | null;
  lastSummary: string | null;
}

export interface LifecycleState {
  agentUpdating: boolean;
  user: { pinned: boolean };
  /**
   * Membership in the Space's shared bundle (owner only). Not "has a live link": every page has a
   * `pgk_` read key regardless.
   */
  shared: boolean;
  /** Seed-only: the owner's name for a reader who is not them. */
  ownerName: string | null;
}

export interface TransportState {
  offline: boolean;
  /** The server's registry is newer than this bundle and the one allowed reload is spent. */
  needsReload: boolean;
  /** The address no longer resolves (page deleted or key replaced), confirmed after one reload. */
  gone: boolean;
}

export interface AsksState {
  asks: readonly ApprovalAsk[];
  /**
   * Approvals whose on-screen wording is outdated. Buttons stay disabled until the new wording
   * arrives, so a tap never records consent to text the reader did not see.
   */
  stale: readonly string[];
}

/** Hydration seed. A reader seed omits the owner-only `shared` and `space`. */
export type PageSnapshot =
  & Omit<DocumentState, "space" | "steps" | "sequence">
  & Omit<LifecycleState, "shared">
  & Partial<Pick<DocumentState, "space" | "steps" | "sequence">>
  & Partial<Pick<LifecycleState, "shared">>
  & Pick<AsksState, "asks">;

export type PageState = DocumentState & LifecycleState & TransportState & AsksState;

export interface PageActions {
  ingest: (payload: ChangesPayload) => "ok" | "reload";
  setOffline: (offline: boolean) => void;
  setNeedsReload: () => void;
  setUser: (user: { pinned?: boolean }) => void;
  setGone: () => void;
  setShared: (shared: boolean) => void;
  setUrl: (url: string) => void;
  setAnswer: (ask: ApprovalAsk) => void;
  /** Returns whether the question is now waiting on wording it has not been sent. */
  markStale: (approvalId: string, tappedKey: string, current?: ApprovalAsk) => boolean;
}

export type PageStore = PageState & PageActions;
