// Test namespaces created directly, skipping the email-code flow that its own tests cover.
import { createGrant, issueTokenPair } from "@/server/credentials";
import { createNamespace } from "@/server/credentials/provision";

/** A namespace with one grant and one live token pair. */
export interface CredentialNamespace {
  namespace_id: string;
  grant_id: string;
  access_token: string;
  refresh_token: string;
}

export async function createCredentialNamespace(
  { driver = "instinct", label, displayName, kind = "writer" }: {
    /** Accepted but unused. */
    baseUrl?: string;
    driver?: string;
    label?: string;
    displayName?: string;
    kind?: "writer" | "viewer";
  },
): Promise<CredentialNamespace> {
  const namespace = await createNamespace({ displayName });
  const grant = await createGrant({
    namespaceId: namespace.namespace_id,
    kind,
    driver,
    label,
  });
  const pair = await issueTokenPair(grant);

  if (pair.refreshToken === null) throw new Error("A rotating grant must have a refresh token.");

  return {
    namespace_id: namespace.namespace_id,
    grant_id: grant.id,
    access_token: pair.accessToken,
    refresh_token: pair.refreshToken,
  };
}
