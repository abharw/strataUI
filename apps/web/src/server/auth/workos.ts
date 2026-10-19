/**
 * WorkOS Magic Auth, the only file that touches the SDK or reads `WORKOS_*`. WorkOS proves an email
 * and returns a user id; its tokens are discarded. SDK errors carry request context and possibly
 * the API key, so every failure becomes a `MagicAuthError` and the original is dropped.
 */
import { WorkOS } from "@workos-inc/node";

interface MagicAuthIdentity {
  /** The WorkOS user id (`user_01…`), stable for this email. */
  userId: string;
  /** The address WorkOS verified, as WorkOS spells it. */
  email: string;
}

interface MagicAuthStartInput {
  email: string;
  /** Forwarded to WorkOS for its own abuse signals. Never persisted here. */
  ipAddress?: string;
  userAgent?: string;
}

interface MagicAuthVerifyInput extends MagicAuthStartInput {
  code: string;
}

/** The two calls the auth handlers make; tests supply an object literal. */
export interface MagicAuth {
  /** Ask WorkOS to send a one-time code. Creates the user if it is new. */
  start(input: MagicAuthStartInput): Promise<void>;
  /** Spend a code. Resolves to the identity, or throws `MagicAuthError`. */
  verify(input: MagicAuthVerifyInput): Promise<MagicAuthIdentity>;
}

/* ---------------------------------------------------------------- errors */

/** Provider refusals as a closed set; anything unrecognised is `unavailable` (retryable 500). */
export type MagicAuthErrorCode =
  /** Wrong, expired, or already spent; one answer for all three. */
  | "invalid_code"
  /** WorkOS will not deliver to that domain, so no code is ever coming. */
  | "undeliverable_email"
  /** The provider's own per-email budget, not ours. */
  | "rate_limited"
  /** The provider refused the address for a reason the person can act on. */
  | "invalid_email"
  /** Reachable but unusable: transport failure, 5xx, a shape we do not know. */
  | "unavailable";

export class MagicAuthError extends Error {
  constructor(
    readonly code: MagicAuthErrorCode,
    /** Seconds the provider asked us to wait, when it said. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
    this.name = "MagicAuthError";
  }
}

/**
 * The WorkOS failure shape, read structurally rather than by `instanceof`, so an SDK release that
 * renames exception classes cannot turn a refusal into a 500.
 */
interface WorkOsFailure {
  status?: unknown;
  code?: unknown;
  error?: unknown;
  retryAfter?: unknown;
  rawData?: unknown;
}

/** The provider's `code` for a failure, wherever it put it. */
export function workosErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const failure = error as WorkOsFailure;
  if (typeof failure.code === "string" && failure.code !== "") return failure.code;
  const raw = failure.rawData;
  if (typeof raw === "object" && raw !== null) {
    const nested = raw as { code?: unknown; error?: unknown };
    if (typeof nested.code === "string" && nested.code !== "") return nested.code;
    if (typeof nested.error === "string" && nested.error !== "") return nested.error;
  }
  if (typeof failure.error === "string" && failure.error !== "") return failure.error;
  return null;
}

/** Which WorkOS `code` means which of ours. Everything unlisted is a judgement on status. */
const TRANSLATION: Readonly<Record<string, MagicAuthErrorCode>> = {
  invalid_one_time_code: "invalid_code",
  one_time_code_previously_used: "invalid_code",
  email_verification_required: "invalid_code",
  email_domain_not_deliverable: "undeliverable_email",
  email_not_available: "invalid_email",
  invalid_email: "invalid_email",
};

/**
 * Translate one provider failure. An unknown 400 is `invalid_code` on verify (it is nearly always
 * the code, and a 500 would invite pointless retries) and `unavailable` on start.
 */
export function translateMagicAuthError(
  error: unknown,
  surface: "start" | "verify",
): MagicAuthError {
  const status = typeof (error as WorkOsFailure | null)?.status === "number"
    ? ((error as WorkOsFailure).status as number)
    : null;
  const code = workosErrorCode(error);
  const translated = code === null ? undefined : TRANSLATION[code];
  if (translated !== undefined) return new MagicAuthError(translated, retryAfter(error));
  if (status === 429) return new MagicAuthError("rate_limited", retryAfter(error));
  if (status === 400 || status === 422) {
    return new MagicAuthError(surface === "verify" ? "invalid_code" : "unavailable");
  }
  return new MagicAuthError("unavailable");
}

function retryAfter(error: unknown): number | null {
  const value = (error as { retryAfter?: unknown } | null)?.retryAfter;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.ceil(value)
    : null;
}

/* ------------------------------------------------------------- the client */

/** Built lazily so a missing key does not break builds of surfaces that never sign anyone in. */
let client: { workos: WorkOS; clientId: string } | null = null;

function workosClient(): { workos: WorkOS; clientId: string } {
  if (client !== null) return client;
  const apiKey = process.env.WORKOS_API_KEY?.trim();
  const clientId = process.env.WORKOS_CLIENT_ID?.trim();
  if (apiKey === undefined || apiKey === "" || clientId === undefined || clientId === "") {
    throw new Error("WORKOS_API_KEY and WORKOS_CLIENT_ID must both be set to sign anybody in.");
  }
  client = { workos: new WorkOS(apiKey), clientId };
  return client;
}

/** The production `MagicAuth`. WorkOS's own tokens and sealed session are dropped unread. */
export function workosMagicAuth(): MagicAuth {
  return {
    async start(input) {
      const { workos } = workosClient();
      try {
        await workos.userManagement.createMagicAuth({
          email: input.email,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        });
      } catch (error) {
        throw translateMagicAuthError(error, "start");
      }
    },

    async verify(input) {
      const { workos, clientId } = workosClient();
      try {
        const authenticated = await workos.userManagement.authenticateWithMagicAuth({
          clientId,
          code: input.code,
          email: input.email,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        });
        return { userId: authenticated.user.id, email: authenticated.user.email };
      } catch (error) {
        throw translateMagicAuthError(error, "verify");
      }
    },
  };
}
