"use server";

// Browser sign-in uses Server Actions (Next checks origin); agents use /v1/auth/start and verify.
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import {
  CodeSchema,
  EmailSchema,
  startSignIn,
  verifySignIn,
  type SignInFailure,
  type SignInInput,
} from "@/server/auth/handlers";
import {
  describeClient,
  labelOwnerSession,
  resolveOwnerSession,
  revokeOwnerSession,
} from "@/server/auth/owner-session";
import { safeNextPath } from "@/server/auth/redirect";
import { sessionSecret, writeSessionCookie } from "@/server/auth/web-session";
import { workosMagicAuth } from "@/server/auth/workos";
import { redactError } from "@/server/api/http/guard";
import {
  requestSource,
  requestSourcePseudonym,
  requestUserAgent,
  type RequestSourcePurpose,
} from "@/server/api/http/request-source";

import type { ResendCodeState, SignInFormState } from "@/app/(owner)/home/action-result";
import { signInCodePath } from "./paths";

/** Send a code without revealing whether the address has a Strata. */
export async function sendSignInCode(
  _state: SignInFormState,
  form: FormData,
): Promise<SignInFormState> {
  const result = await requestCode(form);
  if ("failure" in result) return result;
  redirect(signInCodePath(result));
}

/** Resending stays on the code step and uses the same server-side send budget. */
export async function resendSignInCode(
  _state: ResendCodeState,
  form: FormData,
): Promise<ResendCodeState> {
  const result = await requestCode(form);
  return "failure" in result ? result : { sent: true };
}

async function requestCode(
  form: FormData,
): Promise<{ email: string; next: string | null } | { failure: SignInFailure }> {
  try {
    const next = safeNextPath(field(form, "next"));
    const parsed = EmailSchema.safeParse(field(form, "email") ?? "");
    if (!parsed.success) return { failure: "invalid_email" };

    const result = await startSignIn(await source(parsed.data, "auth-start"), workosMagicAuth());
    if (!result.ok) return { failure: result.failure };
    return { email: parsed.data, next };
  } catch (error) {
    // Log a redacted projection: provider errors carry the API key and driver errors the DSN.
    console.error("sign-in: unhandled error", redactError(error));
    return { failure: "unavailable" };
  }
}

/**
 * Verify the code and open an owner session. The email comes from a hidden field; the provider
 * binds the code to its address, so tampering cannot verify.
 */
export async function openStrata(
  _state: SignInFormState,
  form: FormData,
): Promise<SignInFormState> {
  let landing: string;
  try {
    const next = safeNextPath(field(form, "next"));
    const email = EmailSchema.safeParse(field(form, "email") ?? "");
    if (!email.success) return { failure: "invalid_email" };
    const code = CodeSchema.safeParse(field(form, "code") ?? "");
    if (!code.success) return { failure: "invalid_code" };

    const result = await verifySignIn(
      { ...(await source(email.data, "auth-verify")), code: code.data },
      workosMagicAuth(),
    );
    if (!result.ok) return { failure: result.failure };

    // Revoke the session this browser already held so it does not stay live for 90 days.
    await replaceExistingSession(result.namespaceId);
    await recordClientLabel(result.namespaceId, result.secret);
    await writeSessionCookie(result.secret, result.expiresAt);
    landing = next ?? "/home";
  } catch (error) {
    console.error("sign-in: unhandled error", redactError(error));
    return { failure: "unavailable" };
  }
  redirect(landing);
}

/** Revoke this browser's previous session only if it belongs to the same namespace. */
async function replaceExistingSession(namespaceId: string): Promise<void> {
  const secret = await sessionSecret();
  if (secret === null) return;
  const existing = await resolveOwnerSession(secret);
  if (existing === null || existing.namespaceId !== namespaceId) return;
  await revokeOwnerSession(existing.namespaceId, existing.id);
}

/**
 * Label the session with a coarse browser name for the Devices list; the raw User-Agent is not
 * stored. Failures are swallowed so sign-in still completes.
 */
async function recordClientLabel(namespaceId: string, secret: string): Promise<void> {
  try {
    const label = describeClient(requestUserAgent({ headers: await headers() }));
    if (label === null) return;
    const session = await resolveOwnerSession(secret);
    if (session === null) return;
    await labelOwnerSession(namespaceId, session.id, label);
  } catch (error) {
    console.error("sign-in: could not label the session", redactError(error));
  }
}

/**
 * Request source for rate limiting and abuse signals. `purpose` keeps send and verify in
 * separate buckets so failed codes do not use up the send allowance.
 */
async function source(
  email: string,
  purpose: RequestSourcePurpose,
): Promise<SignInInput> {
  const request = { headers: await headers() };
  return {
    email,
    sourceHash: requestSourcePseudonym(request, purpose),
    ipAddress: requestSource(request),
    userAgent: requestUserAgent(request),
  };
}

/** A string form field, capped well above the longest valid input (a 254-character email). */
function field(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  if (typeof value !== "string" || value.length > 512) return undefined;
  return value;
}
