"use client";

import { useEffect, useState } from "react";

export type ChromeNoticeValue = {
  kind: "success" | "error";
  text: string;
  /** An optional action offered as the toast's button. */
  action?: { label: string; act: () => void };
} | null;

export const CHROME_NOTICE_DURATION_MS = {
  success: 1_800,
  error: 3_600,
  action: 8_000,
} as const;

/** Display durations for chrome action feedback. */
export function useTransientNotice() {
  const [notice, setNotice] = useState<ChromeNoticeValue>(null);

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => setNotice(null), CHROME_NOTICE_DURATION_MS[notice.kind]);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return [notice, setNotice] as const;
}
