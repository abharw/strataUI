/**
 * Typed credential failures, each carrying its wire code and status. Messages stay generic so
 * "unknown", "expired" and "revoked" cannot be told apart.
 */

/** The wire codes Strata answers with. RFC 6749 §5.2 shapes the first three. */
type CredentialErrorCode =
  | "invalid_request"
  | "invalid_grant"
  | "invalid_code"
  | "invalid_scope"
  | "server_error";

class CredentialError extends Error {
  readonly code: CredentialErrorCode;
  readonly status: number;

  constructor(code: CredentialErrorCode, message: string, status: number) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
  }
}

/** Expired, revoked, unknown, or otherwise unusable credential material. */
export class InvalidGrant extends CredentialError {
  constructor(message = "The credential is invalid or has expired.") {
    super("invalid_grant", message, 400);
  }
}

/**
 * A refresh token presented twice: a theft or a lost response, which cannot be told apart, so the
 * grant is revoked (`reuse_detected`). Same wire code as any other bad grant.
 */
export class ReuseDetected extends InvalidGrant {
  readonly grantId: string;

  constructor(grantId: string, message = "The credential is invalid or has expired.") {
    super(message);
    this.grantId = grantId;
  }
}

/** Malformed request: missing parameter, unknown driver, bad scope shape. */
export class InvalidRequest extends CredentialError {
  constructor(message = "The request is malformed.") {
    super("invalid_request", message, 400);
  }
}

/** A requested scope is not one Strata issues. */
export class InvalidScope extends CredentialError {
  constructor(message = "The requested scope is not available.") {
    super("invalid_scope", message, 400);
  }
}
