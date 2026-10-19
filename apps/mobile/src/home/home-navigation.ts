import type { NavigationDecision, NewWindowDecision } from "../shell/navigation";

export function decideHomeNavigation(
  configuredOrigin: string,
  candidate: string,
): NavigationDecision {
  if (candidate === "about:blank") return { kind: "allow" };

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { kind: "block" };
  }

  if (url.protocol === "mailto:" || url.protocol === "tel:") {
    return { kind: "external", href: url.toString(), transport: "system" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "block" };
  if (url.origin === configuredOrigin) {
    // /assets/:id carries its own short-lived signature, so it can leave the session-bearing
    // WebView. The route that mints it stays inside.
    if (url.pathname.startsWith("/assets/")) {
      return { kind: "external", href: url.toString(), transport: "browser" };
    }
    return { kind: "allow" };
  }
  return { kind: "external", href: url.toString(), transport: "browser" };
}

/**
 * The WebView has no second window for target=_blank. Same-origin targets resolve in the
 * authenticated WebView first so the session cookie never reaches the system browser.
 */
export function decideHomeNewWindowNavigation(
  configuredOrigin: string,
  candidate: string,
): NewWindowDecision {
  const decision = decideHomeNavigation(configuredOrigin, candidate);
  if (decision.kind !== "allow") return decision;
  if (candidate === "about:blank") return { kind: "block" };
  return { kind: "resolve", href: new URL(candidate).toString() };
}

/** Session-gated path prefixes, where a 401 or 403 means the session lapsed. */
const SESSION_PREFIXES = ["/home", "/pages", "/spaces"] as const;

/**
 * A 401/403 on a session path means the web session lapsed; reloading /home redirects to sign-in.
 * 404 is excluded because it means a deleted page, which the web app already explains.
 */
export function shouldReloadHome(
  configuredOrigin: string,
  candidate: string,
  statusCode: number,
): boolean {
  if (statusCode !== 401 && statusCode !== 403) return false;
  try {
    const url = new URL(candidate);
    if (url.origin !== configuredOrigin) return false;
    return SESSION_PREFIXES.some((prefix) => (
      url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)
    ));
  } catch {
    return false;
  }
}
