// The submodules, not the barrel, which re-exports the whole credential server.
import { ACCESS_TOKEN_PREFIXES, parseScope } from "@/server/credentials/config";
import { verifyAccessToken, type VerifiedAccessToken } from "@/server/credentials/tokens";
import type { AuthenticatedIdentity, CredentialResolution } from "./types";

export type { AuthenticatedIdentity, CredentialResolution } from "./types";

interface CredentialDependencies {
  verifyCredential: (token: string) => Promise<VerifiedAccessToken | null>;
}

const defaults: CredentialDependencies = {
  verifyCredential: (token) => verifyAccessToken(token),
};

/**
 * Verify a bearer credential and resolve its namespace. Only `sw_`/`sv_` prefixes are looked up,
 * by hash in one indexed query; a 401 never reveals unknown, expired or revoked.
 */
export async function resolveBearerCredential(
  token: string,
  dependencies: Partial<CredentialDependencies> = {},
): Promise<CredentialResolution> {
  const deps = { ...defaults, ...dependencies };

  if (!ACCESS_TOKEN_PREFIXES.some((prefix) => token.startsWith(prefix))) {
    return { status: "invalid" };
  }

  const verified = await deps.verifyCredential(token);
  if (verified === null) return { status: "invalid" };
  return { status: "authenticated", identity: grantIdentity(verified) };
}

/** `kind` comes from the grant, not the typed prefix; `verifyAccessToken` ensured they agree. */
function grantIdentity(verified: VerifiedAccessToken): AuthenticatedIdentity {
  return {
    kind: verified.kind,
    namespace_id: verified.namespaceId,
    grant_id: verified.grant.id,
    scope: normalizeScope(verified.scope),
  };
}

/** Scope as a list, whether stored as a list or an OAuth space-separated string. */
function normalizeScope(scope: string | readonly string[]): string[] {
  return typeof scope === "string" ? parseScope(scope) : [...new Set(scope)];
}
