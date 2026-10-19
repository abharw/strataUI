/** Writers create and edit; viewers only read. Checked before scope on every mutating path. */
type PrincipalKind = "writer" | "viewer";

/** One request's principal. `namespace_id` is the sole tenancy key; writes record `grant_id`. */
export interface AuthenticatedIdentity {
  kind: PrincipalKind;
  namespace_id: string;
  grant_id: string;
  scope: readonly string[];
}

export type CredentialResolution =
  | { status: "authenticated"; identity: AuthenticatedIdentity }
  | { status: "invalid" };
