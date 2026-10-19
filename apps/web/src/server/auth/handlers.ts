/**
 * `POST /v1/auth/start` and `/v1/auth/verify`: email-code sign-in for agents. `start` answers the
 * same for known and unknown addresses (no membership oracle) except undeliverable ones (422);
 * `verify` answers `invalid_code` for wrong, expired and spent codes.
 */
import * as z from "zod";

import { eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { createSession } from "./owner-session";
import { MagicAuthError, type MagicAuth } from "./workos";
import { createGrant, issueTokenPair } from "@/server/credentials";
import { createNamespaceIn } from "@/server/credentials/provision";
import {
  authStartEmailWindows,
  authStartWindows,
  authVerifyFailureWindows,
  type FailureReservation,
  releaseFailureReservation,
  reserve,
  reserveFailureBudgets,
  RateLimited,
} from "@/server/credentials/provision/rate-limit";
import { emailPseudonym } from "@/server/api/http/request-source";
import {
  credentialResponse,
  GrantModeSchema,
  invalidCode,
  invalidDriver,
  isDriver,
  LabelSchema,
  withBudget,
} from "@/server/credentials/handlers";
import { fail, ok, type HandlerResult } from "@/shared/api/types";

const START_NEXT = ["start_auth"] as const;
const VERIFY_NEXT = ["verify_auth"] as const;
const AFTER_VERIFY = ["get_guide", "get_manifest", "put_page"] as const;

/** The provider's code lifetime, reported to the agent. */
const CODE_TTL_SECONDS = 600;
/** Seconds to leave between asking the person and asking them again. */
const ASK_AGAIN_INTERVAL_SECONDS = 5;

/** Lowercased once so rate limits, the provider and `namespaces.email` agree. RFC 5321 max. */
export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Length-bounded, not pattern-matched: the provider owns the code's format. */
export const CodeSchema = z.string().trim().min(4).max(16);

export const AuthStartBodySchema = z.strictObject({
  email: EmailSchema,
  driver: z.string(),
  label: LabelSchema.optional(),
});

export const AuthVerifyBodySchema = z.strictObject({
  email: EmailSchema,
  code: CodeSchema,
  driver: z.string(),
  label: LabelSchema.optional(),
  mode: GrantModeSchema.optional(),
  /** What to call the Strata; used only when this call is what creates it. */
  display_name: z.string().trim().min(1).max(60).optional(),
  /** The person's own name; used only when this call is what creates it. */
  person_name: z.string().trim().min(1).max(80).optional(),
});

export interface AuthStartInput {
  email: string;
  driver: string;
  label?: string;
  /** Keyed pseudonym for the request source: this endpoint takes no credential. */
  source_hash: string;
  /** Passed to the provider for its own abuse signals; never stored here. */
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthVerifyInput extends AuthStartInput {
  code: string;
  mode?: "rotating" | "static";
  /** Only the agent that asked the person knows this; ignored on a return visit. */
  display_name?: string;
  /** The person's name, as the agent knows it; ignored on a return visit. */
  person_name?: string;
}

/* ----------------------------------------------------------------- start */

/** Have a code sent. `driver` is checked first so a bad enum sends no email. */
export async function start(input: AuthStartInput, magic: MagicAuth): Promise<HandlerResult> {
  if (!isDriver(input.driver)) return invalidDriver(input.driver, START_NEXT);

  return withBudget(START_NEXT, async () => {
    await reserve(authStartEmailWindows(emailKey(input.email)));
    await reserve(authStartWindows(input.source_hash));

    try {
      await magic.start({
        email: input.email,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    } catch (error) {
      // Other errors are provider faults (500). Never log the provider's error object: it carries
      // the API key's request context (`redactError`).
      if (!(error instanceof MagicAuthError)) throw error;
      if (error.code === "undeliverable_email" || error.code === "invalid_email") {
        return invalidEmail(input.email);
      }
      if (error.code === "rate_limited") return providerRateLimited(error);
      throw error;
    }

    return ok({
      warnings: [] as string[],
      expires_in: CODE_TTL_SECONDS,
      interval: ASK_AGAIN_INTERVAL_SECONDS,
      next: [...VERIFY_NEXT],
    }, 202);
  });
}

/** An address no code can reach. Says nothing about whether it has a Strata. */
function invalidEmail(email: string): HandlerResult {
  return fail(422, {
    error: `Mail cannot be delivered to ${email}, so no code will arrive. Ask the person for an address they read mail at.`,
    code: "invalid_email",
    path: "/email",
    next: [...START_NEXT],
  });
}

/* ---------------------------------------------------------------- verify */

/**
 * Spend a code and return a credential. Both failure budgets are reserved before the provider call
 * and released unless the code was wrong, so the check is atomic without a transaction across the
 * network call. The namespace is found by `workos_user_id` or created.
 */
export async function verify(input: AuthVerifyInput, magic: MagicAuth): Promise<HandlerResult> {
  if (!isDriver(input.driver)) return invalidDriver(input.driver, VERIFY_NEXT);

  return withBudget(VERIFY_NEXT, async () => {
    const emailHash = emailKey(input.email);
    const reservation = await reserveFailureBudgets(
      authVerifyFailureWindows(input.source_hash, emailHash),
    );

    let identity;
    try {
      identity = await magic.verify({
        email: input.email,
        code: input.code,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    } catch (error) {
      if (!(error instanceof MagicAuthError)) {
        await releaseFailureReservation(reservation);
        throw error;
      }
      // Only a rejected code counts as a guess; throttles and outages release the reservation.
      if (error.code !== "invalid_code") {
        await releaseFailureReservation(reservation);
      }
      if (error.code === "rate_limited") return providerRateLimited(error);
      if (error.code === "unavailable") throw error;
      return invalidCode(START_NEXT);
    }

    await releaseFailureReservation(reservation);

    const joined = await claim(identity.userId, identity.email, {
      displayName: input.display_name,
      personName: input.person_name,
    });
    // One transaction: a committed grant without a token would show as connected but be unusable.
    const { grant, pair } = await getDb().transaction(async (tx) => {
      const created = await createGrant({
        namespaceId: joined.namespaceId,
        kind: "writer",
        driver: input.driver,
        label: input.label ?? input.driver,
        mode: input.mode ?? "rotating",
        issuedByGrantId: null,
      }, { db: tx });
      return { grant: created, pair: await issueTokenPair(created, { db: tx }) };
    });

    const body = credentialResponse({
      namespaceId: joined.namespaceId,
      namespaceDisplayName: joined.displayName,
      grant,
      pair,
    });
    body.next = [...AFTER_VERIFY];
    return ok(body, 201);
  });
}

/* ------------------------------------------------------------- namespace */

/** Placeholder name when the agent sends neither `display_name` nor `person_name`. */
const DEFAULT_DISPLAY_NAME = "Your Strata";

/** Names an agent may supply, used only when the Strata is created. */
interface ProvisionalNames {
  displayName?: string;
  /** Also names the Strata when `displayName` is absent. */
  personName?: string;
}

interface ClaimedNamespace {
  namespaceId: string;
  displayName: string | null;
  /** True when this verification is what brought the Strata into existence. */
  created: boolean;
}

/**
 * The Strata this identity owns, created on first visit. An advisory lock on the user id stops two
 * concurrent verifies from both creating one; the unique `workos_user_id` is the backstop.
 */
async function claim(
  userId: string,
  email: string,
  namesWhenCreated: ProvisionalNames = {},
): Promise<ClaimedNamespace> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`strata:identity:${userId}`}, 0))`);

    const [existing] = await tx
      .select({
        id: schema.namespaces.id,
        displayName: schema.namespaces.displayName,
      })
      .from(schema.namespaces)
      .where(eq(schema.namespaces.workosUserId, userId))
      .limit(1);
    if (existing !== undefined) {
      return { namespaceId: existing.id, displayName: existing.displayName, created: false };
    }

    // "Ada" becomes "Ada's Strata" when no display name is given.
    const personName = namesWhenCreated.personName ?? null;
    const displayName = namesWhenCreated.displayName
      ?? (personName === null ? DEFAULT_DISPLAY_NAME : `${personName}'s Strata`);
    const created = await createNamespaceIn(tx, { displayName });
    await tx
      .update(schema.namespaces)
      .set({ workosUserId: userId, email, personName })
      .where(eq(schema.namespaces.id, created.namespace_id));
    return { namespaceId: created.namespace_id, displayName, created: true };
  });
}

