/**
 * Error boundary for `/v1` routes. The database driver embeds the connection string in error
 * messages, so unexpected throws reach neither the client nor the logs intact.
 */
import { CONTRACT_HEADER, CONTRACT_VERSION } from "@/shared/api/version";
import { fail, type HandlerResult } from "@/shared/api/types";
import { contractRefusal, isMutating, withContractWarning } from "./contract";
import { baseUrl } from "./origin";
import { json } from "./response";

/**
 * Runs a route body, turning an unexpected throw into a 500 that leaks nothing. Also applies the
 * contract check: writes naming an older contract are refused (before authentication, since the
 * version is public) and writes naming none get a warning.
 */
export async function guard(
  request: Request,
  run: () => Promise<HandlerResult>,
): Promise<Response> {
  // Resolved up front so error responses still carry complete recovery URLs.
  const origin = baseUrl(request);
  const mutating = isMutating(request.method);
  const learned = request.headers.get(CONTRACT_HEADER)?.trim() ?? null;
  if (mutating && learned !== null && learned !== CONTRACT_VERSION) {
    return json(contractRefusal(learned), origin);
  }
  try {
    const result = await run();
    return json(
      mutating && learned === null ? withContractWarning(result) : result,
      origin,
      request.headers.get("If-None-Match"),
    );
  } catch (error) {
  // Log a redacted projection, never the error object.
    console.error("v1: unhandled error", redactError(error));
    return json(
      fail(500, {
        error: "Strata failed to handle that request. Nothing was written. Retrying is safe.",
        code: "internal_error",
        next: ["get_page_summary"],
      }),
      origin,
    );
  }
}

/** `postgres://user:password@host/db` in any error text. */
const CONNECTION_STRING = /postgres(ql)?:\/\/[^\s"']+/g;

/**
 * Log-safe projection of an error: name, code and message, with connection strings redacted. The
 * driver's messages include credentials, and `stack` is omitted as it may contain interpolated
 * arguments.
 */
export function redactError(error: unknown): {
  name: string;
  code: string;
  message: string;
} {
  const source = (typeof error === "object" && error !== null ? error : {}) as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
  };
  const message =
    typeof source.message === "string"
      ? source.message
      : typeof error === "string"
        ? error
        : String(error);

  return {
    name: typeof source.name === "string" ? source.name : typeof error,
    code: typeof source.code === "string" ? source.code : "",
    message: redact(message),
  };
}

/** Replaces every connection string in the text. */
export function redact(text: string): string {
  return text.replace(CONNECTION_STRING, "postgres://[redacted]");
}
