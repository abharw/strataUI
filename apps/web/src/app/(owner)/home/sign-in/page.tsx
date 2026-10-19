/**
 * Two-step sign-in (email, then code). `?stage=code&email=…` keeps the step across reloads;
 * a signed-in browser is redirected to `?next=` or Home.
 */
import type { Metadata } from "next";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ChromeTitle } from "@/features/navigation/chrome-title";
import { PageShell } from "@/features/navigation/page-shell";
import { currentSessionNamespace } from "@/server/auth/web-session";
import { safeNextPath } from "@/server/auth/redirect";
import { isStrataApp } from "@/server/api/http/request-app";

import { CodeStep, EmailForm } from "./sign-in-form";

interface Props {
  searchParams?: Promise<{
    stage?: string | string[];
    email?: string | string[];
    next?: string | string[];
  }>;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Open your Strata",
  robots: { index: false, follow: false },
  // Under `no-referrer` browsers send `Origin: null`, which Next's Server Action CSRF check rejects.
  referrer: "same-origin",
};

export default async function SignInPage({ searchParams = Promise.resolve({}) }: Props) {
  const [session, query, headerList] = await Promise.all([
    currentSessionNamespace(),
    searchParams,
    headers(),
  ]);
  const next = safeNextPath(first(query.next));
  if (session !== null) redirect(next ?? "/home");

  const email = address(first(query.email));
  const onCode = first(query.stage) === "code" && email !== "";
  const inApp = isStrataApp(headerList);

  return (
    <PageShell density="centered">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
        <header className="flex flex-col gap-3">
          <ChromeTitle>{onCode ? "Check your email" : "Open your Strata"}</ChromeTitle>
          <p className="text-body text-muted-foreground text-pretty">
            {onCode
              ? `We sent a 6-digit code to ${email}. It lasts 10 minutes.`
              : inApp
                ? "Enter the email you gave your assistant. Same address, same Strata."
                : "Sign in with the email you gave your assistant."}
          </p>
        </header>
        {onCode
          ? <CodeStep email={email} next={next} />
          : <EmailForm email={email} next={next} />}
      </div>
    </PageShell>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Sanitize the untrusted query-string email for display; the server validates on submit. */
function address(raw: string | undefined): string {
  if (raw === undefined) return "";
  const trimmed = raw.trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+$/u.test(trimmed) ? trimmed : "";
}
