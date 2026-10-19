"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/shared/ui/primitives/input-otp";
import { Button } from "@/shared/ui/primitives/button";
import { Input } from "@/shared/ui/primitives/input";
import type { SignInFailure } from "@/server/auth/handlers";

import type { ResendCodeState, SignInFormState } from "@/app/(owner)/home/action-result";
import { openStrata, resendSignInCode, sendSignInCode } from "./actions";
import { signInPath } from "./paths";

const SIGN_IN_CODE_LENGTH = 6;
const DIGITS = "^[0-9]+$";

// `invalid_code` covers wrong, expired and used codes; the server does not distinguish them.
const MESSAGES: Record<SignInFailure, string> = {
  invalid_email: "We can’t send mail to that address. Check it, or try another.",
  invalid_code: "That code didn’t work. Codes last 10 minutes — send a new one.",
  rate_limited: "Too many tries. Wait a few minutes.",
  unavailable: "Couldn’t send the code just now. Try again in a moment.",
};

interface Shared {
  /** Post-sign-in destination, already validated by the page. */
  next?: string | null;
}

/** Email step. Works without JavaScript; a refusal renders in place and keeps the input. */
export function EmailForm({ email = "", next = null }: Shared & { email?: string }) {
  const [state, submit, submitting] = useActionState<SignInFormState, FormData>(
    sendSignInCode,
    null,
  );
  const failure = state?.failure ?? null;

  return (
    <form action={submit} className="flex flex-col gap-6">
      {next === null ? null : <input type="hidden" name="next" value={next} />}
      <div className="flex flex-col gap-2">
        <label htmlFor="sign-in-email" className="text-supporting text-muted-foreground">
          Email
        </label>
        <Input
          id="sign-in-email"
          name="email"
          type="email"
          size="action"
          required
          autoComplete="email"
          autoFocus
          inputMode="email"
          maxLength={254}
          defaultValue={email}
          placeholder="you@example.com"
          aria-invalid={failure !== null || undefined}
          aria-describedby="sign-in-error"
        />
      </div>
      <Notice failure={failure} />
      <Button type="submit" size="action" disabled={submitting} aria-busy={submitting || undefined}>
        {submitting ? "Sending…" : "Email me a code"}
      </Button>
    </form>
  );
}

function CodeForm({ email, next = null }: Shared & { email: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [code, setCode] = useState("");
  const [state, submit, submitting] = useActionState<SignInFormState, FormData>(
    openStrata,
    null,
  );
  const failure = state?.failure ?? null;

  // Auto-submit on the last digit via `requestSubmit`, so typed, pasted and autofilled codes
  // take the same path.
  const submitOnComplete = useCallback(() => {
    form.current?.requestSubmit();
  }, []);

  return (
    <form ref={form} action={submit} className="flex flex-col gap-6">
      <input type="hidden" name="email" value={email} />
      {next === null ? null : <input type="hidden" name="next" value={next} />}
      <InputOTP
        name="code"
        value={code}
        onChange={setCode}
        onComplete={submitOnComplete}
        maxLength={SIGN_IN_CODE_LENGTH}
        pattern={DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        disabled={submitting}
        aria-label="Email code"
        aria-invalid={failure !== null || undefined}
        aria-describedby="sign-in-error"
        // Strip spacing a mail client may add to a pasted code.
        pasteTransformer={(pasted) => pasted.replace(/[^0-9]+/gu, "")}
        containerClassName="w-full"
      >
        <InputOTPGroup>
          {Array.from({ length: SIGN_IN_CODE_LENGTH }, (_, at) => (
            <InputOTPSlot key={at} index={at} />
          ))}
        </InputOTPGroup>
      </InputOTP>

      <Notice failure={failure} />

      <Button
        type="submit"
        size="action"
        disabled={code.length !== SIGN_IN_CODE_LENGTH || submitting}
        aria-busy={submitting || undefined}
      >
        {submitting ? "Opening…" : "Open my Strata"}
      </Button>
    </form>
  );
}

/** The code and resend controls share one attempt: a newer code clears the old one. */
export function CodeStep({ email, next = null }: Shared & { email: string }) {
  const [attempt, setAttempt] = useState(0);
  const resetCode = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  return (
    <>
      <CodeForm key={attempt} email={email} next={next} />
      <div className="flex flex-col gap-1">
        <ResendCodeForm email={email} next={next} onSent={resetCode} />
        <a
          href={signInPath({ email, next })}
          className="inline-flex min-h-control items-center text-ui font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground/60"
        >
          Use a different email
        </a>
      </div>
    </>
  );
}

function ResendCodeForm({ email, next = null, onSent }: Shared & {
  email: string;
  onSent?: () => void;
}) {
  const [state, submit, submitting] = useActionState<ResendCodeState, FormData>(
    resendSignInCode,
    null,
  );
  const failure = state !== null && "failure" in state ? state.failure : null;

  useEffect(() => {
    if (state !== null && "sent" in state) onSent?.();
  }, [onSent, state]);

  return (
    <form action={submit} className="flex flex-col items-start gap-2">
      <input type="hidden" name="email" value={email} />
      {next === null ? null : <input type="hidden" name="next" value={next} />}
      <Button type="submit" variant="link" disabled={submitting} aria-busy={submitting || undefined} className="min-h-control px-0">
        {submitting ? "Sending…" : "Send another code"}
      </Button>
      <p role="status" className="text-supporting text-muted-foreground empty:hidden">
        {submitting ? null : failure !== null ? MESSAGES[failure] : state !== null ? "Another code is on its way. Check your email." : null}
      </p>
    </form>
  );
}

// Always rendered so the `aria-describedby` target exists; hidden while empty.
function Notice({ failure }: { failure: SignInFailure | null }) {
  return (
    <p
      id="sign-in-error"
      role="alert"
      className="rounded-contained bg-status-danger px-4 py-3 text-supporting text-status-danger-foreground empty:hidden"
    >
      {failure === null ? null : MESSAGES[failure]}
    </p>
  );
}
