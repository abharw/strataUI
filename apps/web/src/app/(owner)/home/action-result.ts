/**
 * Result shapes owner actions return to the browser: only what the UI renders, with refusals as
 * display copy. Kept separate because a `"use server"` module may only export async functions.
 */
import type { ApprovalAsk } from "@/page-content/blocks/approval/view";
import type { SignInFailure } from "@/server/auth/handlers";

export type OwnerActionResult =
  | { ok: true; notice: string | null }
  | { ok: false; error: string };

/** Returned when a share link is minted or replaced; the caller copies `url` to the clipboard. */
export type SharedLinkResult =
  | { ok: true; notice: string | null; url: string }
  | { ok: false; error: string };

/** `changed` carries the current ask when the question changed under the reader. */
export type DecisionResult =
  | { ok: true; answer: RecordedDecision }
  | { ok: false; changed: ApprovalAsk }
  | { ok: false; changed: null };

export interface RecordedDecision {
  approval_id: string;
  ask_seq: number;
  question_key: string;
  chosen_id: string;
  chosen_label: string;
  answered_by: string;
  answered_at: string;
}

export type SignInFormState = { failure: SignInFailure } | null;

export type ResendCodeState = { sent: true } | { failure: SignInFailure } | null;
