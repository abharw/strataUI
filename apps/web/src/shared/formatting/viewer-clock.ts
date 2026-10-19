"use client";

/**
 * The reader's clock, locale and timezone. The server snapshot is `null` so hydration matches and
 * callers render nothing until the client answers. One shared minute tick, paused while hidden.
 */
import { useSyncExternalStore } from "react";

import type { ViewerZone } from "./list-time";

export interface ViewerClock extends ViewerZone {
  now: Date;
}

const TICK_MS = 60_000;

const listeners = new Set<() => void>();
let snapshot: ViewerClock | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function readClock(): ViewerClock {
  const locale = navigator.languages?.find((candidate) => candidate.length > 0)
    ?? navigator.language
    ?? "en-US";
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return { now: new Date(), locale, timeZone };
}

/** Keeps the snapshot identity unless the minute, locale or timezone changed. */
function refresh(): void {
  const next = readClock();
  const held = snapshot;
  if (
    held !== null
    && held.locale === next.locale
    && held.timeZone === next.timeZone
    && Math.floor(held.now.getTime() / TICK_MS) === Math.floor(next.now.getTime() / TICK_MS)
  ) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function refreshWhenVisible(): void {
  if (!document.hidden) refresh();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    refresh();
    timer = setInterval(refreshWhenVisible, TICK_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || timer === null) return;
    clearInterval(timer);
    timer = null;
    document.removeEventListener("visibilitychange", refreshWhenVisible);
  };
}

function getSnapshot(): ViewerClock {
  if (snapshot === null) snapshot = readClock();
  return snapshot;
}

function getServerSnapshot(): ViewerClock | null {
  return null;
}

export function useViewerClock(): ViewerClock | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
