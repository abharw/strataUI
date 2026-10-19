"use client";

import { CheckIcon } from "@phosphor-icons/react/dist/ssr/Check";
import { CopyIcon } from "@phosphor-icons/react/dist/ssr/Copy";
import { useEffect, useState } from "react";

import { AppIcon } from "@/shared/ui/app-icon";
import { Button } from "@/shared/ui/primitives/button";
import { cn } from "@/shared/ui/cn";

type CopyStatus = "idle" | "copied" | "error";

function useCopyText(text: string) {
  // The counter makes a repeat copy restart the timer; setting the same status alone would bail
  // out and let the first timer dismiss the second confirmation early.
  const [attempt, setAttempt] = useState({ status: "idle" as CopyStatus, at: 0 });
  const status = attempt.status;

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(
      () => setAttempt((current) => ({ ...current, status: "idle" })),
      status === "copied" ? 1500 : 3000,
    );
    return () => window.clearTimeout(timer);
  }, [status, attempt.at]);

  async function copy() {
    try {
      if (navigator.clipboard === undefined) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setAttempt((current) => ({ status: "copied", at: current.at + 1 }));
    } catch {
      setAttempt((current) => ({ status: "error", at: current.at + 1 }));
    }
  }

  const feedback = status === "copied"
    ? "Copied to clipboard"
    : status === "error"
      ? "Couldn’t copy"
      : "";
  return { status, feedback, copy };
}

/** ≥44px tap target that copies `text` to the clipboard. */
export function CopyButton({
  text,
  label,
}: {
  text: string;
  label?: string;
}) {
  const { status, feedback, copy } = useCopyText(text);

  return (
    <span className="inline-flex min-w-0 flex-col items-start">
      <Button
        type="button"
        variant="ghost"
        className="h-auto min-h-11 min-w-11 max-w-full shrink justify-start px-2 text-left text-ui font-inherit whitespace-normal"
        aria-label={label ?? `Copy ${text}`}
        onClick={() => void copy()}
      >
        <span className="max-w-full break-words underline decoration-dotted underline-offset-2">
          {status === "copied" ? "Copied" : status === "error" ? "Copy failed" : text}
        </span>
      </Button>
      <span
        className="sr-only"
        role={status === "error" ? "alert" : "status"}
        aria-live={status === "error" ? "assertive" : "polite"}
        aria-atomic="true"
      >
        {feedback}
      </span>
    </span>
  );
}

/** Icon-only copy control for exact-text surfaces such as code blocks. */
export function CopyIconButton({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const { status, feedback, copy } = useCopyText(text);
  return (
    <span className="inline-flex shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("text-muted-foreground", className)}
        aria-label={status === "copied" ? "Copied" : status === "error" ? "Copy failed" : label}
        onClick={() => void copy()}
      >
        <AppIcon icon={status === "copied" ? CheckIcon : CopyIcon} className="size-4" />
      </Button>
      <span
        className="sr-only"
        role={status === "error" ? "alert" : "status"}
        aria-live={status === "error" ? "assertive" : "polite"}
        aria-atomic="true"
      >
        {feedback}
      </span>
    </span>
  );
}
