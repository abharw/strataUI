"use client";

/**
 * The Space Drawer, assembled: panel, confirmation and notices. The caller supplies the trigger
 * (the row's status line); state, rows, checklist and delete copy live in sibling modules.
 */

import type { ReactElement, ReactNode } from "react";

import { DrawerTrigger } from "@/shared/ui/primitives/drawer";

import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  ChromeActionContent,
  ChromeActionMenu,
  ChromeActionNotice,
  ChromeNotice,
} from "@/shared/ui/overflow-menu";
import { SpaceMenuActionsPanel } from "./space-menu-actions";
import { SpaceMenuProvider, useSpaceMenu, type SpaceMenuInput } from "./space-menu-state";
import { SpaceMenuSharingFooter, SpaceMenuSharingPanel } from "./space-menu-sharing";

export { deletionConsequence } from "./space-menu-delete";
export type { SpaceSelectionPage } from "./space-menu-state";

export type SpaceDirectoryActionsProps = SpaceMenuInput & {
  children: ReactNode;
};

/** Makes the caller's element the trigger; Base UI merges the Drawer's props into it. */
export function SpaceMenuTrigger({ children }: { children: ReactElement }) {
  const { state: { pending } } = useSpaceMenu();
  return <DrawerTrigger disabled={pending !== null} render={children} />;
}

export function SpaceDirectoryActions({
  children,
  ...space
}: SpaceDirectoryActionsProps) {
  return (
    <SpaceMenuProvider {...space}>
      <SpaceMenuDrawer>{children}</SpaceMenuDrawer>
    </SpaceMenuProvider>
  );
}

function SpaceMenuDrawer({ children }: { children: ReactNode }) {
  const {
    state: { open, panel, pending, notice, selectionStale },
    actions: { changeOpen, remove, rotate, setConfirm },
    meta: { title, description, confirm, asking },
  } = useSpaceMenu();

  return (
    <>
      <ChromeActionMenu open={open} onOpenChange={changeOpen}>
        {children}
        <ChromeActionContent
          title={title}
          description={description}
          className={panel === "sharing"
            ? "[--drawer-max-height:min(48rem,84dvh)]"
            : undefined}
        >
          {panel === "actions" ? <SpaceMenuActionsPanel /> : null}

          {panel === "sharing" ? <SpaceMenuSharingPanel /> : null}

          <ChromeActionNotice
            notice={selectionStale
              ? { kind: "error", text: "This Space changed. Reopen the checklist to refresh it." }
              : open ? notice : null}
          />
          {panel === "sharing" ? <SpaceMenuSharingFooter /> : null}
        </ChromeActionContent>

        {/* Inside the Drawer root so Base UI nests it; the Drawer stays visible and inert. */}
        {asking === null ? null : (
          <ConfirmDialog
            open
            onOpenChange={(next) => {
              if (!next) setConfirm(null);
            }}
            title={asking.title}
            description={asking.description}
            confirmLabel={asking.act}
            pendingLabel={asking.busy}
            destructive={asking.destructive}
            pending={pending !== null}
            onConfirm={() => {
              if (confirm === "delete") remove();
              else rotate();
            }}
          />
        )}
      </ChromeActionMenu>
      <ChromeNotice notice={open ? null : notice} />
    </>
  );
}
