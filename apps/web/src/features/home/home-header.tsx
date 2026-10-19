"use client";

/**
 * Home's header. In selection mode the title becomes the count and the menu becomes the toolbar;
 * the inventory line stays so the layout never shifts.
 */

import type { ReactNode } from "react";

import { ChromeTitle } from "@/features/navigation/chrome-title";
import { productTextMuted } from "@/shared/ui/styles";
import type { OwnerSessionSummary } from "@/server/auth/owner-session";
import type { AgentRoster } from "@/server/credentials/agents";

import { HomeGreeting } from "./greeting";
import { useHomeSelection } from "./home-selection";
import { HomeManagementMenu } from "@/features/account/home-management-menu";
import { HomeSelectionToolbar } from "./selection-toolbar";

/** A selection count, a greeting, or "Home". */
function HomeHeaderTitle({ personName }: { personName: string | null }) {
  const selection = useHomeSelection();

  if (selection?.state.selecting === true) {
    return (
      <ChromeTitle aria-live="polite" className="truncate transition-opacity duration-[120ms] ease-(--ease-out) starting:opacity-0">
        {selection.meta.selectedCount === 0 ? "Select items" : `${selection.meta.selectedCount} selected`}
      </ChromeTitle>
    );
  }
  // No surface invents a name; without one, the title is "Home".
  if (personName !== null && personName.trim() !== "") {
    return <HomeGreeting personName={personName} />;
  }
  return <ChromeTitle>Home</ChromeTitle>;
}

function HomeHeaderActions({
  agents,
  sessions,
}: {
  agents?: AgentRoster[];
  sessions?: OwnerSessionSummary[];
}) {
  const selection = useHomeSelection();

  if (selection?.state.selecting === true) {
    return (
      <HomeSelectionToolbar
        selectedPageIds={selection.meta.selectedPageIds}
        selectedSpaceIds={selection.meta.selectedSpaceIds}
        allSelectedPagesPinned={selection.meta.allSelectedPagesPinned}
        onExit={selection.actions.exit}
      />
    );
  }
  return (
    <HomeManagementMenu agents={agents} sessions={sessions} onSelect={selection?.actions.enter} />
  );
}

export function HomeHeader({
  personName,
  spaceCount,
  pageCount,
  agents,
  sessions,
  children,
}: {
  personName: string | null;
  spaceCount: number;
  pageCount: number;
  /** Undefined on fixtures that model no roster. */
  agents?: AgentRoster[];
  sessions?: OwnerSessionSummary[];
  children?: ReactNode;
}) {
  const pageLabel = `${pageCount} Page${pageCount === 1 ? "" : "s"}`;
  const spaceLabel = `${spaceCount} Space${spaceCount === 1 ? "" : "s"}`;

  return (
    <header className="px-0.5 pt-1 sm:pt-3">
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <HomeHeaderTitle personName={personName} />
          <p className={`mt-1.5 text-supporting leading-5 ${productTextMuted}`}>{spaceLabel} · {pageLabel}</p>
        </div>
        <div className="-mt-1 -mr-2 shrink-0">
          <HomeHeaderActions agents={agents} sessions={sessions} />
        </div>
      </div>
      {children}
    </header>
  );
}
