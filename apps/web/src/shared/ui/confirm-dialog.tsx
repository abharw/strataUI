"use client";

/**
 * The shared confirmation dialog. Callers supply the question, consequence and verb, and own
 * `open` because what follows a confirmed act differs per caller.
 */
import { SpinnerGapIcon } from "@phosphor-icons/react/dist/ssr/SpinnerGap";
import { useId, useRef, useState } from "react";

import { AppIcon } from "./app-icon";
import { Field, FieldLabel } from "@/shared/ui/primitives/field";
import { Input } from "@/shared/ui/primitives/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/primitives/alert-dialog";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** Label shown while the act is in flight. Defaults to `confirmLabel`. */
  pendingLabel?: string;
  cancelLabel?: string;
  /** Red pill and destructive focus ring. */
  destructive?: boolean;
  /** The caller's own in-flight state, for acts it was already tracking. */
  pending?: boolean;
  /**
   * A word to type before the verb acts, reserved for irreversible acts like account deletion.
   * Matched case-sensitively after trimming.
   */
  challenge?: { word: string; label: string };
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
  challenge,
  onConfirm,
}: ConfirmDialogProps) {
  // Tracks in-flight state locally so a second press cannot land before the caller's
  // `pending` renders.
  const [running, setRunning] = useState(false);
  const inFlight = useRef(false);
  const busy = pending || running;
  // Cleared on close so the typed word does not carry over to the next opening.
  const [typed, setTyped] = useState("");
  const challengeId = useId();
  const unmet = challenge !== undefined && typed.trim() !== challenge.word;

  async function confirm() {
    if (inFlight.current || pending) return;
    inFlight.current = true;
    setRunning(true);
    try {
      await onConfirm();
    } finally {
      inFlight.current = false;
      setRunning(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Backdrop and Escape are ignored while the act is running.
        if (!next && busy) return;
        if (!next) setTyped("");
        onOpenChange(next);
      }}
    >
      <AlertDialogContent data-strata-confirm-dialog="">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {challenge === undefined ? null : (
          <Field className="gap-2">
            <FieldLabel htmlFor={challengeId} className="text-supporting font-medium">
              {challenge.label}
            </FieldLabel>
            <Input
              id={challengeId}
              value={typed}
              disabled={busy}
              onChange={(event) => setTyped(event.target.value)}
              // Keep the keyboard from rewriting the typed word.
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
        )}
        <AlertDialogFooter>
          {/* First in the DOM so Base UI focuses it initially and a stray Enter cancels. */}
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            aria-busy={busy}
            // `aria-disabled` rather than `disabled`, which would drop focus to <body> mid-act and
            // hide the button from screen readers.
            aria-disabled={busy || unmet}
            onClick={(event) => {
              if (busy || unmet) {
                event.preventDefault();
                return;
              }
              void confirm();
            }}
          >
            {busy ? (
              <AppIcon
                icon={SpinnerGapIcon}
                data-icon="inline-start"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : null}
            {busy ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
