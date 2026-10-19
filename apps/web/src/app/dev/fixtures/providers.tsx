"use client";

import { useState, type ReactNode } from "react";

import {
  ApprovalProvider,
  type ApprovalAnswer,
  type ApprovalAsk,
} from "@/page-content/blocks/approval/view";
import { AttachmentResolverProvider } from "@/page-content/blocks/attachment-list/resolver";

const LABELS: Record<string, string> = {
  "saturday-morning": "Saturday, 8–11 AM",
  "monday-afternoon": "Monday, 1–4 PM",
};

const INITIAL_ASK: ApprovalAsk = {
  approval_id: "internet-install",
  ask_seq: 1,
  question_key: "fixture-internet-install-v1",
  answer: null,
};

export function FixtureProviders({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<ApprovalAsk>(INITIAL_ASK);

  async function record(
    approvalId: string,
    askSeq: number,
    questionKey: string,
    optionId: string,
  ) {
    if (
      approvalId !== ask.approval_id ||
      askSeq !== ask.ask_seq ||
      questionKey !== ask.question_key ||
      ask.answer !== null
    ) {
      return;
    }
    const answer: ApprovalAnswer = {
      chosen_id: optionId,
      chosen_label: LABELS[optionId] ?? optionId,
      answered_by: "Fixture owner",
      answered_at: new Date().toISOString(),
    };
    setAsk((current) => ({ ...current, answer }));
  }

  return (
    // Only one asset resolves, so the gallery also shows the unavailable-attachment row.
    <AttachmentResolverProvider
      assets={{
        "move-floor-plan": {
          href: "/dev-fixture-floor-plan.svg",
          filename: "floor-plan.svg",
          media_type: "image/svg+xml",
          size_bytes: 12_000,
          // Square image in a 4:3 frame exercises the `object-cover` crop.
          width: 800,
          height: 800,
          credit: "Drawn by the letting agent",
          source_url: "https://example.com/listing/floor-plan",
        },
      }}
    >
      <ApprovalProvider
        value={{
          answerable: true,
          asks: { "internet-install": ask },
          stale: [],
          record,
        }}
      >
        {children}
      </ApprovalProvider>
    </AttachmentResolverProvider>
  );
}
