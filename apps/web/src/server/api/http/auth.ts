/**
 * Bearer authentication and authorization. `kind` is checked before scope, so a viewer credential
 * can never write whatever its scope string says.
 */
import { resolveBearerCredential, type AuthenticatedIdentity } from "@/server/auth";
import { SCOPES, scopeSatisfies } from "@/server/credentials/config";
import { fail, type HandlerResult } from "@/shared/api/types";
import { hasKeyPrefix } from "@/server/credentials/keys";
import type { WriteContext } from "@/server/pages/write";
import { baseUrl } from "./origin";

export type Authenticated =
  | { ok: true; ctx: WriteContext }
  | { ok: false; result: HandlerResult };

/**
 * Authenticates the bearer credential. Read keys (`pgk_`, `spk_`) are recognised by prefix and
 * refused as the wrong kind of credential before any lookup.
 */
export async function authenticate(request: Request): Promise<Authenticated> {
  const token = bearer(request);
  if (token === null) {
    return {
      ok: false,
      result: bearerChallenge(fail(401, {
        error:
          "This endpoint needs Authorization: Bearer <credential>. Use the sw_ access token this agent was issued.",
        code: "unauthenticated",
        next: ["get_guide"],
      })),
    };
  }
  if (
    hasKeyPrefix(token, "page")
    || hasKeyPrefix(token, "space")
  ) {
    return {
      ok: false,
      result: bearerChallenge(fail(401, {
        error:
          "That is a read capability. Read keys (pgk_, spk_) authorize a Page or shared Space in a browser; API writes need an sw_ access token.",
        code: "wrong_credential_kind",
        next: ["get_guide"],
      })),
    };
  }

  const resolved = await resolveBearerCredential(token);
  if (resolved.status === "invalid") {
    return {
      ok: false,
      result: bearerChallenge(fail(401, {
        // Make clear the credential failed, not the person's Strata.
        error:
          "Strata does not accept this credential, and does not say whether it expired or was revoked. The person's Strata and every page in it are unaffected: the credential died, the workspace did not. Refresh it, and if refresh answers invalid_grant this connection is over and you ask for access again.",
        code: "unauthenticated",
        next: ["refresh_credential", "start_auth"],
      })),
    };
  }

  return {
    ok: true,
    ctx: {
      ...resolved.identity,
      baseUrl: baseUrl(request),
    },
  };
}

export function bearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header === null) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match === null ? null : match[1].trim();
}

/** Adds the 401 challenge. One realm tells the agent Strata (not a proxy) refused it; see `/auth.md`. */
export function bearerChallenge(result: HandlerResult): HandlerResult {
  if (result.status !== 401) return result;
  return {
    ...result,
    headers: { ...result.headers, "WWW-Authenticate": 'Bearer realm="strata"' },
  };
}

/** Refuses a read-only credential on a mutating path; null means proceed. */
export function requireWriter(principal: AuthenticatedIdentity): HandlerResult | null {
  if (principal.kind === "writer") return null;
  return scopeChallenge(
    fail(403, {
      error:
        "This credential is read-only. Viewer credentials can read pages and spaces but can never write, and no scope changes that. Write from the agent that holds the writer credential, or connect one with the person's email address.",
      code: "insufficient_scope",
      next: ["get_guide", "get_page"],
    }),
    SCOPES.pagesWrite,
  );
}

/** Requires one scope; a credential carries only the scopes its grant was minted with. */
export function requireScope(
  principal: AuthenticatedIdentity,
  scope: string,
): HandlerResult | null {
  // `scopeSatisfies` is the single place containment is decided, for both string and list forms.
  if (scopeSatisfies(principal.scope, [scope])) return null;
  return scopeChallenge(
    fail(403, {
      error: `This credential does not hold the ${scope} scope. A grant carries exactly what it was minted with; connect again with the person's email address to open one that holds it.`,
      code: "insufficient_scope",
      next: ["get_guide"],
    }),
    scope,
  );
}

/** RFC 6750 §3.1: a scope failure names the scope that would have worked. */
function scopeChallenge(result: HandlerResult, scope: string): HandlerResult {
  return {
    ...result,
    headers: {
      ...result.headers,
      "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${scope}"`,
    },
  };
}
