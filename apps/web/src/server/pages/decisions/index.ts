/** Recording and reading the answers people give to questions on a page. */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import type { StrataSpec } from "@/page-content/schema";
import { DECISIONS_PAGE_DEFAULT, DECISIONS_PAGE_MAX } from "@/page-content/document/limits";
import { fail, ok, type HandlerResult } from "@/shared/api/types";
import type { Tx } from "@/server/credentials/provision";
import { questionKey, type QuestionOption } from "./question";

/** A question as the spec states it. */
export interface SpecQuestion {
  approval_id: string;
  question_key: string;
  question: string;
  context?: string;
  options: QuestionOption[];
}

/** One asking of one question, and the answer to that asking if it has one. */
export interface Ask {
  approval_id: string;
  ask_seq: number;
  question_key: string;
  question: string;
  context?: string;
  options: QuestionOption[];
  answer: Answer | null;
}

interface Answer {
  chosen_id: string;
  chosen_label: string;
  answered_by: string;
  answered_at: string;
}

/** A row of the consent log, which outlives the page it was asked on. */
interface LoggedAnswer extends Answer {
  page_id: string;
  page_title: string;
  space_name: string | null;
  page_deleted_at: string | null;
  approval_id: string;
  ask_seq: number;
  question_key: string;
  question: string;
  context?: string;
  options: QuestionOption[];
}

function optionsOf(value: unknown): QuestionOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    const candidate = option as { id?: unknown; label?: unknown };
    if (typeof candidate.id !== "string" || typeof candidate.label !== "string") return [];
    return [{ id: candidate.id, label: candidate.label }];
  });
}

/** Every approval element in a spec, with the identity of the question it asks. */
export function approvalsIn(spec: StrataSpec): SpecQuestion[] {
  const found: SpecQuestion[] = [];
  for (const element of Object.values(spec.elements)) {
    if (element.type !== "approval") continue;
    const props = element.props as { id?: unknown; question?: unknown; context?: unknown; options?: unknown };
    if (typeof props.id !== "string" || typeof props.question !== "string" || !Array.isArray(props.options)) continue;
    const options = optionsOf(props.options);
    const context = typeof props.context === "string" ? props.context : undefined;
    found.push({
      approval_id: props.id,
      question_key: questionKey({ question: props.question, context, options }),
      question: props.question,
      ...(context === undefined ? {} : { context }),
      options,
    });
  }
  return found;
}

/** One question's asking after `reconcileAsks`. */
export interface ReconciledAsk {
  approval_id: string;
  ask_seq: number;
  question_key: string;
  question: string;
  answered: boolean;
  /** True when this write closed a settled asking and opened a fresh one. */
  asked_again: boolean;
}

/**
 * Sync the asking log with a just-written spec, inside the write transaction. Wording is
 * editable until answered, then frozen: a later write that touches the element opens a new
 * asking. `touched` holds the element ids the write addressed.
 */