/* --------------------------------------------------------------- budgets */

/** The bucket key for an address. Keyed, so `rate_limit_events` is not a list. */
function emailKey(email: string): string {
  return emailPseudonym(email);
}

/** WorkOS's per-email throttle (a bare 400) as our standard 429. Our budgets are tighter. */
function providerRateLimited(error: MagicAuthError): HandlerResult {
  const retryAfterSeconds = error.retryAfterSeconds ?? 60;
  const result = fail(429, {
    error: "The identity provider is throttling codes for this address. Wait, then ask again.",
    code: "rate_limited",
    next: [...START_NEXT],
  });
  return {
    ...result,
    headers: { "Retry-After": String(retryAfterSeconds) },
    body: { ...result.body, resource: "auth_codes_provider", retry_after_seconds: retryAfterSeconds },
  };
}

/* ------------------------------------------------------------- the browser */

/**
 * Browser sign-in for `/home/sign-in`. Shares budgets, provider calls and `claim` with the agent
 * flow but mints no grant, only an owner session. Errors are a small union rendered as one line.
 */
const SIGN_IN_FAILURES = [
  "invalid_email",
  "invalid_code",
  "rate_limited",
  "unavailable",
] as const;

export type SignInFailure = (typeof SIGN_IN_FAILURES)[number];

