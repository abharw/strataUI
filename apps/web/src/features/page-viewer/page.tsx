"use client";

import { useState, type ReactNode } from "react";

import type { DirectPageViewer, OwnerPageViewer } from "@/shared/navigation/viewer";
import { AttachmentResolverProvider } from "@/page-content/blocks/attachment-list/resolver";
import { PageShell } from "@/features/navigation/page-shell";
import { ViewerFormattingProvider } from "@/shared/formatting/viewer";

import { ApprovalAnswers } from "./decisions";
import { DirectLiveChrome, LiveBody, OwnerLiveChrome } from "./chrome";
import { PageStoreProvider, usePageStore, usePageStoreApi, type PageSnapshot } from "./store";
import { createRefreshSignal, useChangesPoll, type RefreshSignal } from "./use-changes";

interface LivePageProps {
  seed: PageSnapshot;
  serverNow: string;
}

/** Owner view: Space navigation, curation and answering. */
export function OwnerLivePage({
  viewer,
  seed,
  serverNow,
}: LivePageProps & { viewer: OwnerPageViewer }) {
  return (
    <LivePageRuntime
      changesUrl={viewer.changesUrl}
      pageId={viewer.pageId}
      seed={seed}
      serverNow={serverNow}
    >
      <OwnerLiveChrome viewer={viewer}>
        <LiveBody />
      </OwnerLiveChrome>
    </LivePageRuntime>
  );
}

/** A forwarded page key: standalone and read-only, but live. */
export function DirectLivePage({
  viewer,
  seed,
  serverNow,
}: LivePageProps & { viewer: DirectPageViewer }) {
  return (
    <LivePageRuntime
      changesUrl={viewer.changesUrl}
      pageId={null}
      seed={seed}
      serverNow={serverNow}
    >
      <DirectLiveChrome viewer={viewer}>
        <LiveBody />
      </DirectLiveChrome>
    </LivePageRuntime>
  );
}

/** Embed: the same direct capability, document only. */
export function EmbeddedLivePage({
  viewer,
  seed,
  serverNow,
}: LivePageProps & { viewer: DirectPageViewer }) {
  return (
    <LivePageRuntime
      changesUrl={viewer.changesUrl}
      pageId={null}
      seed={seed}
      serverNow={serverNow}
    >
      <PageShell><LiveBody /></PageShell>
    </LivePageRuntime>
  );
}

function LivePageRuntime({
  children,
  changesUrl,
  pageId,
  seed,
  serverNow,
}: LivePageProps & {
  children: ReactNode;
  changesUrl: string;
  /** Set only for an owner session, which may answer for this page. */
  pageId: string | null;
}) {
  // Chrome and document are elements built by the caller, so chrome-local state re-renders the
  // chrome alone without re-walking the generated document.
  const [refresh] = useState(createRefreshSignal);
  return (
    <ViewerFormattingProvider serverNow={serverNow}>
      <PageStoreProvider seed={seed}>
        <Poller endpoint={changesUrl} refresh={refresh} />
        <LiveAttachments>
          <ApprovalAnswers pageId={pageId} refresh={refresh}>{children}</ApprovalAnswers>
        </LiveAttachments>
      </PageStoreProvider>
    </ViewerFormattingProvider>
  );
}

/** File links come from the store: they expire in minutes and the poll refreshes them. */
function LiveAttachments({ children }: { children: ReactNode }) {
  const assets = usePageStore((state) => state.assets);
  return <AttachmentResolverProvider assets={assets}>{children}</AttachmentResolverProvider>;
}

function Poller({ endpoint, refresh }: { endpoint: string; refresh: RefreshSignal }) {
  useChangesPoll(usePageStoreApi(), endpoint, refresh);
  return null;
}
