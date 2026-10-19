"use client";

/**
 * The live Page, assembled: document, Drawer, confirmation and notices. State, document, rows and
 * sharing live in `chrome-state`, `chrome-document`, `chrome-actions` and `chrome-sharing`.
 */

import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";

import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  ChromeNotice,
  ChromeNoticeRegion,
  ChromeActionContent,
  ChromeActionNotice,
  ChromeActionMenu,
} from "@/shared/ui/overflow-menu";
import { PageRenderer } from "@/page-content/render";
import type { DirectPageViewer, OwnerPageViewer } from "@/shared/navigation/viewer";

import { ChromeActionsPanel } from "./chrome-actions";
import { ChromeDocument } from "./chrome-document";
import { ChromeSharingFooter, ChromeSharingPanel } from "./chrome-sharing";
import { PageChromeProvider, usePageChrome } from "./chrome-state";
import { PageMissing } from "./page-missing";
import type { PageStore } from "./state";
import { usePageStore } from "./store";

const selectBody = (state: PageStore) => ({ spec: state.spec, version: state.version });

export function LiveBody() {
  const { spec, version } = usePageStore(useShallow(selectBody));
  return <PageRenderer spec={spec} headingLevel={2} specVersion={version} />;
}

export function OwnerLiveChrome({ viewer, children }: {
  viewer: OwnerPageViewer;
  children: ReactNode;
}) {
  return <LiveChrome viewer={viewer}>{children}</LiveChrome>;
}

export function DirectLiveChrome({ viewer, children }: {
  viewer: DirectPageViewer;
  children: ReactNode;
}) {
  return <LiveChrome viewer={viewer}>{children}</LiveChrome>;
}

/** `children` is the document, built above the store provider so chrome state never re-walks it. */
function LiveChrome({
  viewer,
  children,
}: {
  viewer: OwnerPageViewer | DirectPageViewer;
  children: ReactNode;
}) {
  return (
    <PageChromeProvider viewer={viewer}>
      <LiveChromeFrame>{children}</LiveChromeFrame>
    </PageChromeProvider>
  );
}

function LiveChromeFrame({ children }: { children: ReactNode }) {
  const chrome = usePageChrome();
  const { menu: menuOpen, panel, pending, notice } = chrome.state;
  const { changeMenu, deletePage, rotateLink, setConfirm } = chrome.actions;
  const { meta, space, gone, confirm, asking } = chrome.meta;

  // The address no longer resolves (confirmed twice), so every Drawer act would target nothing.
  if (gone) return <PageMissing />;

  return (
    <>
      <ChromeActionMenu open={menuOpen} onOpenChange={changeMenu}>
        <ChromeDocument>{children}</ChromeDocument>

        <ChromeActionContent
          title={panel === "sharing" ? "Sharing" : meta.title}
          description={panel === "sharing"
            ? "Who can open this Page"
            : space === undefined ? "Shared by link" : space.name}
        >
          {panel === "actions" ? <ChromeActionsPanel /> : <ChromeSharingPanel />}
          <ChromeActionNotice notice={menuOpen ? notice : null} />
          {panel === "sharing" ? <ChromeSharingFooter /> : null}
        </ChromeActionContent>

        {/* Inside the Drawer root so Base UI nests it: the Drawer stays visible, goes inert, and
            gets focus back on either answer. */}
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
              if (confirm === "delete") deletePage();
              else rotateLink();
            }}
          />
        )}
      </ChromeActionMenu>

      {/* Notices after the Drawer closes; mounted here so public routes ship no toaster. */}
      <ChromeNoticeRegion />
      <ChromeNotice notice={menuOpen ? null : notice} />
    </>
  );
}
