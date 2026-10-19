"use client";

/**
 * The agents legend: the one place an attribution glyph is shown with its name. A revoked grant
 * stays listed (its pages are still attributed to it) but has no Disconnect button.
 */
import { useState, useTransition } from "react";

import { formatListTime, formatShortDay } from "@/shared/formatting/list-time";
import type { AgentRoster } from "@/server/credentials/agents";
import { Button } from "@/shared/ui/primitives/button";
import {
  Item,
  ItemActions,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from "@/shared/ui/primitives/item";
import { cn } from "@/shared/ui/cn";
import { disconnectAgent } from "@/app/(owner)/home/actions";

import { showChromeNotice } from "@/shared/ui/overflow-menu";
import { AgentAvatar } from "@/shared/ui/agent-avatar";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { productRowAction, productTextMuted } from "@/shared/ui/styles";
import { useViewerClock, type ViewerClock } from "@/shared/formatting/viewer-clock";

export type AgentRow = AgentRoster;

/**
 * `15h ago · since Jul 2`: last write and first connection; a revoked grant shows only when it
 * stopped. Until the viewer's clock is known, a blank line reserves the height.
 */
function metaText(agent: AgentRow, clock: ViewerClock | null): string {
  if (clock === null) return " ";
  if (agent.revokedAt !== null) {
    return `Disconnected ${formatShortDay(agent.revokedAt, clock)}`;
  }
  const connected = `since ${formatShortDay(agent.connectedAt, clock)}`;
  if (agent.lastUsedAt === null) return `Since ${formatShortDay(agent.connectedAt, clock)}`;
  return `${formatListTime(agent.lastUsedAt, clock.now, clock)} · ${connected}`;
}

/**
 * One agent row with its Disconnect confirmation. The action revalidates Home, so nothing here
 * refreshes the router.
 */
function AgentItem({ agent, clock }: { agent: AgentRow; clock: ViewerClock | null }) {
  const revoked = agent.revokedAt !== null;
  const metadata = metaText(agent, clock);
  const [confirming, setConfirming] = useState(false);
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const asking = confirming && !revoked;

  function disconnect() {
    setBusy(true);
    startTransition(async () => {
      try {
        const result = await disconnectAgent(agent.grantId);
        showChromeNotice(result.ok
          ? { kind: "success", text: `${agent.label} disconnected` }
          : { kind: "error", text: "Couldn’t disconnect that agent. Try again." });
        // Close the question on failure too; the grant stays live and the row remains.
        setConfirming(false);
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <Item role="listitem" className="gap-y-0 border-0 px-0 py-2.5">
      <ItemHeader className="min-h-control min-w-0 justify-start gap-3">
        <ItemMedia>
          <AgentAvatar writer={agent} size="md" />
        </ItemMedia>
        <ItemTitle title={agent.label} className="min-w-0 flex-1 truncate text-row leading-5">
          {agent.label}
        </ItemTitle>
        {revoked ? null : (
          <ItemActions className="shrink-0">
            <Button
              type="button"
              onClick={() => setConfirming(true)}
              variant="outline"
              // The negative margin cancels the padding so the label sits on the shared gutter.
              className={cn("-mr-3 shrink-0", productRowAction)}
            >
              Disconnect
            </Button>
          </ItemActions>
        )}
      </ItemHeader>
      <ItemDescription
        title={clock === null ? undefined : metadata}
        className={cn("basis-full truncate pl-9 text-supporting leading-5", productTextMuted)}
      >
        {metadata}
      </ItemDescription>
      <ConfirmDialog
        open={asking}
        onOpenChange={setConfirming}
        title={`Disconnect ${agent.label}?`}
        description="Its own key stops working. Other agents and shared links are unaffected, and connecting it again takes a new code."
        cancelLabel="Keep connected"
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting…"
        destructive
        pending={busy}
        onConfirm={disconnect}
      />
    </Item>
  );
}

export function AgentsList({
  agents,
  className,
}: {
  agents: readonly AgentRow[];
  className?: string;
}) {
  const clock = useViewerClock();

  if (agents.length === 0) {
    return <EmptyState title="No agents connected yet." className={className} />;
  }

  return (
    <ItemGroup className={cn("gap-0", className)}>
      {agents.map((agent) => (
        <AgentItem key={agent.grantId} agent={agent} clock={clock} />
      ))}
    </ItemGroup>
  );
}
