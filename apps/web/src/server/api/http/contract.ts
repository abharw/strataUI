/**
 * Write-side contract version check. A stale `X-Strata-Contract` is refused before anything is
 * written; a missing one is allowed with a warning (some clients cannot set headers). Reads are
 * never refused.
 */
import { changesSince, CONTRACT_HEADER, CONTRACT_VERSION } from "@/shared/api/version";
import { fail, type HandlerResult } from "@/shared/api/types";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isMutating(method: string): boolean {
  return MUTATING.has(method.toUpperCase());
}

/** The refusal for a write that named an older contract. Nothing ran. */
export function contractRefusal(learned: string): HandlerResult {
  return fail(409, {
    error:
      `You sent ${CONTRACT_HEADER}: ${learned}; this server runs ${CONTRACT_VERSION}. Nothing was written. Read \`changes\`, re-read /llms.txt, then the authoring guide and the manifest for the components this request uses, and rebuild the request under the current contract.`,
    code: "contract_changed",
    learned,
    changes: changesSince(learned).map((change) => `${change.version}: ${change.note}`),
    next: ["get_guide", "get_manifest"],
  });
}

/** What a write that sent no version is told, ahead of its own warnings. */
export const MISSING_CONTRACT_WARNING =
  `This write sent no ${CONTRACT_HEADER} header. Send the contract version you learned on every write so a change is refused before it costs a page; this one ran under ${CONTRACT_VERSION}.`;

/** Prepends the missing-header warning, since every write body leads with `warnings`. */
export function withContractWarning(result: HandlerResult): HandlerResult {
  if (result.status < 200 || result.status >= 300) return result;
  const existing: unknown[] = Array.isArray(result.body.warnings) ? result.body.warnings : [];
  const warnings = [MISSING_CONTRACT_WARNING, ...existing];
  const rest = { ...result.body };
  delete rest.warnings;
  return { ...result, body: { warnings, ...rest } };
}
