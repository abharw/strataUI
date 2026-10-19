/**
 * Screen-reader text for links that open a new tab. Links with their own `aria-label` use the
 * string; others render `NewContextHint`.
 */
export const NEW_CONTEXT_HINT = "(opens in a new tab)";

export function NewContextHint() {
  return <span className="sr-only"> {NEW_CONTEXT_HINT}</span>;
}
