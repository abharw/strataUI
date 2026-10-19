"use client";

/**
 * Copy state shared by the owner Drawers. A denied clipboard denies retries too, so a refused
 * copy leaves the link on screen to select by hand.
 */

import { useEffect, useState } from "react";

import { writeClipboardText } from "./overflow-menu";

/** A link shown on screen because a reset minted it or the clipboard refused it. */
export type LinkOnScreen = { url: string; reset: boolean; note: string } | null;

export function useLinkCopy() {
  const [copied, setCopied] = useState(false);
  // A reset link exists nowhere else, so it stays on screen.
  const [linkOnScreen, setLinkOnScreen] = useState<LinkOnScreen>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  /** Copies the link, leaving it on screen if refused. The caller supplies the message. */
  async function writeLink(url: string): Promise<boolean> {
    if (await writeClipboardText(url)) return true;
    setLinkOnScreen((held) => held ?? { url, reset: false, note: "" });
    return false;
  }

  return { copied, setCopied, linkOnScreen, setLinkOnScreen, writeLink };
}
