"use client";

/**
 * The Page document frame: crumb row, title, provenance and status line around the generated
 * body passed as `children`.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Badge } from "@/shared/ui/primitives/badge";
import { useViewerFormatting } from "@/shared/formatting/viewer";
import {
  DocumentArticle,
  DocumentBackLink,
  DocumentHeader,
  DocumentOwnerProvenance,
  DocumentSequenceNav,
  DocumentStatusRow,
  DocumentTitle,
  DocumentTopRow,
  DocumentTopRowEnd,
  DocumentTopRowStart,
} from "./document-layout";
import { DocumentUpdatedTimestamp, DocumentWriterMark, StandingAnswer } from "./document";
import { ChromeActionTrigger } from "@/shared/ui/overflow-menu";
import { PageShell } from "@/features/navigation/page-shell";
import { productTextMuted } from "@/shared/ui/styles";

import { usePageChrome } from "./chrome-state";
import { PageChangesPopover } from "./page-changes";
import { PageSteps } from "./page-steps";
import { PollingRecoveryNotice, StaleBundleNotice } from "./polling-recovery";

export function ChromeDocument({ children }: { children: ReactNode }) {
  const {
    actions: { setPanel, setConfirm },
    meta: {
      owner,
      meta,
      space,
      spec,
      updating,
      offline,
      needsReload,
      updatedAt,
      recent,
      steps,
      sequence,
      writer,
      lastSummary,
    },
  } = usePageChrome();
  const { format } = useViewerFormatting();

  // The activity dot announces once per newer change, never on first paint. The popover stays
  // mounted so open history and focus survive polling.
  const latestChange = recent.at(-1)?.version ?? 0;
  const seenChange = useRef(latestChange);
  const [announcementVersion, setAnnouncementVersion] = useState<number | null>(null);

  useEffect(() => {
    if (latestChange > seenChange.current) setAnnouncementVersion(latestChange);
    seenChange.current = latestChange;
  }, [latestChange]);

  // The excerpt is the owner's message to their agent; a page key grants no access to it.
  const provenance = owner === null ? undefined : provenanceText(meta.source_event, format.display);
  const updated = format.display(updatedAt);
  const updatedExact = format.absoluteDateTime(updatedAt);

  // One meta line: the in-flight write badge, then the timestamp that opens what changed.
  const documentStatus = (
    <>
      {updating ? (
        <Badge
          role="status"
          aria-live="polite"
          aria-atomic="true"
          variant="secondary"
          className={`h-6 rounded-full border-border bg-transparent px-2.5 font-medium ${productTextMuted}`}
        >
          Agent is updating
        </Badge>
      ) : null}
      {recent.length > 0 ? (
        <PageChangesPopover
          announcementVersion={announcementVersion}
          changes={recent}
          updatedAt={updatedAt}
        />
      ) : (
        // Same gutter as the trigger it replaces.
        <DocumentUpdatedTimestamp value={updatedAt} className="-ml-1.5" />
      )}
    </>
  );

  return (
    <PageShell>
      <DocumentArticle>
        <DocumentHeader>
          <DocumentTopRow>
            {space === undefined ? null : (
              <DocumentTopRowStart>
                <DocumentBackLink href={space.url}>{space.name}</DocumentBackLink>
              </DocumentTopRowStart>
            )}
            {/* Metadata and actions share the crumb row so the title keeps its width. */}
            <DocumentTopRowEnd>
            <DocumentWriterMark writer={writer} at={updatedAt} summary={lastSummary} />
            <ChromeActionTrigger
              label="Page options"
              onClick={() => {
                setConfirm(null);
                setPanel("actions");
              }}
            />
            </DocumentTopRowEnd>
          </DocumentTopRow>
          <DocumentTitle>{meta.title}</DocumentTitle>
          <DocumentSequenceNav sequence={sequence} />
          <StandingAnswer answer={spec.answer} />
          {provenance === undefined ? null : (
            <DocumentOwnerProvenance>{provenance}</DocumentOwnerProvenance>
          )}
          <DocumentStatusRow>{documentStatus}</DocumentStatusRow>
        </DocumentHeader>

        {needsReload ? <StaleBundleNotice /> : null}
        {offline ? <PollingRecoveryNotice updatedAt={updatedAt} updated={updated} updatedExact={updatedExact} /> : null}

        {/* The write trail, only on pages that opt in. */}
        {steps === null ? null : <PageSteps steps={steps} />}

        {children}
      </DocumentArticle>
    </PageShell>
  );
}

function provenanceText(
  sourceEvent: { at: string; excerpt: string } | undefined,
  display: (value: unknown) => string,
): string | undefined {
  if (sourceEvent === undefined) return undefined;
  const day = display(sourceEvent.at.slice(0, 10));
  return `From your message ${day} · “${sourceEvent.excerpt}”`;
}
