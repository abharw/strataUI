/** Spec validation for writes, with no database: every refusal about what a page says. */
import { specSchemaFor, type StrataSpec } from "@/page-content/schema";
import { MAX_SUMMARY_CHARS, PAGE_TEXT_BUDGET } from "@/page-content/document/limits";
import { pageTextChars } from "@/page-content/document/text";
import type { PageKind } from "@/page-content/document/types";
import { zodErrors } from "@/shared/api/errors";
import { fail, type HandlerResult } from "@/shared/api/types";

export interface ParseSpecOptions {
  /** Where the document sits in the request: `/spec` for create and rewrite, `""` for patch. */
  pathPrefix?: "/spec" | "";
  /** The operation that can retry the repaired candidate. */
  next?: "put_page" | "patch_page_spec" | "rewrite_page_spec";
}

/**
 * zod skips refinements when the shape fails, so a shape error is the only one reported. Say so,
 * to save the agent extra round trips.
 */
const NOT_EVALUATED =
  " This is a shape error, so the rest of the page - text budget, prose placement, structure, and component props - "
  + "was not evaluated against this candidate. Fix this one and write again to see the rest.";

/** Validate a spec for a page of this cadence; only the text budget differs by `kind`. */
export function parseSpec(
  input: unknown,
  kind: PageKind,
  options: ParseSpecOptions = {},
): HandlerResult | StrataSpec {
  const result = specSchemaFor(kind).safeParse(input);
  if (result.success) return result.data;
  const prefix = options.pathPrefix ?? "/spec";
  const next = ["get_guide", "get_manifest", options.next ?? "put_page"];
  const [first, ...rest] = zodErrors(result.error, {
    next,
    code: "invalid_spec",
    prefix,
    // Patches cannot address the empty root pointer, so whole-document failures point at /elements.
    rootPath: "/elements",
  });
  if (first === undefined) {
    return fail(422, { error: "The JSON Render spec is invalid.", code: "invalid_spec", path: prefix || "/elements", next });
  }
  // Refinement issues are all custom, so none means the shape failed first.
  const shapeOnly = result.error.issues.every((issue) => issue.code !== "custom");
  return fail(422, shapeOnly ? { ...first, error: `${first.error}${NOT_EVALUATED}` } : first, rest);
}

/**
 * Require a one-line summary and return it trimmed, or the refusal. The cap keeps the
 * what-changed strip, which renders unclamped, from bypassing the text budget.
 */
export function requireSummary(summary: unknown, next: string): HandlerResult | string {
  if (typeof summary !== "string" || summary.trim() === "") {
    return fail(422, {
      error: "A write needs a one-line summary of the current change.",
      code: "summary_required",
      path: "/summary",
      next: [next],
    });
  }
  const trimmed = summary.trim();
  const chars = trimmed.length;
  if (chars > MAX_SUMMARY_CHARS) {
    return fail(422, {
      error: `This write's summary is ${chars} characters; the what-changed strip holds ${MAX_SUMMARY_CHARS}. `
        + "Name the concrete change in one line - the account of it belongs in the page body, not above it.",
      code: "summary_too_long",
      path: "/summary",
      next: [next],
    });
  }
  return trimmed;
}

/**
 * Text spent and remaining, reported on every write. `budget_remaining` floors at zero for
 * stored pages already over budget.
 */
export function textTelemetry(spec: StrataSpec, kind: PageKind): {
  text_chars: number;
  budget_remaining: number;
} {
  const text_chars = pageTextChars(spec);
  return { text_chars, budget_remaining: Math.max(0, PAGE_TEXT_BUDGET[kind] - text_chars) };
}
