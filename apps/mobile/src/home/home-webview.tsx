import { useCallback } from "react";

import { STRATA_ORIGIN } from "../config";
import { StrataWebView } from "../shell/strata-web-view";
import {
  decideHomeNavigation,
  decideHomeNewWindowNavigation,
  shouldReloadHome,
} from "./home-navigation";

/**
 * The session WebView, starting at `/home`. Its persistent cookie store is private to the app
 * (no shared or third-party cookies). No "Open in browser" fallback: the session lives only here.
 */
export function HomeWebView({
  url,
  onFirstPaint,
}: {
  url: string;
  onFirstPaint?: () => void;
}) {
  const decide = useCallback(
    (candidate: string) => decideHomeNavigation(STRATA_ORIGIN, candidate),
    [],
  );
  const decideNewWindow = useCallback(
    (candidate: string) => decideHomeNewWindowNavigation(STRATA_ORIGIN, candidate),
    [],
  );
  // Only network-level failures get the native screen; the web app renders its own 4xx pages.
  const httpErrorPolicy = useCallback((errorUrl: string, statusCode: number) => {
    if (shouldReloadHome(STRATA_ORIGIN, errorUrl, statusCode)) return "recover" as const;
    if (errorUrl === url && statusCode >= 500) return "fail" as const;
    return "ignore" as const;
  }, [url]);

  return (
    <StrataWebView
      url={url}
      incognito={false}
      decide={decide}
      decideNewWindow={decideNewWindow}
      httpErrorPolicy={httpErrorPolicy}
      hostsForms
      onFirstPaint={onFirstPaint}
    />
  );
}
