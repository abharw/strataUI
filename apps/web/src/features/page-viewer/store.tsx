"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import { NO_STALE, ingestPoll } from "./ingest";
import type {
  AsksState,
  DocumentState,
  LifecycleState,
  PageActions,
  PageSnapshot,
  PageStore,
  TransportState,
} from "./state";

export type { PageSnapshot, PageStore } from "./state";

/** The slices share one `set`; no event may call it twice. */
type Write = (patch: Partial<PageStore>) => void;
type Read = () => PageStore;

/** Poll-owned fields. `ingest` is the only writer, so a tick lands as one `set`. */
function documentSlice(seed: PageSnapshot): DocumentState {
  return {
    meta: seed.meta,
    space: seed.space ?? null,
    spec: seed.spec,
    version: seed.version,
    updatedAt: seed.updatedAt,
    recent: seed.recent,
    // Absent in the seed means the page has no trail or no sequence.
    steps: seed.steps ?? null,
    sequence: seed.sequence ?? null,
    assets: seed.assets,
    writer: seed.writer,
    lastSummary: seed.lastSummary,
  };
}

function lifecycleSlice(
  seed: PageSnapshot,
  set: Write,
  get: Read,
): LifecycleState & Pick<PageActions, "setUser" | "setShared" | "setUrl"> {
  return {
    agentUpdating: seed.agentUpdating,
    user: seed.user,
    // Reader seeds carry no exposure.
    shared: seed.shared ?? false,
    ownerName: seed.ownerName,
    setUser: (user) => set({ user: { pinned: user.pinned ?? get().user.pinned } }),
    setShared: (shared) => set({ shared }),
    setUrl: (url) => set({ meta: { ...get().meta, url } }),
  };
}

function transportSlice(
  set: Write,
  get: Read,
): TransportState & Pick<PageActions, "setOffline" | "setNeedsReload" | "setGone"> {
  return {
    offline: false,
    needsReload: false,
    gone: false,
    // Set after a 404 survives one reload; nothing is left to poll for.
    setGone: () => {
      if (!get().gone) set({ gone: true });
    },
    // Offline fails every tick; only the first change notifies subscribers.
    setOffline: (offline) => {
      if (get().offline !== offline) set({ offline });
    },
    setNeedsReload: () => {
      if (!get().needsReload) set({ needsReload: true });
    },
  };
}

function asksSlice(
  seed: PageSnapshot,
  set: Write,
  get: Read,
): AsksState & Pick<PageActions, "setAnswer" | "markStale"> {
  return {
    asks: seed.asks,
    stale: NO_STALE,
    setAnswer: (ask) => {
      const state = get();
      set({
        asks: [...state.asks.filter((held) => held.approval_id !== ask.approval_id), ask],
        stale: withoutMark(state.stale, ask.approval_id),
      });
    },
    /**
     * Handles a 409 for a tap on moved-on wording. Returns false when the poll already showed new
     * wording, or when the refusal names the same wording (a re-ask writes no spec, so no snapshot
     * would ever clear a stale mark). Otherwise marks it stale until new wording arrives.
     */
    markStale: (approvalId, tappedKey, current) => {
      const state = get();
      const showing = state.asks.find((ask) => ask.approval_id === approvalId);
      if (showing !== undefined && showing.question_key !== tappedKey) return false;
      if (current !== undefined && current.question_key === tappedKey) {
        set({ asks: state.asks.map((ask) => (ask.approval_id === approvalId ? current : ask)) });
        return false;
      }
      if (state.stale.includes(approvalId)) return true;
      set({ stale: [...state.stale, approvalId] });
      return true;
    },
  };
}

function withoutMark(stale: readonly string[], approvalId: string): readonly string[] {
  if (!stale.includes(approvalId)) return stale;
  const left = stale.filter((id) => id !== approvalId);
  return left.length === 0 ? NO_STALE : left;
}

export function createPageStore(seed: PageSnapshot): StoreApi<PageStore> {
  return createStore<PageStore>((set, get) => ({
    ...documentSlice(seed),
    ...lifecycleSlice(seed, set, get),
    ...transportSlice(set, get),
    ...asksSlice(seed, set, get),
    // One tick, one `set`: Zustand notifies unconditionally, and separate writes would expose new
    // asks beside an old spec.
    ingest: (payload) => {
      const patch = ingestPoll(get(), payload);
      if (patch === "reload") return "reload";
      set(patch);
      return "ok";
    },
  }));
}

const PageStoreContext = createContext<StoreApi<PageStore> | null>(null);

export function PageStoreProvider({
  seed,
  children,
}: {
  seed: PageSnapshot;
  children: ReactNode;
}) {
  const [store] = useState(() => createPageStore(seed));
  return <PageStoreContext.Provider value={store}>{children}</PageStoreContext.Provider>;
}

export function usePageStore<T>(selector: (state: PageStore) => T): T {
  const store = use(PageStoreContext);
  if (store === null) {
    throw new Error("usePageStore must be used under PageStoreProvider");
  }
  return useStore(store, selector);
}

export function usePageStoreApi(): StoreApi<PageStore> {
  const store = use(PageStoreContext);
  if (store === null) {
    throw new Error("usePageStoreApi must be used under PageStoreProvider");
  }
  return store;
}
