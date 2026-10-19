/**
 * Failure sections of `/llms.txt` and `/auth.md`, rendered from `RECOVERY` so the docs and the
 * error bodies are the same strings.
 */
import { documentedRecoveries, type Recovery, type RecoverySurface } from "@/shared/api/recovery";

export function recoveryLines(surface: RecoverySurface, origin: string): string {
  return documentedRecoveries(surface)
    .map(([code, entry]) => `- **\`${code}\`** — ${entry.truth}${callSentence(entry, origin)}${avoidSentence(entry)}`)
    .join("\n");
}

function callSentence(entry: Recovery, origin: string): string {
  // No call: the fix is in `truth` (resend corrected, or nothing for a refusal the person gave).
  if (entry.recover === null) return "";
  const body = entry.recover.body === undefined
    ? ""
    : ` \`${globalThis.JSON.stringify(entry.recover.body)}\``;
  return ` Do this: \`${entry.recover.method} ${origin}${entry.recover.path}\`${body} — then ${entry.recover.then}.`;
}

function avoidSentence(entry: Recovery): string {
  return entry.avoid === undefined ? "" : ` Not this: ${entry.avoid}`;
}

/** The same entries as a table, for `/auth.md`. */
export function recoveryRows(surface: RecoverySurface, origin: string): string {
  return documentedRecoveries(surface)
    .map(([code, entry]) => {
      const call = entry.recover === null
        ? ""
        : `\`${entry.recover.method} ${origin}${entry.recover.path}\`, then ${entry.recover.then}. `;
      // `avoid` names the plausible wrong move after a correct refusal.
      const never = entry.avoid === undefined ? "" : `**Never:** ${entry.avoid}`;
      return `| \`${code}\` | ${entry.truth} | ${call}${never} |`;
    })
    .join("\n");
}
