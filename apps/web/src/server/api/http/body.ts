/**
 * Request body and query parsing. JSON bodies parse permissively (a ```json fence or trailing
 * commas are shell-quoting accidents, not errors), and the 256 KB body cap is enforced before parsing.
 */
import * as z from "zod";

import { MAX_BODY_BYTES } from "@/page-content/document/limits";
import { zodErrors } from "@/shared/api/errors";
import { fail, type HandlerResult } from "@/shared/api/types";

export type ParsedBody =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; result: HandlerResult };

/**
 * Reads a JSON body within the cap. On a parse failure, one repair pass strips a fence and trailing
 * commas; well-formed bodies are never repaired, so `,}` inside a string is safe.
 */
export async function readJson(request: Request): Promise<ParsedBody> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    return { ok: false, result: tooLarge(Number(declared)) };
  }

  const text = await request.text();
  // `Buffer.byteLength` avoids copying the body just to measure it.
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > MAX_BODY_BYTES) return { ok: false, result: tooLarge(bytes) };

  if (text.trim() === "") return { ok: true, value: {} };

  const parsed = parsePermissive(text);
  if (parsed === undefined) {
    return {
      ok: false,
      result: fail(400, {
        error:
          "The request body is not JSON. Send the object itself — no ```json fence, no trailing commas, no surrounding prose.",
        code: "invalid_json",
        next: ["get_guide"],
      }),
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      result: fail(400, {
        error: "The request body must be a JSON object.",
        code: "invalid_json",
        next: ["get_guide"],
      }),
    };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

/** `undefined` means "not JSON, even after the repair pass". */
function parsePermissive(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Fall through to the single repair pass.
  }

  let repaired = text.trim();
  const fence = /^```(?:[a-z]+)?\s*([\s\S]*?)\s*```$/i.exec(repaired);
  if (fence !== null) repaired = fence[1].trim();
  repaired = repaired.replace(/,(\s*[}\]])/g, "$1");

  try {
    return JSON.parse(repaired);
  } catch {
    return undefined;
  }
}

function tooLarge(bytes: number): HandlerResult {
  return fail(413, {
    error: `That body is ${bytes} bytes; the limit is ${MAX_BODY_BYTES} (256 KB). Split a page only when content has its own cadence, writer, audience, or volume boundary.`,
    code: "body_too_large",
    next: ["get_guide", "put_page"],
  });
}

/** A query parameter, or undefined when absent or empty. */
export function param(request: Request, name: string): string | undefined {
  const value = new URL(request.url).searchParams.get(name);
  return value === null || value === "" ? undefined : value;
}

const TRUE_VALUES = ["true", "1", "yes"];
const FALSE_VALUES = ["false", "0", "no"];

/**
 * A boolean query parameter (`?confirm=true`, `?with_pages=1`). Case-insensitive; unrecognised
 * values are a 422 rather than false, since Python's requests sends `True`.
 */
export function boolParam(
  request: Request,
  name: string,
): { ok: true; value: boolean | undefined } | { ok: false; result: HandlerResult } {
  const raw = param(request, name);
  if (raw === undefined) return { ok: true, value: undefined };
  const value = raw.toLowerCase();
  if (TRUE_VALUES.includes(value)) return { ok: true, value: true };
  if (FALSE_VALUES.includes(value)) return { ok: true, value: false };
  return {
    ok: false,
    result: fail(422, {
      error: `${name}=${raw} is not a boolean. Use ${TRUE_VALUES.join(", ")} or ${FALSE_VALUES.join(", ")}.`,
      code: "invalid_request",
      next: ["get_guide"],
    }),
  };
}

/** Rejects unknown query parameters with a 422, so an ignored filter never returns a misleading 200. */
export function onlyParams(request: Request, allowed: readonly string[]): HandlerResult | null {
  const unknown = [...new URL(request.url).searchParams.keys()].filter((name) => !allowed.includes(name));
  if (unknown.length === 0) return null;
  const [first] = unknown;
  return fail(422, {
    error: allowed.length === 0
      ? `This endpoint takes no query parameters, and got ${unknown.join(", ")}.`
      : `Unknown query parameter ${unknown.join(", ")}. This endpoint takes ${allowed.join(", ")}.`,
    code: "unknown_parameter",
    path: `/${first}`,
    valid: [...allowed],
    next: ["get_guide"],
  });
}

/** Parses a body against a closed schema; unknown fields are a 422 that names them. */
export function parseBody<T>(
  schema: z.ZodType<T>,
  input: unknown,
  next: readonly string[],
): T | HandlerResult {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const [first, ...rest] = zodErrors(parsed.error, { next });
  return fail(422, first ?? { error: "That request body is invalid.", code: "invalid_request", next }, rest);
}
