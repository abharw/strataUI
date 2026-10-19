"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";

import { ApprovalProvider, StaleAskError, type ApprovalAsk } from "@/page-content/blocks/approval/view";
import { answerAsk } from "@/app/(owner)/home/actions";
import { usePageStore, usePageStoreApi } from "./store";
import type { PageStore } from "./state";
import type { RefreshSignal } from "./use-changes";

const selectAnswerState = (state: PageStore) => ({
  asks: state.asks,
  stale: state.stale,
  gone: state.gone,
  ownerName: state.ownerName,
});

/**
 * Live approvals and answering. A new answer is written to the store optimistically; the server
 * returns the stored answer on a replay, so the two cannot diverge.
 */
export function ApprovalAnswers({ pageId, refresh, children }: {
  /** Null for a reader who cannot answer. */
  pageId: string | null;
  refresh: RefreshSignal;
  children: ReactNode;
}) {
  const { asks, stale, gone, ownerName } = usePageStore(useShallow(selectAnswerState));
  const store = usePageStoreApi();

  const byId = useMemo(() => {
    const map = Object.create(null) as Record<string, ApprovalAsk>;
    for (const ask of asks) map[ask.approval_id] = ask;
    return map;
  }, [asks]);

  const record = useCallback(
    async (approvalId: string, askSeq: number, key: string, optionId: string) => {
      if (pageId === null) return;
      const result = await answerAsk(pageId, {
        approval_id: approvalId,
        ask_seq: askSeq,
        question_key: key,
        option_id: optionId,
      });
      if (!result.ok) {
        // Usually a tap one asking behind. If the on-screen wording is still current, the store
        // takes the new asking in place. Otherwise the question is disabled and the poll pulled
        // forward, so consent is never recorded against wording the reader did not see.
        if (result.changed !== null
          && store.getState().markStale(approvalId, key, result.changed)) {
          refresh.request();
          throw new StaleAskError();
        }
        throw new Error("decision refused");
      }
      const { answer } = result;
      store.getState().setAnswer({
        approval_id: answer.approval_id,
        ask_seq: answer.ask_seq,
        question_key: answer.question_key,
        answer: {
          chosen_id: answer.chosen_id,
          chosen_label: answer.chosen_label,
          answered_by: answer.answered_by,
          answered_at: answer.answered_at,
        },
      });
    },
    [pageId, refresh, store],
  );

  // A deleted page answers 404, so close the question instead of offering endless retries.
  const closed = gone ? "This Page was deleted, so this question is closed." : undefined;
  // Every `Approval` reads this object, so its identity must be stable across poll ticks.
  const value = useMemo(
    () => ({ answerable: pageId !== null, asks: byId, stale, closed, waitingOn: ownerName, record }),
    [byId, closed, ownerName, pageId, record, stale],
  );
  return <ApprovalProvider value={value}>{children}</ApprovalProvider>;
}

/** Read-only approvals for surfaces without a live store, such as the shared bundle. */
export function StaticApprovalAnswers({ asks, waitingOn = null, children }: {
  asks: ApprovalAsk[];
  waitingOn?: string | null;
  children: ReactNode;
}) {
  const byId = Object.create(null) as Record<string, ApprovalAsk>;
  for (const ask of asks) byId[ask.approval_id] = ask;
  return (
    <ApprovalProvider value={{ answerable: false, asks: byId, stale: [], waitingOn, record: async () => {} }}>
      {children}
    </ApprovalProvider>
  );
}
