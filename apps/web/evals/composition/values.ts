/** Flattens every displayed primitive in a spec, excluding ids. */
import type { StrataSpec } from "../../src/page-content/schema";

import type { ComponentRole } from "./taxonomy";
import { componentRole } from "./taxonomy";
import { normalizeText } from "./text";

export interface CandidateValues {
  strings: string[];
  numbers: number[];
  booleans: boolean[];
}

function emptyValues(): CandidateValues {
  return { strings: [], numbers: [], booleans: [] };
}

function collectPrimitiveValues(
  value: unknown,
  into: CandidateValues,
  key: string | null = null,
): void {
  if (key === "id") return;
  if (typeof value === "string") {
    into.strings.push(normalizeText(value));
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    into.numbers.push(value);
    return;
  }
  if (typeof value === "boolean") {
    into.booleans.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectPrimitiveValues(entry, into);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) {
      collectPrimitiveValues(child, into, childKey);
    }
  }
}

/** Narrowed to one role, the answer block only counts for the whole page. */
export function candidateValues(
  spec: StrataSpec,
  requiredRole?: ComponentRole,
): CandidateValues {
  const values = emptyValues();
  if (requiredRole === undefined) collectPrimitiveValues(spec.answer, values);
  for (const element of Object.values(spec.elements)) {
    if (requiredRole !== undefined && componentRole(element.type) !== requiredRole) {
      continue;
    }
    collectPrimitiveValues(element.props, values);
  }
  return values;
}

/** Visual settings (including chart `x.kind`) that make no claim needing source support. */
const GRAPHIC_PRESENTATION_KEYS = new Set([
  "id",
  "kind",
  "layout",
  "presentation",
  "show_values",
  "stack",
  "y_max",
  "y_min",
]);

/** One graphic's data claims, with its axis and layout settings left out. */
export function graphicValues(props: Record<string, unknown>): CandidateValues {
  const values = emptyValues();
  const visit = (value: unknown, key: string | null = null): void => {
    if (key !== null && GRAPHIC_PRESENTATION_KEYS.has(key)) return;
    if (typeof value === "string") {
      values.strings.push(normalizeText(value));
      return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      values.numbers.push(value);
      return;
    }
    if (typeof value === "boolean") {
      values.booleans.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
    }
  };
  visit(props);
  return values;
}
