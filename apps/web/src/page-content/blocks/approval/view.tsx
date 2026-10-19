"use client";

import { SpinnerGapIcon } from "@phosphor-icons/react/dist/ssr/SpinnerGap";
import { createContext, use, useEffect, useRef, useState } from "react";

import { AppIcon } from "@/shared/ui/app-icon";
import { Button } from "@/shared/ui/primitives/button";
import { cn } from "@/shared/ui/cn";
import { Collection } from "@/page-content/collection";
import { surfaceAction, surfaceCardPad } from "@/page-content/surface";
import { GeneratedHeading } from "@/page-content/blocks/section/view";

type Option = { id: string; label: string };

/** The question changed between render and tap; not a transient failure to retry. */
export class StaleAskError extends Error {
  constructor() {
    super("stale ask");
    this.name = "StaleAskError";
  }
}

export interface ApprovalAnswer {
  chosen_id: string;
  chosen_label: string;
  answered_by: string;
  answered_at: string;
}

/**
 * One asking of a question, as the server identifies it. The tap echoes it back, so a tab left
 * open across a re-ask cannot answer the new asking by accident.
 */
export interface ApprovalAsk {
  approval_id: string;
  ask_seq: number;
  question_key: string;
  answer: ApprovalAnswer | null;
}

interface ApprovalContextValue {
  /** Whether this surface can send an answer through `record`. */
  answerable: boolean;
  asks: Record<string, ApprovalAsk>;
  /**
   * Approvals the server reworded since render. Their buttons stay disabled until the new
   * wording arrives, so nobody answers text they never read.
   */
  stale: readonly string[];
  /** Set when the page itself is closed to answers, such as a deleted page. */
  closed?: string;
  /** Who the question is waiting on, for a reader who cannot answer it. */
  waitingOn?: string | null;
  record: (approvalId: string, askSeq: number, key: string, optionId: string) => Promise<void>;
}

const ApprovalContext = createContext<ApprovalContextValue>({
  answerable: false,
  asks: {},
  stale: [],
  closed: undefined,
  waitingOn: null,
  record: async () => {},
});

export const ApprovalProvider = ApprovalContext.Provider;

export function Approval({
  id,
  question,
  context,
  options,
}: {
  id: string;
  question: string;
  context?: string;
  options: readonly Option[];
}) {
  const { answerable, asks, stale, closed, record } = use(ApprovalContext);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const answerNoticeRef = useRef<HTMLParagraphElement>(null);
  const ask = asks[id];
  const answer = ask?.answer ?? undefined;
  const answered = answer !== undefined;
  const wasAnswered = useRef(answered);
  // The on-screen wording is behind the server's; answering would consent to unseen text.
  const outdated = stale.includes(id);
  // Without a known asking there is nothing to answer against, so the question renders
  // without buttons.
  const canAnswer = answerable && closed === undefined && ask !== undefined && !answered && !outdated;

  // Answering removes the focused control, so move focus to the answer. Skip this when the
  // page loads already answered.
  useEffect(() => {
    if (wasAnswered.current || !answered) {
      wasAnswered.current = answered;
      return;
    }
    wasAnswered.current = true;
    const frame = window.requestAnimationFrame(() => answerNoticeRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [answered]);

  const answerWith = async (optionId: string) => {
    if (!canAnswer || sending !== null) return;
    setSending(optionId);
    setError(null);
    try {
      await record(id, ask.ask_seq, ask.question_key, optionId);
    } catch (problem) {
      // The stale notice belongs to the stale state, which clears when the new wording arrives.
      setError(problem instanceof StaleAskError ? null : "That didn't go through. Try again.");
    } finally {
      setSending(null);
    }
  };

  return (
    <section
      data-slot="approval"
      className={cn(
        // Depth rather than a status colour: actionable, without implying urgency.
        "min-w-0 " + surfaceAction + " " + surfaceCardPad + " font-inherit text-foreground",
      )}
    >
      <GeneratedHeading className="min-w-0 break-words text-body font-medium leading-6 tracking-row">
        {question}
      </GeneratedHeading>
      {context !== undefined ? (
        <p className="mt-2 break-words text-supporting leading-5 text-muted-foreground">{context}</p>
      ) : null}
      {/* Why the options are disabled comes before them. */}
      {!answered && (!answerable || closed !== undefined) ? (
        <p className="mt-2 break-words text-meta leading-5 text-muted-foreground">
          {closed ?? "Only the person this page was made for can answer this, from their own link."}
        </p>
      ) : null}
      <Collection as="ul" kind="choice" data-slot="approval-choices" className="mt-3">
        {options.map((option) => {
          const chosen = answered && answer.chosen_id === option.id;
          return (
            <li key={option.id} className="h-full">
              {canAnswer ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void answerWith(option.id)}
                  disabled={sending !== null}
                  aria-busy={sending === option.id}
                  data-slot="approval-option"
                  className="h-full min-h-control w-full min-w-0 border-border px-2 py-2 text-center text-supporting leading-4 whitespace-normal"
                >
                  {sending === option.id ? (
                    <AppIcon
                      icon={SpinnerGapIcon}
                      aria-hidden
                      data-icon="inline-start"
                      className="animate-spin motion-reduce:animate-none"
                    />
                  ) : null}
                  <span className="min-w-0 break-words">{option.label}</span>
                </Button>
              ) : (
                <div
                  data-slot="approval-option-state"
                  className={cn(
                    // Once answered nothing is tappable; only the recorded choice
                    // gets a selected state.
                    "flex h-full min-h-control min-w-0 items-center justify-center rounded-full px-2 py-2 text-center",
                    chosen
                      ? "bg-status-success ring-1 ring-status-success-border"
                      : answered
                        ? "ring-1 ring-border text-muted-foreground"
                        // Not this reader's to answer: no fill or shadow, so it
                        // does not read as a control.
                        : "ring-1 ring-border",
                  )}
                >
                  <p
                    className={cn(
                      "min-w-0 break-words text-supporting font-normal leading-4",
                      chosen ? "font-medium" : answered ? "text-muted-foreground" : null,
                    )}
                  >
                    {option.label}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </Collection>
      {/* Stays mounted so the answer, a refusal or an error is announced
          after the buttons unmount. */}
      <div aria-live="polite" className="contents">
        {answered ? (
          <p
            ref={answerNoticeRef}
            tabIndex={-1}
            className="mt-3 break-words text-supporting leading-5 text-muted-foreground"
          >
            Recorded<span aria-hidden> · </span>{" "}
            <span className="font-medium text-foreground">{answer.chosen_label}</span>.
          </p>
        ) : null}
        {outdated ? (
          <p className="mt-2 break-words text-supporting leading-5 text-muted-foreground">
            This question changed while you were reading it. Loading the new wording.
          </p>
        ) : error !== null ? (
          <p className="mt-2 break-words text-supporting leading-5 text-status-danger-foreground">{error}</p>
        ) : null}
      </div>
    </section>
  );
}