export async function reconcileAsks(
  tx: Tx,
  pageId: string,
  spec: StrataSpec,
  touched: ReadonlySet<string>,
): Promise<ReconciledAsk[]> {
  const questions = approvalsIn(spec);
  const current = await latestAsks(tx, pageId);
  // A question removed from the page stops counting as open.
  const asked = new Set(questions.map((question) => question.approval_id));
  const withdrawn = [...current.keys()].filter((approvalId) => !asked.has(approvalId));
  if (withdrawn.length > 0) {
    await tx
      .update(schema.pageAsks)
      .set({ withdrawnAt: new Date() })
      .where(and(
        eq(schema.pageAsks.pageId, pageId),
        inArray(schema.pageAsks.approvalId, withdrawn),
        isNull(schema.pageAsks.withdrawnAt),
      ));
  }
  if (questions.length === 0) return [];
  const answered = await answeredSeqs(tx, pageId);
  const reconciled: ReconciledAsk[] = [];
  for (const question of questions) {
    const held = current.get(question.approval_id);
    const isAnswered = held !== undefined && answered.has(`${held.approvalId}\u0000${held.askSeq}`);
    const reworded = held !== undefined && held.questionKey !== question.question_key;
    if (held !== undefined && !isAnswered && reworded) {
      // Unanswered, so edit the wording in place. A tap with the old key still fails.
      await tx
        .update(schema.pageAsks)
        .set({ questionKey: question.question_key, withdrawnAt: null })
        .where(and(
          eq(schema.pageAsks.pageId, pageId),
          eq(schema.pageAsks.approvalId, held.approvalId),
          eq(schema.pageAsks.askSeq, held.askSeq),
        ));
      reconciled.push({
        approval_id: question.approval_id,
        ask_seq: held.askSeq,
        question_key: question.question_key,
        question: question.question,
        answered: false,
        asked_again: false,
      });
      continue;
    }
    // Answered questions are frozen, so a touching write is a new asking. An answered question
    // that was removed and is back is also re-asked, so it does not reappear with its old answer.
    const returned = held !== undefined && isAnswered && held.withdrawnAt !== null;
    const reasked = held !== undefined && isAnswered
      && (reworded || returned || touched.has(question.approval_id));
    if (held !== undefined && !reasked) {
      // An unanswered question back on the page keeps its asking.
      if (held.withdrawnAt !== null) {
        await tx
          .update(schema.pageAsks)
          .set({ withdrawnAt: null })
          .where(and(
            eq(schema.pageAsks.pageId, pageId),
            eq(schema.pageAsks.approvalId, held.approvalId),
            eq(schema.pageAsks.askSeq, held.askSeq),
          ));
      }
      reconciled.push({
        approval_id: question.approval_id,
        ask_seq: held.askSeq,
        question_key: question.question_key,
        question: question.question,
        answered: isAnswered,
        asked_again: false,
      });
      continue;
    }
    const askSeq = (held?.askSeq ?? 0) + 1;
    await tx.insert(schema.pageAsks).values({
      pageId,
      approvalId: question.approval_id,
      askSeq,
      questionKey: question.question_key,
    }).onConflictDoNothing();
    reconciled.push({
      approval_id: question.approval_id,
      ask_seq: askSeq,
      question_key: question.question_key,
      question: question.question,
      answered: false,
      asked_again: held !== undefined,
    });
  }
  return reconciled;
}

type AskRow = { approvalId: string; askSeq: number; questionKey: string; withdrawnAt: Date | null };

async function latestAsks(tx: Tx | ReturnType<typeof getDb>, pageId: string): Promise<Map<string, AskRow>> {
  const rows = await tx
    .select({
      approvalId: schema.pageAsks.approvalId,
      askSeq: schema.pageAsks.askSeq,
      questionKey: schema.pageAsks.questionKey,
      withdrawnAt: schema.pageAsks.withdrawnAt,
    })
    .from(schema.pageAsks)
    .where(eq(schema.pageAsks.pageId, pageId))
    .orderBy(desc(schema.pageAsks.askSeq));
  const latest = new Map<string, AskRow>();
  for (const row of rows) if (!latest.has(row.approvalId)) latest.set(row.approvalId, row);
  return latest;
}

async function answeredSeqs(tx: Tx | ReturnType<typeof getDb>, pageId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ approvalId: schema.decisionLog.approvalId, askSeq: schema.decisionLog.askSeq })
    .from(schema.decisionLog)
    .where(eq(schema.decisionLog.pageId, pageId));
  return new Set(rows.map((row) => `${row.approvalId}\u0000${row.askSeq}`));
}

/**
 * The current asking of every question on a page, with its answer. A question with no logged
 * asking reads as the next one, unanswered, and is recorded on first tap.
 */
