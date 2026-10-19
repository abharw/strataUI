/**
 * Every `/v1` response carries `contract_version`, and writes send the learned version in
 * `X-Strata-Contract` so a stale agent is refused with `changes` before anything is written.
 * Format `YYYY-MM-DD.N`. Bump on any agent-visible change (endpoints, shapes, error codes,
 * recoveries, component rules), never for rewording, never backwards, and add a
 * `CONTRACT_CHANGES` entry each time.
 */
export const CONTRACT_VERSION = "2026-09-12.1";

/** Header carrying the contract version on discovery and `/v1` responses. */
export const CONTRACT_HEADER = "X-Strata-Contract";

export interface ContractChange {
  version: string;
  note: string;
}

/** Oldest first. Rendered into `/llms.txt` and, filtered to unseen versions, `contract_changed`. */
export const CONTRACT_CHANGES: readonly ContractChange[] = [
  {
    version: "2026-09-12.1",
    note:
      "Baseline contract. Pages are written as one constrained JSON spec over a closed catalog of 27 blocks chosen by data shape, and edited with RFC 6902 patches against base_version. GET /v1/guide?topic=authoring and GET /v1/manifest describe every block, field and limit.",
  },
];

/** Orders two versions. An unparseable value sorts before all real ones and gets every change. */
export function compareContract(a: string, b: string): number {
  const [da, na] = parts(a);
  const [db, nb] = parts(b);
  if (da !== db) return da < db ? -1 : 1;
  if (na !== nb) return na < nb ? -1 : 1;
  return 0;
}

function parts(version: string): [string, number] {
  const match = /^(\d{4}-\d{2}-\d{2})\.(\d+)$/.exec(version.trim());
  return match === null ? ["", -1] : [match[1], Number(match[2])];
}

/** Every change newer than the version the caller learned, oldest first. */
export function changesSince(learned: string): readonly ContractChange[] {
  return CONTRACT_CHANGES.filter((change) => compareContract(change.version, learned) > 0);
}
