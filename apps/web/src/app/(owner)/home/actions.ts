"use server";

/**
 * Server Actions for owner mutations from the browser. Next checks Origin on every action
 * (the CSRF half); each action re-reads the session cookie and the handler proves ownership.
 * Actions are reachable POST endpoints, so a missing session gets the same reply as a failed write.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import { revokeOwnerSession, revokeOwnerSessionsForNamespace } from "@/server/auth/owner-session";
import { currentSessionNamespace, expireSessionCookie } from "@/server/auth/web-session";
import { recordAnswer } from "@/server/pages/decisions";
import { MAX_PAGES_PER_NAMESPACE, MAX_SPACES_PER_NAMESPACE } from "@/page-content/document/limits";
import { revokeAgent } from "@/server/credentials/handlers";
import * as namespaces from "@/server/auth/namespace-handlers";
import * as pages from "@/server/pages/handlers";
import * as spaces from "@/server/spaces/handlers";
import type { HandlerResult } from "@/shared/api/types";
import { redactError } from "@/server/api/http/guard";
import { assembleOwnedPage, updateOwnedUser } from "@/server/pages/read/assemble";
import { ProvisionError, rotateKey } from "@/server/credentials/provision";
import { readOrigin } from "@/server/api/http/read-origin";
import type { ApprovalAsk } from "@/page-content/blocks/approval/view";

import type {
  DecisionResult,
  OwnerActionResult,
  RecordedDecision,
  SharedLinkResult,
} from "./action-result";

// Ownership of any id a client names is proved by the handler, not here.
const Uuid = z.uuid();
const Flag = z.boolean();
/** Bounded by what a namespace can hold, with no repeats. */
function idSelection(limit: number, noun: string) {
  return z.array(Uuid).max(limit).superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: `${noun} ids must be unique.` });
    }
  });
}

const PageSelection = idSelection(MAX_PAGES_PER_NAMESPACE, "Page");
const SpaceSelection = idSelection(MAX_SPACES_PER_NAMESPACE, "Space");

const NOTHING_HAPPENED = "Try again.";
const SHARING_UNCHANGED = "Couldn’t change sharing. Try again.";
const LINK_UNCHANGED = "Couldn’t replace this link. Try again.";
const PIN_UNCHANGED = "Couldn’t save that change. Try again.";
const PAGE_NOT_DELETED = "Couldn’t delete this Page. Try again.";
const SPACE_NOT_SHARED = "Couldn’t share this Space. Try again.";
const SPACE_NOT_DELETED = "Couldn’t delete this Space. Try again.";

type Failure = { ok: false; error: string };

function accepted(result: HandlerResult): boolean {
  return result.status >= 200 && result.status < 300;
}

function refused(act: string, result: HandlerResult, message = NOTHING_HAPPENED): Failure {
  console.warn("home: owner action refused", { act, status: result.status });
  return { ok: false, error: message };
}

// The error message is logged, never returned to the browser.
function broke(act: string, error: unknown, message = NOTHING_HAPPENED): Failure {
  console.error("home: owner action failed", { act, ...redactError(error) });
  return { ok: false, error: message };
}

/**
 * Writes each id in order and stops at the first refusal or error. Each handler commits on its
 * own, so earlier writes stay: `done` lists them, and `failure` is built from their count.
 */
async function writeEach(
  act: string,
  ids: readonly string[],
  write: (id: string) => Promise<HandlerResult>,
  failureMessage: (doneCount: number) => string,
): Promise<{ done: string[]; failure: Failure | null }> {
  const done: string[] = [];
  for (const id of ids) {
    try {
      const result = await write(id);
      if (!accepted(result)) {
        return { done, failure: refused(act, result, failureMessage(done.length)) };
      }
    } catch (error) {
      return { done, failure: broke(act, error, failureMessage(done.length)) };
    }
    done.push(id);
  }
  return { done, failure: null };
}

/* ------------------------------------------------------------- the session */

/**
 * Revoke this browser's session and expire its cookie. Works without JavaScript: `redirect`
 * answers the form post with a 303.
 */
export async function signOut(): Promise<void> {
  const session = await currentSessionNamespace();
  if (session !== null) {
    await revokeOwnerSession(session.namespaceId, session.sessionId);
  }
  // Expire the cookie even when no live session resolved.
  await expireSessionCookie();
  redirect("/home/sign-in");
}

/** Revoke every session for this Strata, including the current one. */
export async function signOutEverywhere(): Promise<void> {
  const session = await currentSessionNamespace();
  if (session !== null) {
    await revokeOwnerSessionsForNamespace(session.namespaceId);
  }
  await expireSessionCookie();
  redirect("/home/sign-in");
}