export async function asksFor(pageId: string, spec: StrataSpec): Promise<Ask[]> {
  const questions = approvalsIn(spec);
  if (questions.length === 0) return [];
  const db = getDb();
  // Independent reads; this runs on every render and poll tick of a page with an approval.
  const [current, answers] = await Promise.all([
    latestAsks(db, pageId),
    db
      .select({
        approvalId: schema.decisionLog.approvalId,
        askSeq: schema.decisionLog.askSeq,
        chosenId: schema.decisionLog.chosenId,
        chosenLabel: schema.decisionLog.chosenLabel,
        answeredBy: schema.decisionLog.answeredBy,
        answeredAt: schema.decisionLog.answeredAt,
      })
      .from(schema.decisionLog)
      .where(eq(schema.decisionLog.pageId, pageId)),
  ]);
  return questions.map((question) => {
    const held = current.get(question.approval_id);
    const seq = held !== undefined && held.questionKey === question.question_key ? held.askSeq : (held?.askSeq ?? 0) + 1;
    const row = answers.find((answer) => answer.approvalId === question.approval_id && answer.askSeq === seq);
    return {
      approval_id: question.approval_id,
      ask_seq: seq,
      question_key: question.question_key,
      question: question.question,
      ...(question.context === undefined ? {} : { context: question.context }),
      options: question.options,
      answer: row === undefined ? null : {
        chosen_id: row.chosenId,
        chosen_label: row.chosenLabel,
        answered_by: row.answeredBy,
        answered_at: row.answeredAt.toISOString(),
      },
    };
  });
}

export interface AskCounts {
  open: number;
  answered: number;
}

/** Open and answered counts per page in one query, over current, non-withdrawn askings. */
export async function askCountsFor(pageIds: readonly string[]): Promise<Map<string, AskCounts>> {
  const counts = new Map<string, AskCounts>();
  if (pageIds.length === 0) return counts;
  const ids = sql.join(pageIds.map((id) => sql`${id}::uuid`), sql`, `);
  const rows = await getDb().execute<{ page_id: string; open: string; answered: string }>(sql`
    SELECT a.page_id,
           count(*) FILTER (WHERE d.id IS NULL) AS open,
           count(*) FILTER (WHERE d.id IS NOT NULL) AS answered
    FROM page_asks a
    JOIN (
      SELECT page_id, approval_id, max(ask_seq) AS ask_seq
      FROM page_asks
      WHERE page_id IN (${ids})
      GROUP BY page_id, approval_id
    ) current
      ON current.page_id = a.page_id
     AND current.approval_id = a.approval_id
     AND current.ask_seq = a.ask_seq
    LEFT JOIN decision_log d
      ON d.page_id = a.page_id
     AND d.approval_id = a.approval_id
     AND d.ask_seq = a.ask_seq
    WHERE a.page_id IN (${ids})
      AND a.withdrawn_at IS NULL
    GROUP BY a.page_id
  `);
  for (const row of rows.rows) {
    counts.set(row.page_id, { open: Number(row.open), answered: Number(row.answered) });
  }
  return counts;
}

/** Where a page of the consent log stopped, so the next one can start there. */
export interface DecisionCursor {
  answeredAt: Date;
  id: string;
}

/**
 * Parse a `before` cursor, or null. `answered_at|id`, since the timestamp alone is not unique.
 * Opaque to callers.
 */
export function decisionCursor(value: string): DecisionCursor | null {
  const [at, id] = value.split("|");
  if (at === undefined || id === undefined) return null;
  const answeredAt = new Date(at);
  if (Number.isNaN(answeredAt.getTime())) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return { answeredAt, id };
}

/** What one page of the consent log holds, newest answer first. */
export interface LoggedAnswerPage {
  answers: LoggedAnswer[];
  /** The cursor for the next page, or null once the log is exhausted. */
  next_before: string | null;
}

export interface LoggedAnswersQuery {
  /** Narrow to one page's answers, including a page that no longer exists. */
  pageId?: string;
  /** How many answers to return. Clamped to `DECISIONS_PAGE_MAX`. */
  limit?: number;
  /** Resume after a previous page, from its `next_before`. */
  before?: DecisionCursor;
}

