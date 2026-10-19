"use client";

/**
 * First-run guidance for an empty Strata: three steps and a live status line. It polls only while
 * mounted, so Home stops polling once the first Page lands.
 */
import { SparkleIcon } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { IDLE_PARK_MS } from "@/shared/polling";
import type { AgentRoster } from "@/server/credentials/agents";
import { ownerRoutes } from "@/shared/navigation/owner-routes";
import { cn } from "@/shared/ui/cn";

import { EmptyState } from "@/shared/ui/empty-state";
import { productTextMuted } from "@/shared/ui/styles";

/**
 * Before an agent connects, poll a small JSON read every 5s. After, only a Home re-render can show
 * the first write, so refresh every 15s.
 */
const AGENT_POLL_MS = 5_000;
const PAGE_POLL_MS = 15_000;

const FIRST_RUN_STEPS = [
  "Tell your assistant “Use Strata”.",
  "It asks for your email and a code.",
  "Your first Page appears here.",
];

function liveAgents(agents: readonly AgentRoster[] | undefined): readonly AgentRoster[] {
  return (agents ?? []).filter((agent) => agent.revokedAt === null);
}

/** Connected count from `GET /home/agents`, or null on any failure (retry next tick). */
async function connectedCount(endpoint: string, signal: AbortSignal): Promise<number | null> {
  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const agents = (body as { agents?: unknown }).agents;
    if (!Array.isArray(agents)) return null;
    return agents.filter((agent) => (agent as { revoked_at?: unknown }).revoked_at === null).length;
  } catch {
    return null;
  }
}

function useFirstRunWatch(connected: number): void {
  const router = useRouter();
  const lastInteraction = useRef(0);

  useEffect(() => {
    const endpoint = ownerRoutes().agents;
    const controller = new AbortController();
    let timer = 0;
    let stopped = false;
    let parked = false;
    lastInteraction.current = Date.now();

    function schedule(delay: number) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), delay);
    }

    async function tick() {
      if (stopped) return;
      // A hidden tab does not poll; it re-reads on return.
      if (document.visibilityState !== "visible") {
        schedule(AGENT_POLL_MS);
        return;
      }
      // Park after `IDLE_PARK_MS` without interaction; any pointer, key or return wakes it.
      if (Date.now() - lastInteraction.current >= IDLE_PARK_MS) {
        parked = true;
        return;
      }
      if (connected > 0) {
        router.refresh();
        schedule(PAGE_POLL_MS);
        return;
      }
      const count = await connectedCount(endpoint, controller.signal);
      if (stopped) return;
      // Refresh the server render on change so the status line and tree agree on the roster.
      if (count !== null && count !== connected) router.refresh();
      schedule(AGENT_POLL_MS);
    }

    function wake() {
      lastInteraction.current = Date.now();
      if (!parked) return;
      parked = false;
      void tick();
    }

    document.addEventListener("visibilitychange", wake);
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", wake);
    schedule(connected > 0 ? PAGE_POLL_MS : AGENT_POLL_MS);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [connected, router]);
}

export function HomeFirstRun({ agents }: { agents?: readonly AgentRoster[] }) {
  const live = liveAgents(agents);
  useFirstRunWatch(live.length);
  const assistant = live[0];

  return (
    <div data-strata-first-run="" className="flex flex-col gap-4">
      <EmptyState
        size="screen"
        icon={SparkleIcon}
        title="Nothing here yet"
        description={
          // Numerals are drawn and hidden from the accessible tree, since the list already counts.
          <ol className="mx-auto flex max-w-[22rem] flex-col gap-1.5 text-left">
            {FIRST_RUN_STEPS.map((step, index) => (
              <li key={step} className="flex gap-2">
                <span aria-hidden className="tabular-nums">{index + 1}</span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>
        }
      />
      {/* Live region: it changes without user input. */}
      <p
        // Keyed on state so it re-mounts with the strip entrance when an assistant connects.
        key={assistant === undefined ? "waiting" : "connected"}
        role="status"
        aria-live="polite"
        data-strata-first-run-status=""
        className={cn(
          `text-center text-supporting leading-5 ${productTextMuted}`,
          assistant === undefined ? null : "strata-strip-in",
        )}
      >
        {assistant === undefined
          ? "Waiting for your assistant…"
          : `${assistant.label} connected · your first Page will appear here`}
      </p>
    </div>
  );
}
