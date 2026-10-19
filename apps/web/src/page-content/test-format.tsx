import type { ReactNode } from "react";

import { FixedViewerFormattingProvider } from "@/shared/formatting/viewer";

const TEST_FORMAT_ENVIRONMENT = {
  locale: "en-US",
  timeZone: "America/New_York",
  now: Date.parse("2026-08-24T12:00:00-04:00"),
} as const;

export function TestViewerFormatting({ children }: { children: ReactNode }) {
  return (
    <FixedViewerFormattingProvider environment={TEST_FORMAT_ENVIRONMENT}>
      {children}
    </FixedViewerFormattingProvider>
  );
}
