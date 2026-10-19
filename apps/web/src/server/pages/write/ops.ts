/** Pure pre-check of RFC 6902 operations against the current spec, before the library runs. */
import { applySpecPatch, getByPath, type JsonPatch } from "@json-render/core";

import type { StrataSpec } from "@/page-content/schema";
import { fail, type HandlerResult } from "@/shared/api/types";
import { prototypeToken, unescapePointerToken } from "@/shared/api/json-pointer";

export type Spec = Parameters<typeof applySpecPatch>[0];

/** Resolves a pointer through own properties only; inherited keys such as `toString` are absent. */
function ownValueAt(spec: Spec, pointer: string): unknown {
  let node: unknown = spec;
  for (const raw of pointer.split("/").slice(1)) {
    const token = unescapePointerToken(raw);
    if (node === null || typeof node !== "object" || !Object.hasOwn(node, token)) return undefined;
    node = (node as Record<string, unknown>)[token];
  }
  return node;
}

/**
 * Approval question ids a patch addresses. Pointers name element keys, which may differ from the
 * question's `id` prop, so the after-image resolves them.
 */
export function touchedApprovals(after: StrataSpec, ops: readonly JsonPatch[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const op of ops) {
    // `test` and `copy` leave their source unchanged, so they do not reopen a question.
    if (op.op === "test") continue;
    const from = op.op === "move" ? (op as { from?: string }).from : undefined;
    for (const pointer of [op.path, from]) {
      if (typeof pointer !== "string") continue;
      const match = /^\/elements\/([^/]*)/.exec(pointer);
      if (match !== null) keys.add(unescapePointerToken(match[1]));
    }
  }
  const ids = new Set<string>();
  for (const key of keys) {
    const element = after.elements[key];
    if (element === undefined || element.type !== "approval") continue;
    const id = (element.props as { id?: unknown }).id;
    if (typeof id === "string") ids.add(id);
  }
  return ids;
}

/** The parent container of a pointer, and the token the op would write there. */
function splitPointer(pointer: string): { parent: string; token: string } {
  const index = pointer.lastIndexOf("/");
  return { parent: pointer.slice(0, index), token: unescapePointerToken(pointer.slice(index + 1)) };
}

/** Why an insert at this pointer would not land where intended, or null. `from` is the source. */
function insertProblem(spec: Spec, pointer: string, from?: string): string | null {
  const { parent, token } = splitPointer(pointer);
  const container = parent === "" ? spec : ownValueAt(spec, parent);
  if (container === undefined) {
    return `adds into ${parent || "/"}, which does not exist. Read the page and rebuild the operations against its current spec.`;
  }
  if (!Array.isArray(container) || token === "-") return null;
  // A move within one list removes before it adds, so measure against the shortened list.
  const removed = from !== undefined && splitPointer(from).parent === parent ? 1 : 0;
  const length = container.length - removed;
  // The library splices, so an index past the end would append; RFC 6902 calls that an error.
  const index = Number(token);
  return index > length
    ? `adds at index ${token} of a list ${removed === 1 ? "that holds" : "with"} ${length} item${length === 1 ? "" : "s"}`
      + `${removed === 1 ? " once the moved item is taken out of it" : ""}. Use "-" to append.`
    : null;
}

/** Why the pointer this op reads or overwrites isn't there, or null. */
function missingProblem(spec: Spec, pointer: string): string | null {
  return ownValueAt(spec, pointer) === undefined
    ? "addresses nothing in the current page. Read the page and rebuild the operations against its current spec."
    : null;
}

function sourceProblem(spec: Spec, op: JsonPatch): string | null {
  const source = "from" in op && typeof op.from === "string" ? op.from : null;
  if (source === null) return 'has no "from", the pointer it reads.';
  return ownValueAt(spec, source) === undefined ? `has no source at ${source}.` : null;
}

/** One precheck per op. `satisfies` makes a new op in core's union a compile error here. */
const PRECHECK = {
  add: (spec, op) => insertProblem(spec, op.path),
  remove: (spec, op) => missingProblem(spec, op.path),
  replace: (spec, op) => missingProblem(spec, op.path),
  test: (spec, op) => missingProblem(spec, op.path),
  move: (spec, op) => sourceProblem(spec, op) ?? insertProblem(spec, op.path, "from" in op && typeof op.from === "string" ? op.from : undefined),
  copy: (spec, op) => sourceProblem(spec, op) ?? insertProblem(spec, op.path),
} satisfies Record<JsonPatch["op"], (spec: Spec, op: JsonPatch) => string | null>;

/**
 * Apply a patch, refusing ops the library would swallow: missing paths on remove, missing
 * `from`, autovivified containers, out-of-range indexes. `copy` is applied as an add of a deep
 * clone, since the library inserts the source object itself and later edits would alias it.
 */
export function applyOps(before: StrataSpec, ops: JsonPatch[]): Spec | HandlerResult {
  // applySpecPatch mutates its argument; clone so a refused patch leaves `row.document` intact.
  let spec: Spec = structuredClone(before);
  for (const [index, op] of ops.entries()) {
    const badOp = (message: string): HandlerResult => fail(422, {
      error: `Operation ${index} (${op.op} ${op.path}) ${message}`,
      code: "invalid_ops",
      path: `/ops/${index}`,
      next: ["get_page", "patch_page_spec"],
    });
    const reserved = prototypeToken(op.path)
      ?? ("from" in op && typeof op.from === "string" ? prototypeToken(op.from) : null);
    if (reserved !== null) return badOp(`addresses "${reserved}", a reserved name.`);
    const problem = PRECHECK[op.op](spec, op);
    if (problem !== null) return badOp(problem);
    try {
      if (op.op === "copy" && "from" in op && typeof op.from === "string") {
        spec = applySpecPatch(spec, { op: "add", path: op.path, value: structuredClone(getByPath(spec, op.from)) });
      } else {
        spec = applySpecPatch(spec, op);
      }
    } catch (error) {
      return badOp(`does not apply to the current page: ${error instanceof Error ? error.message : "invalid operation"}`);
    }
  }
  return spec;
}