/**
 * Revoke one other browser's session. Lookup is scoped to this namespace, so another Strata's
 * session id is not found.
 */
export async function revokeDevice(sessionId: string): Promise<OwnerActionResult> {
  const session = await currentSessionNamespace();
  if (session === null) return { ok: false, error: NOTHING_HAPPENED };
  const id = Uuid.safeParse(sessionId);
  if (!id.success) return { ok: false, error: NOTHING_HAPPENED };

  try {
    const revoked = await revokeOwnerSession(session.namespaceId, id.data);
    if (revoked === null) return { ok: false, error: NOTHING_HAPPENED };
    revalidatePath("/home");
    return { ok: true, notice: "That browser is signed out." };
  } catch (error) {
    return broke("revoke-device", error);
  }
}

/* ------------------------------------------------------------- the account */

/**
 * Delete the account and everything under it (App Store guideline 5.1.1(v)). The typed
 * confirmation is checked server-side because the action is reachable without the dialog.
 */
export async function deleteStrata(confirmation: string): Promise<OwnerActionResult> {
  const session = await currentSessionNamespace();
  if (session === null) return { ok: false, error: NOTHING_HAPPENED };
  // Exact match; the client normalizes input before sending.
  if (confirmation !== "DELETE") return { ok: false, error: NOTHING_HAPPENED };

  try {
    const result = await namespaces.remove(session.namespaceId);
    if (!accepted(result)) return refused("delete-strata", result);
  } catch (error) {
    return broke("delete-strata", error);
  }

  // Outside the `try`: `redirect` throws, and catching it would report a completed deletion
  // as a failure. Revalidate so the router cache cannot show Home on back.
  await expireSessionCookie();
  revalidatePath("/home");
  redirect("/");
}

/* -------------------------------------------------------------- the agents */

/** Revoke an agent grant and its tokens. The row stays listed as revoked for attribution. */
export async function disconnectAgent(grantId: string): Promise<OwnerActionResult> {
  const session = await currentSessionNamespace();
  if (session === null) return { ok: false, error: NOTHING_HAPPENED };
  const id = Uuid.safeParse(grantId);
  if (!id.success) return { ok: false, error: NOTHING_HAPPENED };

  try {
    const result = await revokeAgent(session.namespaceId, id.data);
    if (!accepted(result)) return refused("disconnect-agent", result);
    revalidatePath("/home");
    return { ok: true, notice: null };
  } catch (error) {
    return broke("disconnect-agent", error);
  }
}

/* --------------------------------------------------------------- one page */

/**
 * Toggle a page's membership in its Space link. A `pgk_` link already sent keeps working;
 * only `rotatePageLink` revokes it. Owner unsharing cannot be undone by an agent.
 */
export async function setPageShared(
  pageId: string,
  shared: boolean,
): Promise<OwnerActionResult> {
  const session = await currentSessionNamespace();
  const id = Uuid.safeParse(pageId);
  const next = Flag.safeParse(shared);
  if (session === null || !id.success || !next.success) {
    return { ok: false, error: SHARING_UNCHANGED };
  }

  try {
    const result = await pages.update({
      namespace_id: session.namespaceId,
      page_id: id.data,
      shared: next.data,
      actor: "user",
      baseUrl: await readOrigin(),
    });
    if (!accepted(result)) return refused("set-page-shared", result, SHARING_UNCHANGED);
    revalidatePath("/home");
    revalidatePath(pagePath(id.data));
    return {
      ok: true,
      notice: next.data
        ? "Shared. This Page is now in its Space link."
        : "Unshared. This Page has left its Space link; the link you already sent still opens it.",
    };
  } catch (error) {
    return broke("set-page-shared", error, SHARING_UNCHANGED);
  }
}

/** Re-mint a page's bearer share key; the old link stops resolving immediately. */
export async function rotatePageLink(pageId: string): Promise<SharedLinkResult> {
  const session = await currentSessionNamespace();
  const id = Uuid.safeParse(pageId);
  if (session === null || !id.success) return { ok: false, error: LINK_UNCHANGED };

  try {
    // Namespace is checked in the same transaction that replaces the key.
    const rotated = await rotateKey({
      scope: "page",
      id: id.data,
      baseUrl: await readOrigin(),
      namespaceId: session.namespaceId,
    });
    revalidatePath("/home");
    revalidatePath(pagePath(id.data));
    return {
      ok: true,
      url: rotated.url,
      notice: "This Page has a new link. The previous one no longer opens.",
    };
  } catch (error) {
    // A ProvisionError is a refusal (the id names nothing here), so it is not logged.
    if (error instanceof ProvisionError) return { ok: false, error: LINK_UNCHANGED };
    return broke("rotate-page-link", error, LINK_UNCHANGED);
  }
}

