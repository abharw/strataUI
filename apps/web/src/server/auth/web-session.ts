import { notFound, unstable_rethrow } from "next/navigation";
import { cookies } from "next/headers";
import { cache } from "react";

import { redactError } from "@/server/api/http/guard";
import { isOwnerSessionSecret, resolveOwnerSession } from "./owner-session";
import { WEB_SESSION_COOKIE } from "./session-cookie";

/** Host-only, HTTPS-only cookie name; never set a Domain attribute. */
export { WEB_SESSION_COOKIE };

export interface SessionPrincipal {
  namespaceId: string;
  /** The `owner_sessions` row, so sign-out and "this device" need no second lookup. */
  sessionId: string;
}

/**
 * `SameSite=Lax`, not `Strict`, so a page link opened from iMessage or Slack carries the session.
 * Lax still withholds it from cross-site subrequests and posts, and every Home mutation is a Server
 * Action whose Origin check covers CSRF.
 */
const OWNER_SESSION_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  priority: "high",
} as const;

/** Write the session cookie via the cookie store; a Server Action has no response object. */
export async function writeSessionCookie(secret: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(WEB_SESSION_COOKIE, secret, {
    ...OWNER_SESSION_COOKIE_ATTRIBUTES,
    expires: expiresAt,
  });
}

/** The raw secret, so sign-in can end the session it is replacing. */
export async function sessionSecret(): Promise<string | null> {
  const value = (await cookies()).get(WEB_SESSION_COOKIE)?.value;
  return value === undefined || value === "" ? null : value;
}

/**
 * Expire the session cookie. The revoked row already fails closed; this clears the stale browser
 * state. Same attributes as the mint, since a cookie is only overwritten by a matching one.
 */
export async function expireSessionCookie(): Promise<void> {
  (await cookies()).set(WEB_SESSION_COOKIE, "", {
    ...OWNER_SESSION_COOKIE_ATTRIBUTES,
    maxAge: 0,
  });
}

/**
 * Resolve the cookie without failing closed, for `/share/:key` which renders with or without a
 * session. Only an `ows_` owner session resolves; anything else is null.
 */
export const currentSessionNamespace = cache(async (): Promise<SessionPrincipal | null> => {
  const sessionSecret = (await cookies()).get(WEB_SESSION_COOKIE)?.value;
  if (sessionSecret === undefined) return null;
  if (!isOwnerSessionSecret(sessionSecret)) return null;
  try {
    const owner = await resolveOwnerSession(sessionSecret);
    return owner === null ? null : { namespaceId: owner.namespaceId, sessionId: owner.id };
  } catch (error) {
    console.error("home: web session resolution failed", redactError(error));
    return null;
  }
});

/**
 * DAL boundary for every session-backed Home read or mutation. The session is revalidated against
 * the database on every request; `notFound()` fails closed.
 */
export const requireWebSessionNamespace = cache(async (): Promise<SessionPrincipal> => {
  const session = await currentSessionNamespace();
  if (session === null) notFound();
  return session;
});

/** Keep database driver details out of Next's error reporting; rethrow framework control flow. */
export async function readHomeData<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    unstable_rethrow(error);
    console.error("home: authenticated data read failed", redactError(error));
    throw new Error("Authenticated Home data could not be loaded.");
  }
}
