/**
 * `GET /v1/decisions`: the consent log, kept apart from pages so deleting a page keeps what was
 * approved. Paged newest first; pass `next_before` back as `before` until it is null.
 */
import { decisionCursor, loggedAnswers, type DecisionCursor } from "./index";
import { DECISIONS_PAGE_MAX } from "@/page-content/document/limits";
import { fail, isUuid, ok, type HandlerResult } from "@/shared/api/types";

export interface ListDecisionsInput {
  namespace_id: string;
  page_id?: string | null;
  limit?: string | null;
  before?: string | null;
}

export async function list(input: ListDecisionsInput): Promise<HandlerResult> {
  const pageId = input.page_id ?? undefined;
  if (pageId !== undefined && !isUuid(pageId)) {
    return fail(422, {
      error: `${pageId} is not a page id.`,
      code: "invalid_request",
      path: "/page_id",
      next: ["list_pages", "list_decisions"],
    });
  }

  let limit: number | undefined;
  if (input.limit !== undefined && input.limit !== null) {
    limit = Number(input.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > DECISIONS_PAGE_MAX) {
      return fail(422, {
        error: `limit must be a whole number from 1 to ${DECISIONS_PAGE_MAX}.`,
        code: "invalid_request",
        path: "/limit",
        next: ["list_decisions"],
      });
    }
  }

  let before: DecisionCursor | undefined;
  if (input.before !== undefined && input.before !== null) {
    // Only cursors this endpoint issued are valid, so a bad one is a caller error.
    before = decisionCursor(input.before) ?? undefined;
    if (before === undefined) {
      return fail(422, {
        error: "before must be a next_before from an earlier page of this log.",
        code: "invalid_request",
        path: "/before",
        next: ["list_decisions"],
      });
    }
  }

  const { answers, next_before } = await loggedAnswers(input.namespace_id, { pageId, limit, before });
  return ok({
    answers,
    // Answers on deleted pages stay, stamped with the deletion time.
    count: answers.length,
    next_before,
  });
}
