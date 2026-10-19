"use client";

import { ListChecksIcon } from "@phosphor-icons/react/dist/ssr/ListChecks";
import { TrashIcon } from "@phosphor-icons/react/dist/ssr/Trash";
import { useState, useTransition, type ReactNode } from "react";

import { deleteStrata } from "@/app/(owner)/home/actions";
import type { OwnerActionResult } from "@/app/(owner)/home/action-result";
import { AppIcon } from "@/shared/ui/app-icon";
import { Separator } from "@/shared/ui/primitives/separator";
import type { OwnerSessionSummary } from "@/server/auth/owner-session";
import type { AgentRoster } from "@/server/credentials/agents";

import { AgentsList } from "./agents-list";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DevicesList } from "./devices-list";
import {
  ChromeActionBody,
  ChromeActionContent,
  ChromeActionMenu,
  ChromeActionRow,
  ChromeActionTrigger,
  showChromeNotice,
} from "@/shared/ui/overflow-menu";

function ManagementHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2
      id={id}
      className="px-3 text-body font-semibold leading-5 tracking-[-0.005em]"
    >
      {children}
    </h2>
  );
}

function ManagementSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <ManagementHeading id={id}>{title}</ManagementHeading>
      {children}
    </section>
  );
}

/**
 * Account deletion (required by App Store guideline 5.1.1(v)), last in the Drawer. The typed word
 * is re-checked on the server. Success redirects, so nothing here closes the Drawer.
 */
function DeleteStrata() {
  const [confirming, setConfirming] = useState(false);
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  function erase() {
    setBusy(true);
    startTransition(async () => {
      try {
        // `undefined` on success: the action redirects instead of returning a value.
        const answer: OwnerActionResult | undefined = await deleteStrata("DELETE");
        if (answer !== undefined && !answer.ok) {
          showChromeNotice({ kind: "error", text: "Couldn’t delete this Strata. Try again." });
          setConfirming(false);
        }
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <>
      <ChromeActionRow
        icon={<AppIcon icon={TrashIcon} />}
        variant="destructive"
        // The section's rule and heading already separate this row.
        className="mt-0"
        onClick={() => setConfirming(true)}
      >
        Delete my Strata
      </ChromeActionRow>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete your Strata?"
        description="Every Page, Space, link and connected agent is erased for good. Links stop opening for everyone. This can’t be undone."
        challenge={{ word: "DELETE", label: "Type “DELETE” to confirm" }}
        confirmLabel="Delete my Strata"
        pendingLabel="Deleting…"
        destructive
        pending={busy}
        onConfirm={erase}
      />
    </>
  );
}

/** Home's low-frequency lifecycle and access controls, behind one trigger. */
export function HomeManagementMenu({
  agents,
  sessions,
  onSelect,
}: {
  agents?: readonly AgentRoster[];
  sessions?: readonly OwnerSessionSummary[];
  onSelect?: () => void;
}) {
  // Selection is a state change behind the Drawer, so close the Drawer explicitly.
  const [open, setOpen] = useState(false);

  return (
    <ChromeActionMenu open={open} onOpenChange={setOpen}>
      <ChromeActionTrigger label="Manage Home" />
      <ChromeActionContent
        title="Manage Strata"
        description="Bulk changes and account access."
        className="[--drawer-max-height:min(48rem,84dvh)]"
      >
        <ChromeActionBody className="gap-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]">
          {onSelect === undefined ? null : (
            <ChromeActionRow
              icon={<AppIcon icon={ListChecksIcon} />}
              onClick={() => {
                setOpen(false);
                onSelect();
              }}
            >
              Select Pages and Spaces
            </ChromeActionRow>
          )}

          {agents === undefined ? null : (
            <>
              <Separator />
              <ManagementSection id="home-management-agents" title="Agents">
                <AgentsList agents={agents} className="px-3" />
              </ManagementSection>
            </>
          )}

          {sessions === undefined ? null : (
            <>
              <Separator />
              <ManagementSection id="home-management-devices" title="Devices">
                <DevicesList sessions={sessions} className="px-3" />
              </ManagementSection>
            </>
          )}

          <Separator />
          <ManagementSection id="home-management-account" title="Account">
            <DeleteStrata />
          </ManagementSection>
        </ChromeActionBody>
      </ChromeActionContent>
    </ChromeActionMenu>
  );
}