/**
 * One page of a namespace's consent log, including answers whose page is gone. Paged because
 * nothing prunes this table.
 */
export async function loggedAnswers(
  namespaceId: string,
  { pageId, limit, before }: LoggedAnswersQuery = {},
): Promise<LoggedAnswerPage> {
  const size = Math.min(
    Math.max(Math.trunc(limit ?? DECISIONS_PAGE_DEFAULT), 1),
    DECISIONS_PAGE_MAX,
  );
  // Fetch one extra row to know whether another page exists.
  const rows = await getDb()
    .select()
    .from(schema.decisionLog)
    .where(and(
      eq(schema.decisionLog.namespaceId, namespaceId),
      pageId === undefined ? undefined : eq(schema.decisionLog.pageId, pageId),
      before === undefined
        ? undefined
        : sql`(${schema.decisionLog.answeredAt}, ${schema.decisionLog.id}) < (${before.answeredAt}, ${before.id}::uuid)`,
    ))
    .orderBy(desc(schema.decisionLog.answeredAt), desc(schema.decisionLog.id))
    .limit(size + 1);

  const page = rows.slice(0, size);
  const last = page.at(-1);
  return {
    next_before: rows.length > size && last !== undefined
      ? `${last.answeredAt.toISOString()}|${last.id}`
      : null,
    answers: page.map((row) => ({
      page_id: row.pageId,
      page_title: row.pageTitle,
      space_name: row.spaceName,
      page_deleted_at: row.pageDeletedAt === null ? null : row.pageDeletedAt.toISOString(),
      approval_id: row.approvalId,
      ask_seq: row.askSeq,
      question_key: row.questionKey,
      question: row.question,
      ...(row.context === null ? {} : { context: row.context }),
      options: optionsOf(row.options),
      chosen_id: row.chosenId,
      chosen_label: row.chosenLabel,
      answered_by: row.answeredBy,
      answered_at: row.answeredAt.toISOString(),
    })),
  };
}

/** Stamp log rows whose pages are deleted. The rows stay, so the log can tell erased pages apart. */
export async function markPagesDeleted(tx: Tx, pageIds: readonly string[]): Promise<void> {
  if (pageIds.length === 0) return;
  await tx
    .update(schema.decisionLog)
    .set({ pageDeletedAt: new Date() })
    .where(and(inArray(schema.decisionLog.pageId, [...pageIds]), isNull(schema.decisionLog.pageDeletedAt)));
}

export interface AnswerInput {
  approval_id: unknown;
  ask_seq: unknown;
  question_key: unknown;
  option_id: unknown;
}

/**
 * Record one answer. Everything the tap claims is re-checked against the page row locked for
 * update, so a concurrent patch cannot record an answer under unseen wording. A second tap on
 * the same asking returns the recorded answer with `replay: true`.
 */
