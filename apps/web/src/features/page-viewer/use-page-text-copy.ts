"use client";

/** Copies the page as paste-ready Markdown. The only chrome act that reads the spec itself. */

import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { writeClipboardText } from "@/shared/ui/overflow-menu";
import { pageToMarkdown } from "@/page-content/export/page-markdown";

import { usePageStore } from "./store";

export const PAGE_TEXT_COPIED = "Page text copied";
export const PAGE_TEXT_FAILED = "Couldn’t copy the Page text. Try again.";

export function usePageTextCopy() {
  const { meta, spec, updatedAt } = usePageStore(
    useShallow((state) => ({ meta: state.meta, spec: state.spec, updatedAt: state.updatedAt })),
  );
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 1600);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy(): Promise<boolean> {
    const copied = await writeClipboardText(
      pageToMarkdown({ title: meta.title, spec, updatedAt, url: meta.url }),
    );
    setState(copied ? "copied" : "failed");
    return copied;
  }

  return { state, copy };
}