/** Pin or unpin one page. Shares `updateOwnedUser` with the page menu. */
export async function setPagePinned(
  pageId: string,
  pinned: boolean,
): Promise<OwnerActionResult> {
  const session = await currentSessionNamespace();
  const id = Uuid.safeParse(pageId);
  const next = Flag.safeParse(pinned);
  if (session === null || !id.success || !next.success) {
    return { ok: false, error: PIN_UNCHANGED };
  }

  try {
    const result = await updateOwnedUser(id.data, session.namespaceId, { pinned: next.data });
    if (!accepted(result)) return refused("set-page-pinned", result, PIN_UNCHANGED);
    revalidatePath("/home");
    revalidatePath(pagePath(id.data));
    return { ok: true, notice: next.data ? "Pinned" : "Unpinned" };
  } catch (error) {
    return broke("set-page-pinned", error, PIN_UNCHANGED);
  }
}

/**
 * Pin or unpin several pages in one round trip, in selection order. If one write fails, the
 * pages before it stay changed and the result says how many.
 */
export async function setPagesPinned(
  pageIds: string[],
  pinned: boolean,
): Promise<OwnerActionResult> {
  const session = await currentSessionNamespace();
  const ids = PageSelection.safeParse(pageIds);
  const next = Flag.safeParse(pinned);
  if (session === null || !ids.success || !next.success || ids.data.length === 0) {
    return { ok: false, error: PIN_UNCHANGED };
  }

  const verb = next.data ? "Pinned" : "Unpinned";
  const { done, failure } = await writeEach(
    "set-pages-pinned",
    ids.data,
    (pageId) => updateOwnedUser(pageId, session.namespaceId, { pinned: next.data }),
    (count) => count === 0
      ? PIN_UNCHANGED
      : `${verb} ${count} of ${ids.data.length} Pages. Try again for the rest.`,
  );
  revalidatePages(done);
  return failure ?? { ok: true, notice: verb };
}

/**
 * Permanently delete pages, as `DELETE /v1/pages/{id}` does; their links stop opening.
 * `confirm` records the on-screen confirmation. If one delete fails, the pages before it stay
 * deleted and the result says how many.
 */
export async function deletePages(pageIds: string[]): Promise<OwnerActionResult> {
  const session = await currentSessionNamespace();
  const ids = PageSelection.safeParse(pageIds);
  if (session === null || !ids.success || ids.data.length === 0) {
    return { ok: false, error: PAGE_NOT_DELETED };
  }

  const { done, failure } = await writeEach(
    "delete-pages",
    ids.data,
    (pageId) => pages.remove({ namespace_id: session.namespaceId, page_id: pageId, confirm: true }),
    (count) => count === 0
      ? PAGE_NOT_DELETED
      : `Deleted ${count} of ${ids.data.length} Pages. Try again for the rest.`,
  );
  revalidatePages(done);
  return failure ?? {
    ok: true,
    notice: done.length === 1 ? "Page deleted" : `${done.length} Pages deleted`,
  };
}

const AnswerSchema = z.strictObject({
  approval_id: z.string().min(1).max(256),
  ask_seq: z.int(),
  question_key: z.string().min(1).max(512),
  option_id: z.string().min(1).max(256),
});

/**
 * Answer an approval ask on an owned page. On `question_changed` the current ask is returned so
 * a stale tab can update without reloading.
 */
export async function answerAsk(
  pageId: string,
  answer: { approval_id: string; ask_seq: number; question_key: string; option_id: string },
): Promise<DecisionResult> {
  const session = await currentSessionNamespace();
  const id = Uuid.safeParse(pageId);
  const input = AnswerSchema.safeParse(answer);
  if (session === null || !id.success || !input.success) return { ok: false, changed: null };

  try {
    const assembled = await assembleOwnedPage(id.data, session.namespaceId);
    if (!assembled.ok) return { ok: false, changed: null };
    const result = await recordAnswer(assembled.value.pageId, "owner", input.data);
    const body = result.body as {
      decision?: RecordedDecision;
      code?: string;
      current?: ApprovalAsk;
    };
    if (accepted(result) && body.decision !== undefined) {
      return { ok: true, answer: body.decision };
    }
    if (body.code === "question_changed" && body.current !== undefined) {
      return { ok: false, changed: body.current };
    }
    // Decision results carry no error copy, so only the log line is used.
    refused("answer-ask", result);
    return { ok: false, changed: null };
  } catch (error) {
    broke("answer-ask", error);
    return { ok: false, changed: null };
  }
}

