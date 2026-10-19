/**
 * Detects the Strata app's WebView via `StrataMobile/` in the User-Agent. Self-reported, so it may
 * change wording only, never what a request is allowed to do.
 */

const APP_TOKEN = "StrataMobile/";

/**
 * Takes the header bag, not a `Request`. Next's `headers()` result has its own `headers` property,
 * so duck-typing on `"headers" in source` would pick the wrong object.
 */
export function isStrataApp(headers: { get(name: string): string | null }): boolean {
  return (headers.get("user-agent") ?? "").includes(APP_TOKEN);
}