export type SignInStartResult =
  | { ok: true }
  | { ok: false; failure: SignInFailure; retryAfterSeconds?: number };

export type SignInVerifyResult =
  | { ok: true; namespaceId: string; secret: string; expiresAt: Date }
  | { ok: false; failure: SignInFailure; retryAfterSeconds?: number };

export interface SignInInput {
  email: string;
  sourceHash: string;
  ipAddress?: string;
  userAgent?: string;
}

/** Have a code sent to the address the person typed. */
export async function startSignIn(
  input: SignInInput,
  magic: MagicAuth,
): Promise<SignInStartResult> {
  try {
    await reserve(authStartEmailWindows(emailKey(input.email)));
    await reserve(authStartWindows(input.sourceHash));
  } catch (error) {
    if (!(error instanceof RateLimited)) throw error;
    return { ok: false, failure: "rate_limited", retryAfterSeconds: error.retryAfterSeconds };
  }

  try {
    await magic.start({
      email: input.email,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  } catch (error) {
    if (!(error instanceof MagicAuthError)) throw error;
    return { ok: false, failure: signInFailure(error), retryAfterSeconds: error.retryAfterSeconds ?? undefined };
  }
  return { ok: true };
}

/** Spend the code and open an owner session. The caller sets the cookie. */
export async function verifySignIn(
  input: SignInInput & { code: string },
  magic: MagicAuth,
): Promise<SignInVerifyResult> {
  const emailHash = emailKey(input.email);
  let reservation: FailureReservation;
  try {
    reservation = await reserveFailureBudgets(
      authVerifyFailureWindows(input.sourceHash, emailHash),
    );
  } catch (error) {
    if (!(error instanceof RateLimited)) throw error;
    return { ok: false, failure: "rate_limited", retryAfterSeconds: error.retryAfterSeconds };
  }

  let identity;
  try {
    identity = await magic.verify({
      email: input.email,
      code: input.code,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  } catch (error) {
    if (!(error instanceof MagicAuthError)) {
      await releaseFailureReservation(reservation);
      throw error;
    }
    if (error.code !== "invalid_code") {
      await releaseFailureReservation(reservation);
    }
    const failure = signInFailure(error);
    return { ok: false, failure, retryAfterSeconds: error.retryAfterSeconds ?? undefined };
  }

  await releaseFailureReservation(reservation);

  const joined = await claim(identity.userId, identity.email);
  const session = await createSession({ namespaceId: joined.namespaceId });
  return {
    ok: true,
    namespaceId: joined.namespaceId,
    secret: session.secret,
    expiresAt: session.expiresAt,
  };
}

/** Map a provider failure to one of the four sign-in messages. */
function signInFailure(error: MagicAuthError): SignInFailure {
  switch (error.code) {
    case "undeliverable_email":
    case "invalid_email":
      return "invalid_email";
    case "rate_limited":
      return "rate_limited";
    case "invalid_code":
      return "invalid_code";
    default:
      return "unavailable";
  }
}
