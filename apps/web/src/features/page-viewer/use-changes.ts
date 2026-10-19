"use client";

import { useEffect, useRef } from "react";
import type { StoreApi } from "zustand/vanilla";

import type { ChangesPayload, PageStore } from "./state";
import {
  RELOAD_MARK_KEY,
  assetsRunningOut,
  nextPollDelay,
  pollStop,
  spendReload,
} from "./poll";

/**
 * "Poll now" as a signal rather than store state, so a refused tap can pull the poll forward
 * without waking store subscribers.
 */
export interface RefreshSignal {
  request: () => void;
  subscribe: (listener: () => void) => () => void;
}

export function createRefreshSignal(): RefreshSignal {
  const listeners = new Set<() => void>();
  return {
    request: () => {
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

async function pull(
  endpoint: string,
  since: number,
  wantAssets: boolean,
): Promise<ChangesPayload | "offline" | "gone"> {
  try {
    const separator = endpoint.includes("?") ? "&" : "?";
    const refresh = wantAssets ? "&assets=refresh" : "";
    const response = await fetch(`${endpoint}${separator}since=${since}${refresh}`, {
      cache: "no-store",
    });
    if (response.status === 404) return "gone";
    if (!response.ok) return "offline";
    const body: unknown = await response.json();
    if (
      body === null ||
      typeof body !== "object" ||
      !("version" in body) ||
      !("snapshot" in body) ||
      !("agent_updating" in body) ||
      !("updated_at" in body)
    ) {
      return "offline";
    }
    return body as ChangesPayload;
  } catch {
    return "offline";
  }
}

function sessionStore(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function useChangesPoll(
  store: StoreApi<PageStore>,
  endpoint: string,
  refresh: RefreshSignal,
): void {
  const lastInteraction = useRef(0);
  const timer = useRef<number>(0);
  // A tick mid-pull cannot be cancelled by clearing its timeout, so each loop carries a generation
  // and stale ticks exit instead of scheduling a successor.
  const generation = useRef(0);
  // Stopped rather than slowed; only a wake restarts it.
  const parked = useRef(false);
  const skewCleared = useRef(false);

  useEffect(() => {
    let cancelled = false;
    lastInteraction.current = Date.now();
    parked.current = false;

    function clear() {
      window.clearTimeout(timer.current);
    }

    function stopReason() {
      const state = store.getState();
      return pollStop({
        gone: state.gone,
        agentUpdating: state.agentUpdating,
        visible: document.visibilityState === "visible",
        lastInteractionAt: lastInteraction.current,
        now: Date.now(),
      });
    }

    /**
     * Registry skew: spend one reload. If that already happened, stop and show the notice instead
     * of reloading every tick.
     */
    function handleSkew(registryVersion: number) {
      const reloaded = spendReload(sessionStore(), `registry:${registryVersion}`, () =>
        window.location.reload(),
      );
      if (reloaded) return;
      store.getState().setNeedsReload();
      parked.current = true;
    }

    async function tick(mine: number) {
      if (cancelled || mine !== generation.current) return;
      // Deleted pages and tabs idle for 30 minutes stop here; `wake` re-arms the idle case.
      if (stopReason() !== null) {
        parked.current = true;
        return;
      }
      // File links expire; refresh them before the on-screen ones die.
      const result = await pull(
        endpoint,
        store.getState().version,
        assetsRunningOut(store.getState().assets, Date.now()),
      );
      if (cancelled || mine !== generation.current) return;
      if (result === "gone") {
        // Reload once to render the real answer; after that, show the missing-link screen.
        if (!spendReload(sessionStore(), `gone:${endpoint}`, () => window.location.reload())) {
          store.getState().setGone();
          parked.current = true;
        }
        return;
      }
      if (result === "offline") {
        store.getState().setOffline(true);
      } else if (store.getState().ingest(result) === "reload") {
        handleSkew(result.registry_version);
        return;
      } else if (!skewCleared.current) {
        // A renderable registry ends any earlier skew, so the next one gets its own reload.
        skewCleared.current = true;
        try {
          sessionStore()?.removeItem(RELOAD_MARK_KEY);
        } catch {
          // Storage that refuses access cannot hold a stale mark.
        }
      }
      timer.current = window.setTimeout(
        () => void tick(mine),
        nextPollDelay(document.visibilityState === "visible"),
      );
    }

    /** Polls now, abandoning any pending or in-flight tick. */
    function pullForward() {
      parked.current = false;
      clear();
      generation.current += 1;
      const mine = generation.current;
      timer.current = window.setTimeout(() => void tick(mine), 0);
    }

    function onVisibility() {
      lastInteraction.current = Date.now();
      // A returning reader is likely looking, and the hidden-tab tick may be 30s away.
      if (document.visibilityState === "visible") pullForward();
    }

    function onInteraction() {
      lastInteraction.current = Date.now();
      if (parked.current) pullForward();
    }

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerdown", onInteraction);
    document.addEventListener("keydown", onInteraction);
    const first = generation.current;
    timer.current = window.setTimeout(
      () => void tick(first),
      nextPollDelay(document.visibilityState === "visible"),
    );

    const unsubscribe = refresh.subscribe(() => {
      lastInteraction.current = Date.now();
      pullForward();
    });

    return () => {
      cancelled = true;
      clear();
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerdown", onInteraction);
      document.removeEventListener("keydown", onInteraction);
    };
  }, [store, endpoint, refresh]);
}
