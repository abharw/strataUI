import type { ReactNode } from "react";

import { DocumentSpaceHeading } from "@/features/spaces/space-heading";
import type { AssembledSequence } from "@/server/pages/read/assemble";
import type { PageWriter } from "@/server/pages/read/provenance";
import type { BundlePageViewer } from "@/shared/navigation/viewer";
import type { StrataSpec } from "@/page-content/schema";
import { PageRenderer } from "@/page-content/render";
import {
  DocumentArticle,
  DocumentBackLink,
  DocumentHeader,
  DocumentOwnerProvenance,
  DocumentSequenceNav,
  DocumentTitle,
  DocumentTopRow,
  DocumentTopRowEnd,
  DocumentTopRowStart,
} from "./document-layout";
import { DocumentUpdatedAt, StandingAnswer } from "./document";

interface PageFrameProps {
  title: string;
  detail?: string;
  spec: StrataSpec;
  updatedAt?: string;
  /** Owner audiences only; see `assembleRow`. */
  writer?: PageWriter | null;
  /** Tooltip summary for the writer mark. Owner audiences only. */
  lastSummary?: string | null;
  /** Sequence position for this reader; see `assembleRow`. Defaults to none for fixtures. */
  sequence?: AssembledSequence | null;
  parent?: ReactNode;
  titleAs?: "h1" | "h2";
}

export function PageFrame({
  title,
  detail,
  spec,
  updatedAt,
  writer = null,
  lastSummary = null,
  sequence = null,
  parent,
  titleAs = "h1",
}: PageFrameProps) {
  return (
    <DocumentArticle>
      <DocumentHeader>
        {parent !== undefined || updatedAt !== undefined ? (
          <DocumentTopRow>
            {parent === undefined ? null : <DocumentTopRowStart>{parent}</DocumentTopRowStart>}
            {updatedAt === undefined ? null : (
              <DocumentTopRowEnd><DocumentUpdatedAt value={updatedAt} writer={writer} summary={lastSummary} /></DocumentTopRowEnd>
            )}
          </DocumentTopRow>
        ) : null}
        <DocumentTitle as={titleAs}>{title}</DocumentTitle>
        <DocumentSequenceNav sequence={sequence} />
        <StandingAnswer answer={spec.answer} />
        {detail === undefined ? null : <DocumentOwnerProvenance>{detail}</DocumentOwnerProvenance>}
      </DocumentHeader>
      <PageRenderer spec={spec} headingLevel={titleAs === "h1" ? 2 : 3} />
    </DocumentArticle>
  );
}

/** A page reached through a bundle remains a child of its shared Space. */
export function BundlePageFrame({
  viewer,
  ...page
}: Omit<PageFrameProps, "parent" | "titleAs"> & { viewer: BundlePageViewer }) {
  return (
    <PageFrame
      {...page}
      parent={<DocumentBackLink href={viewer.space.url}>{viewer.space.name}</DocumentBackLink>}
    />
  );
}

/** The shared Space stays visible even when its index contains one page. */
export function SharedSpaceFrame({
  name,
  emoji,
  detail,
  children,
}: {
  name: string;
  emoji: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-12 sm:gap-14">
      <DocumentSpaceHeading name={name} emoji={emoji} detail={detail} />
      {children}
    </section>
  );
}