export async function recordAnswer(
  pageId: string,
  answeredBy: string,
  input: AnswerInput,
): Promise<HandlerResult> {
  if (
    typeof input.approval_id !== "string" ||
    typeof input.question_key !== "string" ||
    typeof input.option_id !== "string" ||
    typeof input.ask_seq !== "number" ||
    !Number.isInteger(input.ask_seq)
  ) {
    return fail(422, {
      error: "Send approval_id, ask_seq, question_key and option_id.",
      code: "invalid_request",
      next: ["get_page"],
    });
  }
  const askSeq = input.ask_seq;
  const approvalId = input.approval_id;
  const optionId = input.option_id;
  const claimedKey = input.question_key;

  return getDb().transaction(async (tx) => {
    const [page] = await tx
      .select({
        id: schema.pages.id,
        namespaceId: schema.pages.namespaceId,
        title: schema.pages.title,
        document: schema.pages.document,
        spaceName: schema.spaces.name,
      })
      .from(schema.pages)
      .innerJoin(schema.spaces, eq(schema.spaces.id, schema.pages.spaceId))
      .where(eq(schema.pages.id, pageId))
      .for("update");
    if (page === undefined) {
      return fail(404, { error: "No page at that address.", code: "not_found", next: ["open_home"] });
    }

    const question = approvalsIn(page.document).find((candidate) => candidate.approval_id === approvalId);
    if (question === undefined) {
      return fail(404, { error: `No question ${approvalId} on this page.`, code: "not_found", next: ["get_page"] });
    }

    const current = (await latestAsks(tx, pageId)).get(approvalId);
    let seq: number;
    if (current !== undefined && current.questionKey === question.question_key) {
      seq = current.askSeq;
    } else {
      // No logged asking for the current wording yet, so record the next one now.
      seq = (current?.askSeq ?? 0) + 1;
      await tx.insert(schema.pageAsks).values({
        pageId,
        approvalId,
        askSeq: seq,
        questionKey: question.question_key,
      }).onConflictDoNothing();
    }

    if (question.question_key !== claimedKey || seq !== askSeq) {
      // Return the current asking so a tab that has not polled yet can recover without reloading.
      const [settled] = await tx
        .select()
        .from(schema.decisionLog)
        .where(and(
          eq(schema.decisionLog.pageId, pageId),
          eq(schema.decisionLog.approvalId, approvalId),
          eq(schema.decisionLog.askSeq, seq),
        ));
      return fail(409, {
        error: "That question has changed since the page was loaded. Answer the current one.",
        code: "question_changed",
        next: ["get_page"],
        current: {
          approval_id: approvalId,
          ask_seq: seq,
          question_key: question.question_key,
          answer: settled === undefined ? null : {
            chosen_id: settled.chosenId,
            chosen_label: settled.chosenLabel,
            answered_by: settled.answeredBy,
            answered_at: settled.answeredAt.toISOString(),
          },
        },
      });
    }
    const chosen = question.options.find((option) => option.id === optionId);
    if (chosen === undefined) {
      return fail(422, { error: `${optionId} is not one of the options.`, code: "invalid_request", next: ["get_page"] });
    }

    const inserted = await tx
      .insert(schema.decisionLog)
      .values({
        namespaceId: page.namespaceId,
        pageId,
        pageTitle: page.title,
        spaceName: page.spaceName,
        approvalId,
        askSeq: seq,
        questionKey: question.question_key,
        question: question.question,
        context: question.context ?? null,
        options: question.options,
        chosenId: chosen.id,
        chosenLabel: chosen.label,
        answeredBy,
      })
      // Targeted so only a second tap on one asking is swallowed.
      .onConflictDoNothing({
        target: [schema.decisionLog.pageId, schema.decisionLog.approvalId, schema.decisionLog.askSeq],
      })
      .returning();

    if (inserted.length > 0) return ok({ replay: false, decision: answerOf(inserted[0]) });

    const [existing] = await tx
      .select()
      .from(schema.decisionLog)
      .where(and(
        eq(schema.decisionLog.pageId, pageId),
        eq(schema.decisionLog.approvalId, approvalId),
        eq(schema.decisionLog.askSeq, seq),
      ));
    if (existing === undefined) {
      // The conflicting row was rolled back by a concurrent transaction; nothing was recorded.
      return fail(409, {
        error: "That answer did not go through. Try the current question again.",
        code: "question_changed",
        next: ["get_page"],
        current: {
          approval_id: approvalId,
          ask_seq: seq,
          question_key: question.question_key,
          answer: null,
        },
      });
    }
    return ok({ replay: true, decision: answerOf(existing) });
  });
}

type DecisionRow = typeof schema.decisionLog.$inferSelect;

function answerOf(row: DecisionRow) {
  return {
    approval_id: row.approvalId,
    ask_seq: row.askSeq,
    question_key: row.questionKey,
    question: row.question,
    chosen_id: row.chosenId,
    chosen_label: row.chosenLabel,
    answered_by: row.answeredBy,
    answered_at: row.answeredAt.toISOString(),
  };
}
