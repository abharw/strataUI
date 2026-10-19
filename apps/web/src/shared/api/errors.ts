/**
 * Turns a `ZodError` into refusal bodies with escaped JSON Pointer paths, an explanation for
 * unknown keys, and nested union and record-key failures unwrapped.
 */
import type { z } from "zod";

import { jsonPointer } from "./json-pointer";
import { fail, type ApiError, type HandlerResult } from "./types";

export interface ZodRefusalOptions {
  /** The next tool(s) to call. Never empty. */
  next: readonly string[];
  /** Stable machine handle for the failure; the same on every issue. */
  code?: string;
  /** Where the validated value sits in the request, when it is nested (`/spec`). */
  prefix?: string;
  /** Path for root-level issues, since RFC 6901's empty-string root is not always actionable. */
  rootPath?: string;
}

/** zod's message for a union that matched no branch and carries no `error`. */
const GENERIC_UNION_MESSAGE = "Invalid input";

/** Issue prose with nested `invalid_key` and generic `invalid_union` details surfaced. */
function messageFor(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "unrecognized_keys":
      return `${issue.message}. This endpoint ignores nothing: send only the documented fields.`;
    case "invalid_key": {
      const detail = issue.issues.map((nested) => nested.message).join("; ");
      return detail === "" ? issue.message : `${issue.message}: ${detail}`;
    }
    case "invalid_union": {
      if (issue.message !== GENERIC_UNION_MESSAGE) return issue.message;
      const branches = [...new Set(issue.errors.flat().map((nested) => nested.message))];
      return branches.length === 0
        ? issue.message
        : `This value matches none of the shapes this field accepts: ${branches.join("; ")}.`;
    }
    default:
      return issue.message;
  }
}

function pathFor(path: readonly PropertyKey[], prefix: string, rootPath: string | undefined): string {
  const suffix = jsonPointer(path);
  if (suffix === "" && prefix === "") return rootPath ?? "";
  return `${prefix}${suffix}`;
}

export function zodErrors(error: z.ZodError, options: ZodRefusalOptions): ApiError[] {
  const { next, code = "invalid_request", prefix = "", rootPath } = options;
  return error.issues.map((issue) => ({
    error: messageFor(issue),
    code,
    path: pathFor(issue.path, prefix, rootPath),
    next,
  }));
}

/** 422 for a body that failed parsing: the first issue in `error`, the rest in `errors`. */
export function invalidRequest(error: z.ZodError, next: readonly string[]): HandlerResult {
  const [first, ...rest] = zodErrors(error, { next });
  return fail(422, first ?? { error: "That request body is invalid.", code: "invalid_request", next }, rest);
}
