import { useCallback } from "react";

import { StrataWebView } from "../shell/strata-web-view";
import type { NewWindowDecision } from "../shell/navigation";
import { decideNavigation, type SharePresentationUrl } from "./presentation-url";

/**
 * Isolated share view: one capability URL, no session, cookies discarded with the view. In-scope
 * `target=_blank` resolves in place so the bearer URL stays out of browser history and iCloud tabs.
 */
export function PresentationWebView({
  presentation,
  onFirstPaint,
}: {
  presentation: SharePresentationUrl;
  onFirstPaint?: () => void;
}) {
  const decide = useCallback(
    (candidate: string) => decideNavigation(presentation, candidate),
    [presentation],
  );
  const decideNewWindow = useCallback((candidate: string): NewWindowDecision => {
    const decision = decideNavigation(presentation, candidate);
    if (decision.kind !== "allow") return decision;
    if (candidate === "about:blank") return { kind: "block" };
    return { kind: "resolve", href: new URL(candidate).toString() };
  }, [presentation]);

  return (
    <StrataWebView
      url={presentation.href}
      incognito
      decide={decide}
      decideNewWindow={decideNewWindow}
      // A capability URL carries its own authority, so the system browser can open it.
      openInBrowserOnFailure={presentation.href}
      onFirstPaint={onFirstPaint}
    />
  );
}
