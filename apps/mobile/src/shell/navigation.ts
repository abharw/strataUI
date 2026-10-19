/** What the shell does with a URL the document asked to load. */
export type NavigationDecision =
  | { kind: "allow" }
  | { kind: "external"; href: string; transport: "browser" | "system" }
  | { kind: "block" };

/**
 * The WebView has no second window, so `target=_blank` resolves in place instead of `allow`,
 * keeping the session cookie or capability URL inside the view.
 */
export type NewWindowDecision =
  | Exclude<NavigationDecision, { kind: "allow" }>
  | { kind: "resolve"; href: string };

/**
 * Whitelist everything at the library level: a react-native-webview whitelist miss calls
 * Linking before the callback, which would bypass the block decision.
 */
export const SHELL_ORIGIN_WHITELIST = ["*"];

export function resolutionScript(href: string): string {
  return `window.location.assign(${JSON.stringify(href)}); true;`;
}

/** The single place that decides whether a URL may load or leave the WebView. */
export function shouldStartNavigation(
  candidate: string,
  decide: (candidate: string) => NavigationDecision,
  openOutside: (target: Extract<NavigationDecision, { kind: "external" }>) => void,
): boolean {
  const decision = decide(candidate);
  if (decision.kind === "allow") return true;
  if (decision.kind === "external") openOutside(decision);
  return false;
}
