"use client";

import { useViewerFormatting } from "@/shared/formatting/viewer";
import type { PageWriter } from "@/server/pages/read/provenance";

import { ChromeTimestamp } from "@/features/navigation/layout";
import { productTextMuted } from "@/shared/ui/styles";
import { WriterMark, WriterMarkProvider } from "@/shared/ui/writer-mark";

/**
 * The writer's monogram; its tooltip and accessible label carry name, time and summary. No writer
 * means no mark.
 */
export function DocumentWriterMark({
  writer = null,
  at,
  summary = null,
}: {
  writer?: PageWriter | null;
  at?: string;
  summary?: string | null;
}) {
  if (writer === null) return null;
  return (
    <WriterMarkProvider>
      <span className="flex min-w-0 items-center px-1.5 text-micro font-medium leading-5 tracking-meta">
        <WriterMark writer={writer} at={at} summary={summary} size="sm" />
      </span>
    </WriterMarkProvider>
  );
}

export function DocumentUpdatedTimestamp({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const { format } = useViewerFormatting();
  return (
    <ChromeTimestamp dateTime={value} title={format.absoluteDateTime(value)} className={className}>
      Updated {format.display(value)}
    </ChromeTimestamp>
  );
}

/** Static views keep mark and timestamp on one line; live chrome splits them. */
export function DocumentUpdatedAt({
  value,
  writer = null,
  summary = null,
}: {
  value: string;
  writer?: PageWriter | null;
  /** Shown in the tooltip only. */
  summary?: string | null;
}) {
  const timestamp = (
    <DocumentUpdatedTimestamp value={value} className={writer === null ? undefined : "px-0"} />
  );

  if (writer === null) return timestamp;

  return (
    <WriterMarkProvider>
      <span className="flex min-w-0 items-center gap-1.5 px-1.5 text-micro font-medium leading-5 tracking-meta">
        <WriterMark writer={writer} at={value} summary={summary} size="sm" />
        <span aria-hidden className={productTextMuted}>·</span>
        {timestamp}
      </span>
    </WriterMarkProvider>
  );
}

/** `answer` is the standing state; write summaries are activity. */
export function StandingAnswer({
  answer,
}: {
  answer: { verdict: string } | undefined;
}) {
  if (answer === undefined) return null;
  return (
    <p className="mt-2 max-w-xl break-words text-body leading-6 text-foreground" aria-label="Page standing answer">
      {answer.verdict}
    </p>
  );
}