/* -------------------------------------------------------------- one Space */

/**
 * Share the selected pages behind one stable Space link. Selection and key mint are one
 * transaction; sharing again returns the same link.
 */
export async function shareSpace(
  spaceId: string,
  pageIds: readonly string[],
  expectedPageIds: readonly string[],
): Promise<SharedLinkResult> {
  const session = await currentSessionNamespace();
  const id = Uuid.safeParse(spaceId);
  const selection = PageSelection.safeParse(pageIds);
  const expectedSelection = PageSelection.safeParse(expectedPageIds);
  if (session === null || !id.success || !selection.success || !expectedSelection.success) {
    return { ok: false, error: SPACE_NOT_SHARED };
  }

  try {
    const result = await spaces.shareSelection({
      namespace_id: session.namespaceId,
      space_id: id.data,
      page_ids: selection.data,
      expected_page_ids: expectedSelection.data,
      actor: "user",
      baseUrl: await readOrigin(),
    });
    const body = result.body as { space_url?: unknown; code?: unknown };
    const url = body.space_url;
    if (!accepted(result) || typeof url !== "string") {
      if (result.status === 409 && body.code === "stale_space_page_selection") {
        revalidatePath("/home");
        revalidatePath(spacePath(id.data));
        return refused("share-space", result, "This Space changed. Reopen the checklist and try again.");
      }
      return refused("share-space", result, SPACE_NOT_SHARED);
    }
    revalidatePath("/home");
    revalidatePath(spacePath(id.data));
    return { ok: true, url, notice: null };
  } catch (error) {
    return broke("share-space", error, SPACE_NOT_SHARED);
  }
}

/** Re-mint a Space's share key. Member pages keep their own links. */
export async function rotateSpaceLink(spaceId: string): Promise<SharedLinkResult> {
  const session = await currentSessionNamespace();
  const id = Uuid.safeParse(spaceId);
  if (session === null || !id.success) return { ok: false, error: LINK_UNCHANGED };

  try {
    const rotated = await rotateKey({
      scope: "space",
      id: id.data,
      baseUrl: await readOrigin(),
      namespaceId: session.namespaceId,
    });
    revalidatePath("/home");
    revalidatePath(spacePath(id.data));
    return {
      ok: true,
      url: rotated.url,
      notice: "This Space has a new link. The previous one no longer opens.",
    };
  } catch (error) {
    if (error instanceof ProvisionError) return { ok: false, error: LINK_UNCHANGED };
    return broke("rotate-space-link", error, LINK_UNCHANGED);
  }
}

/**
 * Delete Spaces and their pages (`with_pages`, as on `DELETE /v1/spaces/{id}`). If one delete
 * fails, the Spaces before it stay deleted and the result says how many.
 */
export async function deleteSpaces(spaceIds: string[]): Promise<OwnerActionResult> {
  const session = await currentSessionNamespace();
  const ids = SpaceSelection.safeParse(spaceIds);
  if (session === null || !ids.success || ids.data.length === 0) {
    return { ok: false, error: SPACE_NOT_DELETED };
  }

  const { done, failure } = await writeEach(
    "delete-spaces",
    ids.data,
    (spaceId) => spaces.remove({ namespace_id: session.namespaceId, space_id: spaceId, with_pages: true }),
    (count) => count === 0
      ? SPACE_NOT_DELETED
      : `Deleted ${count} of ${ids.data.length} Spaces. Try again for the rest.`,
  );
  revalidateSpaces(done);
  return failure ?? {
    ok: true,
    notice: done.length === 1 ? "Space deleted" : `${done.length} Spaces deleted`,
  };
}

/* ----------------------------------------------------------------- paths */

// Literal paths: revalidating the `/pages/[id]` pattern would expire every visited page.
function pagePath(pageId: string): string {
  return `/pages/${pageId}`;
}

function spacePath(spaceId: string): string {
  return `/spaces/${spaceId}`;
}

/** Home and each changed page; nothing when none changed. */
function revalidatePages(pageIds: readonly string[]): void {
  if (pageIds.length === 0) return;
  revalidatePath("/home");
  for (const pageId of pageIds) revalidatePath(pagePath(pageId));
}

function revalidateSpaces(spaceIds: readonly string[]): void {
  if (spaceIds.length === 0) return;
  revalidatePath("/home");
  for (const spaceId of spaceIds) revalidatePath(spacePath(spaceId));
}
