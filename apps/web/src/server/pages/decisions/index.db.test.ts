/** Approvals end to end through the real write and record paths. */
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { list as listDecisions } from "./handlers";
import { get, list, patchSpec, put, remove, rewriteSpec } from "@/server/pages/handlers";
import { remove as removeSpace } from "@/server/spaces/handlers";
import { createCredentialNamespace } from "@/test/namespace";
import type { StrataSpec } from "@/page-content/schema";
import { asksFor, decisionCursor, loggedAnswers, recordAnswer, type AskCounts, type DecisionCursor } from "./index";
import { questionKey } from "./question";
import { DEFAULT_WRITER_SCOPES } from "@/server/credentials";

const BASE = "https://strata.test";
const db = getDb();
const namespaceIds: string[] = [];

afterEach(async () => {
  if (namespaceIds.length > 0) {
    await db.delete(schema.namespaces).where(inArray(schema.namespaces.id, namespaceIds.splice(0)));
  }
});

// The context can change under an open asking without the question changing, so tests vary it.
function askSpec(
  question: string,
  context = "The quote holds until Friday. €1,240, non-refundable inside 72 hours.",
): StrataSpec {
  return {
    root: "root",
    answer: { verdict: "Spec under test." },
    elements: {
      root: { type: "section", props: {}, children: ["ask"] },
      ask: {
        type: "approval",
        props: {
          id: "movers",
          question,
          context,
          options: [
            { id: "book", label: "Book it" },
            { id: "wait", label: "Wait" },
          ],
        },
        children: [],
      },
    },
  };
}

async function provision() {
  const created = await createCredentialNamespace({ baseUrl: BASE });
  namespaceIds.push(created.namespace_id);
  return {
    namespace_id: created.namespace_id,
    kind: "writer" as const,
    grant_id: created.grant_id,
    scope: DEFAULT_WRITER_SCOPES,
    baseUrl: BASE,
  };
}

type Ctx = Awaited<ReturnType<typeof provision>>;

async function createPage(ctx: Ctx, spec: StrataSpec) {
  const result = await put(ctx, {
    space: { slug: "decisions", name: "Decisions", emoji: "⚖️" },
    slug: "decisions-page",
    title: "Decisions page",
    summary: "Created page",
    spec,
  });
  expect(result.status).toBe(201);
  return result.body.page_id as string;
}

async function currentAsk(pageId: string, spec: StrataSpec) {
  const [ask] = await asksFor(pageId, spec);
  return ask;
}

async function tap(pageId: string, spec: StrataSpec, optionId: string) {
  const ask = await currentAsk(pageId, spec);
  return recordAnswer(pageId, "owner", {
    approval_id: ask.approval_id,
    ask_seq: ask.ask_seq,
    question_key: ask.question_key,
    option_id: optionId,
  });
}

async function reword(ctx: Ctx, pageId: string, version: number, question: string) {
  const patched = await patchSpec(ctx, pageId, {
    base_version: version,
    summary: "reword",
    ops: [{ op: "replace", path: "/elements/ask/props/question", value: question }],
  });
  expect(patched.status).toBe(200);
  return patched.body.version as number;
}

describe("recording an answer", () => {
  it("records the tap and replays the same answer on a second tap", async () => {
    const ctx = await provision();
    const spec = askSpec("Book the movers for the 14th?");
    const pageId = await createPage(ctx, spec);

    const first = await tap(pageId, spec, "book");
    expect(first.status).toBe(200);
    expect(first.body.replay).toBe(false);

    const second = await tap(pageId, spec, "wait");
    expect(second.status).toBe(200);
    expect(second.body.replay).toBe(true);
    // The recorded answer wins: a second tap cannot overwrite the first.
    expect((second.body.decision as { chosen_id: string }).chosen_id).toBe("book");

    const rows = await db.select().from(schema.decisionLog).where(eq(schema.decisionLog.pageId, pageId));
    expect(rows).toHaveLength(1);
  });

  it("refuses an option the question does not offer", async () => {
    const ctx = await provision();
    const spec = askSpec("Book the movers for the 14th?");
    const pageId = await createPage(ctx, spec);
    const result = await tap(pageId, spec, "something-else");
    expect(result.status).toBe(422);
  });

  it("refuses a tap carrying an asking that is no longer the one on offer", async () => {
    const ctx = await provision();
    const spec = askSpec("Book the movers for the 14th?");
    const pageId = await createPage(ctx, spec);
    const ask = await currentAsk(pageId, spec);
    const result = await recordAnswer(pageId, "owner", {
      approval_id: ask.approval_id,
      ask_seq: ask.ask_seq + 1,
      question_key: ask.question_key,
      option_id: "book",
    });
    expect(result.status).toBe(409);
    expect((result.body as { code: string }).code).toBe("question_changed");
    // The refusal hands back what is being asked now, so the page can retarget.
    expect((result.body as { current: { ask_seq: number } }).current.ask_seq).toBe(ask.ask_seq);
  });

  it("treats a changed option label as a different question", async () => {
    const a = questionKey({
      question: "Book the movers?",
      options: [{ id: "book", label: "Book it, non-refundable" }],
    });
    const b = questionKey({
      question: "Book the movers?",
      options: [{ id: "book", label: "Book it, refundable" }],
    });
    expect(a).not.toBe(b);
  });

  it("treats a changed context line as a different question", async () => {
    const a = questionKey({
      question: "Book the movers?",
      context: "The deposit is non-refundable.",
      options: [{ id: "book", label: "Book it" }],
    });
    const b = questionKey({
      question: "Book the movers?",
      context: "The deposit is fully refundable.",
      options: [{ id: "book", label: "Book it" }],
    });
    expect(a).not.toBe(b);
  });
});

describe("asking again", () => {
  it("opens a fresh asking when the question is reworded, and again when it comes back", async () => {
    const ctx = await provision();
    const first = askSpec("Book the movers for the 14th?");
    const pageId = await createPage(ctx, first);
    expect((await tap(pageId, first, "book")).status).toBe(200);
    expect((await currentAsk(pageId, first)).answer?.chosen_id).toBe("book");

    const second = askSpec("Book the movers for the 15th?");
    const version = await reword(ctx, pageId, 1, "Book the movers for the 15th?");
    const reworded = await currentAsk(pageId, second);
    expect(reworded.ask_seq).toBe(2);
    expect(reworded.answer).toBeNull();

    // Back to the original wording. Asking 2 was never answered, so this edits it rather than
    // opening a third, and the old answer must still not count.
    await reword(ctx, pageId, version, "Book the movers for the 14th?");
    const back = await currentAsk(pageId, first);
    expect(back.ask_seq).toBe(2);
    expect(back.answer).toBeNull();
    expect((await tap(pageId, first, "wait")).status).toBe(200);

    const log = await loggedAnswers(ctx.namespace_id);
    expect(log.answers.map((row) => row.chosen_id)).toEqual(["wait", "book"]);
  });

  it("lets the agent fix the wording while nobody has answered, without asking again", async () => {
    const ctx = await provision();
    const spec = askSpec("Book the movres for the 14th?");
    const pageId = await createPage(ctx, spec);
    const before = await currentAsk(pageId, spec);

    const fixed = askSpec("Book the movers for the 14th?");
    await reword(ctx, pageId, 1, "Book the movers for the 14th?");
    const after = await currentAsk(pageId, fixed);
    expect(after.ask_seq).toBe(before.ask_seq);
    expect(after.question).toBe("Book the movers for the 14th?");

    // A tap carrying the old wording answers nothing.
    const stale = await recordAnswer(pageId, "owner", {
      approval_id: before.approval_id,
      ask_seq: before.ask_seq,
      question_key: before.question_key,
      option_id: "book",
    });
    expect(stale.status).toBe(409);
    expect((await tap(pageId, fixed, "book")).status).toBe(200);
  });

  it("freezes the wording once answered", async () => {
    const ctx = await provision();
    const spec = askSpec("Book the movers for the 14th?");
    const pageId = await createPage(ctx, spec);
    expect((await tap(pageId, spec, "book")).status).toBe(200);

    const later = askSpec("Book the movers for the 14th?", "The quote holds until Friday. Fully refundable, actually.");
    const patched = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "soften the terms",
      ops: [{ op: "replace", path: "/elements/ask", value: later.elements.ask }],
    });
    expect(patched.status).toBe(200);

    // The settled asking keeps its agreed terms; new terms are a new asking.
    const [settled] = (await loggedAnswers(ctx.namespace_id)).answers;
    expect(JSON.stringify(settled)).toContain("non-refundable");
    const now = await currentAsk(pageId, later);
    expect(now.ask_seq).toBe(2);
    expect(now.answer).toBeNull();
  });

  it("opens a fresh asking when the agent writes the same question again after it was answered", async () => {
    const ctx = await provision();
    const spec = askSpec("Approve today's spend?");
    const pageId = await createPage(ctx, spec);
    expect((await tap(pageId, spec, "book")).status).toBe(200);

    const rewritten = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "ask again",
      ops: [{ op: "replace", path: "/elements/ask", value: spec.elements.ask }],
    });
    expect(rewritten.status).toBe(200);

    const again = await currentAsk(pageId, spec);
    expect(again.ask_seq).toBe(2);
    expect(again.answer).toBeNull();
    expect((await tap(pageId, spec, "wait")).status).toBe(200);
  });

  it("leaves a standing question alone when the write touches something else", async () => {
    const ctx = await provision();
    const spec = askSpec("Approve today's spend?");
    const pageId = await createPage(ctx, spec);
    expect((await tap(pageId, spec, "book")).status).toBe(200);

    const elsewhere = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "add a note",
      ops: [
        { op: "add", path: "/elements/note", value: { type: "callout", props: { text: "Quote attached." }, children: [] } },
        { op: "add", path: "/elements/root/children/-", value: "note" },
      ],
    });
    expect(elsewhere.status).toBe(200);

    const held = await currentAsk(pageId, spec);
    expect(held.ask_seq).toBe(1);
    expect(held.answer?.chosen_id).toBe("book");
  });
});

describe("the consent log", () => {
  it("keeps the answer, and the question as it was worded, after the page is deleted", async () => {
    const ctx = await provision();
    const spec = askSpec("Book the movers for the 14th?");
    const pageId = await createPage(ctx, spec);
    expect((await tap(pageId, spec, "book")).status).toBe(200);

    const deleted = await remove({ namespace_id: ctx.namespace_id, page_id: pageId, confirm: true });
    expect(deleted.status).toBe(200);
    expect(await db.select().from(schema.pages).where(eq(schema.pages.id, pageId))).toHaveLength(0);

    const [kept] = (await loggedAnswers(ctx.namespace_id)).answers;
    expect(kept.question).toBe("Book the movers for the 14th?");
    expect(kept.page_title).toBe("Decisions page");
    expect(kept.chosen_label).toBe("Book it");
    // "Never asked" and "answered, then the page was deleted" must read differently.
    expect(kept.page_deleted_at).not.toBeNull();
  });

  it("keeps the answer when the whole track is erased with its pages", async () => {
    const ctx = await provision();
    const spec = askSpec("Book the movers for the 14th?");
    const pageId = await createPage(ctx, spec);
    expect((await tap(pageId, spec, "book")).status).toBe(200);
    const page = await get({ namespace_id: ctx.namespace_id, page_id: pageId, baseUrl: BASE });
    const spaceId = (page.body.space as { id: string }).id;

    const gone = await removeSpace({ namespace_id: ctx.namespace_id, space_id: spaceId, with_pages: true });
    expect(gone.status).toBe(200);

    const [kept] = (await loggedAnswers(ctx.namespace_id)).answers;
    expect(kept.chosen_label).toBe("Book it");
    expect(kept.page_deleted_at).not.toBeNull();
  });

  it("moves an answered asking out of open, so open means open", async () => {
    // Answered questions are not listed in `open`.
    const ctx = await provision();
    const spec = askSpec("Book the movers for the 14th?");
    const pageId = await createPage(ctx, spec);
    const before = await get({ namespace_id: ctx.namespace_id, page_id: pageId, baseUrl: BASE });
    const waiting = before.body.approvals as { open: { ask_seq: number; question: string }[]; answers: unknown[] };
    expect(waiting.open).toHaveLength(1);
    expect(waiting.open[0]).toMatchObject({ ask_seq: 1, question: "Book the movers for the 14th?" });
    expect(waiting.answers).toHaveLength(0);

    expect((await tap(pageId, spec, "book")).status).toBe(200);
    const after = await get({ namespace_id: ctx.namespace_id, page_id: pageId, baseUrl: BASE });
    const approvals = after.body.approvals as { open: unknown[]; answers: { chosen_label: string; ask_seq: number }[] };
    expect(approvals.open).toEqual([]);
    expect(approvals.answers[0]).toMatchObject({ chosen_label: "Book it", ask_seq: 1 });
  });
});

describe("knowing what needs you without reading every page", () => {
  it("counts the current asking of each question, and stops counting one taken off the page", async () => {
    const ctx = await provision();
    const spec = askSpec("Book the movers for the 14th?");
    const pageId = await createPage(ctx, spec);

    const waiting = await list({ namespace_id: ctx.namespace_id });
    expect(waiting.body.approvals_open).toBe(1);
    expect((waiting.body.pages as { approvals: AskCounts }[])[0].approvals).toEqual({ open: 1, answered: 0 });

    expect((await tap(pageId, spec, "book")).status).toBe(200);
    const answered = await list({ namespace_id: ctx.namespace_id });
    expect(answered.body.approvals_open).toBe(0);
    expect((answered.body.pages as { approvals: AskCounts }[])[0].approvals).toEqual({ open: 0, answered: 1 });

    // Asking again puts it back in the count, once, not twice.
    const rewritten = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "ask again",
      ops: [{ op: "replace", path: "/elements/ask", value: spec.elements.ask }],
    });
    expect(rewritten.status).toBe(200);
    expect((await list({ namespace_id: ctx.namespace_id })).body.approvals_open).toBe(1);

    // Removing the question from the page closes it.
    const removed = await patchSpec(ctx, pageId, {
      base_version: 2,
      summary: "drop the question",
      ops: [
        { op: "remove", path: "/elements/root/children/0" },
        { op: "remove", path: "/elements/ask" },
        // An empty root is refused.
        { op: "add", path: "/elements/note", value: { type: "callout", props: { text: "Nothing waiting on anyone." }, children: [] } },
        { op: "add", path: "/elements/root/children/-", value: "note" },
      ],
    });
    expect(removed.status).toBe(200);
    expect((await list({ namespace_id: ctx.namespace_id })).body.approvals_open).toBe(0);

    // Putting it back restores the same asking.
    const restored = await patchSpec(ctx, pageId, {
      base_version: 3,
      summary: "put it back",
      ops: [
        { op: "add", path: "/elements/ask", value: spec.elements.ask },
        { op: "add", path: "/elements/root/children/-", value: "ask" },
      ],
    });
    expect(restored.status).toBe(200);
    expect((await list({ namespace_id: ctx.namespace_id })).body.approvals_open).toBe(1);
    expect((await currentAsk(pageId, spec)).ask_seq).toBe(2);
  });
});

describe("what a write says it did to the questions", () => {
  it("names the question it reopened, so the agent knows the page is waiting again", async () => {
    const ctx = await provision();
    const spec = askSpec("Book the movers for the 14th?");
    const pageId = await createPage(ctx, spec);
    expect((await tap(pageId, spec, "book")).status).toBe(200);

    const patched = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "ask it again",
      ops: [{ op: "replace", path: "/elements/ask/props/context", value: "The quote now holds until Monday." }],
    });
    expect(patched.status).toBe(200);
    const approvals = patched.body.approvals as {
      open: { approval_id: string; ask_seq: number }[];
      asked_again: { approval_id: string; ask_seq: number }[];
    };
    expect(approvals.asked_again).toEqual([
      { approval_id: "movers", ask_seq: 2, question_key: expect.any(String) as string, question: "Book the movers for the 14th?" },
    ]);
    expect(approvals.open).toHaveLength(1);
  });

  it("says nothing about approvals when the page has none", async () => {
    const ctx = await provision();
    const plain: StrataSpec = {
      root: "root",
      answer: { verdict: "Nothing waiting on anyone." },
      elements: {
        root: { type: "section", props: {}, children: ["note"] },
        note: { type: "callout", props: { text: "Nothing waiting on anyone." }, children: [] },
      },
    };
    const result = await put(ctx, {
      space: { slug: "decisions", name: "Decisions", emoji: "⚖️" },
      slug: "plain-page",
      title: "Plain page",
      summary: "Created page",
      spec: plain,
    });
    expect(result.status).toBe(201);
    expect(result.body.approvals).toBeUndefined();
  });

  it("reports an untouched standing question as open without claiming to have asked it again", async () => {
    const ctx = await provision();
    const spec = askSpec("Book the movers for the 14th?");
    const pageId = await createPage(ctx, spec);
    const patched = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "add something else",
      ops: [{ op: "add", path: "/elements/note", value: { type: "callout", props: { text: "Nothing to do with the question." }, children: [] } },
            { op: "add", path: "/elements/root/children/-", value: "note" }],
    });
    expect(patched.status).toBe(200);
    const approvals = patched.body.approvals as { open: unknown[]; asked_again: unknown[] };
    expect(approvals.asked_again).toEqual([]);
    expect(approvals.open).toHaveLength(1);
  });
});

describe("a settled question taken off the page and put back", () => {
  it("comes back as a new asking even through a whole-spec rewrite", async () => {
    // A rewrite does not count as touching an element, but removing an answered question and
    // restoring it re-asks, so it does not reappear with its old answer.
    const ctx = await provision();
    const spec = askSpec("Book the movers for the 14th?");
    const pageId = await createPage(ctx, spec);
    expect((await tap(pageId, spec, "book")).status).toBe(200);

    const removed = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "take the question off",
      ops: [
        { op: "remove", path: "/elements/root/children/0" },
        { op: "remove", path: "/elements/ask" },
        // An empty root is refused.
        { op: "add", path: "/elements/note", value: { type: "callout", props: { text: "Nothing waiting on anyone." }, children: [] } },
        { op: "add", path: "/elements/root/children/-", value: "note" },
      ],
    });
    expect(removed.status).toBe(200);

    const back = await rewriteSpec(ctx, pageId, {
      base_version: removed.body.version as number,
      summary: "put it back",
      spec,
    });
    expect(back.status).toBe(200);
    const approvals = back.body.approvals as {
      open: { ask_seq: number }[];
      asked_again: { ask_seq: number }[];
    };
    expect(approvals.asked_again).toHaveLength(1);
    expect(approvals.open[0].ask_seq).toBe(2);

    const detail = await get({ namespace_id: ctx.namespace_id, page_id: pageId, baseUrl: BASE });
    const shown = detail.body.approvals as { open: { ask_seq: number }[]; answers: unknown[] };
    expect(shown.open[0].ask_seq).toBe(2);
    // The earlier answer does not apply to the live asking, but stays in the consent log.
    expect(shown.answers).toEqual([]);
    const logged = await loggedAnswers(ctx.namespace_id);
    expect(logged.answers.map((entry) => entry.ask_seq)).toEqual([1]);
  });

  it("keeps an unanswered question as the same asking when it comes back", async () => {
    const ctx = await provision();
    const spec = askSpec("Book the movers for the 14th?");
    const pageId = await createPage(ctx, spec);

    const removed = await patchSpec(ctx, pageId, {
      base_version: 1,
      summary: "take the question off",
      ops: [
        { op: "remove", path: "/elements/root/children/0" },
        { op: "remove", path: "/elements/ask" },
        // An empty root is refused.
        { op: "add", path: "/elements/note", value: { type: "callout", props: { text: "Nothing waiting on anyone." }, children: [] } },
        { op: "add", path: "/elements/root/children/-", value: "note" },
      ],
    });
    expect(removed.status).toBe(200);

    const back = await rewriteSpec(ctx, pageId, {
      base_version: removed.body.version as number,
      summary: "put it back",
      spec,
    });
    expect(back.status).toBe(200);
    const approvals = back.body.approvals as { open: { ask_seq: number }[]; asked_again: unknown[] };
    expect(approvals.asked_again).toEqual([]);
    expect(approvals.open[0].ask_seq).toBe(1);
  });
});

describe("reading the consent log", () => {
  /** Five answers on five pages, two of them recorded at the same instant. */
  async function seedLog(namespaceId: string): Promise<void> {
    const at = new Date("2026-08-20T09:00:00.000Z");
    await db.insert(schema.decisionLog).values(
      Array.from({ length: 5 }, (_, index) => ({
        namespaceId,
        pageId: crypto.randomUUID(),
        pageTitle: `Move ${index}`,
        approvalId: "movers",
        askSeq: 1,
        questionKey: `movers:${index}`,
        question: "Book the movers for the 14th?",
        options: [{ id: "book", label: "Book it" }],
        chosenId: "book",
        chosenLabel: `Answer ${index}`,
        answeredBy: "owner",
        // The first two share a timestamp, so a page boundary between them must not drop or
        // repeat either.
        answeredAt: index < 2 ? at : new Date(at.getTime() + index * 1_000),
      })),
    );
  }

  it("hands back one page at a time, and a cursor that resumes exactly where it stopped", async () => {
    const ctx = await provision();
    await seedLog(ctx.namespace_id);

    const whole = await loggedAnswers(ctx.namespace_id);
    expect(whole.answers).toHaveLength(5);
    expect(whole.next_before).toBeNull();

    const walked: string[] = [];
    let before: DecisionCursor | undefined;
    let pages = 0;
    while (pages < 10) {
      const page = await loggedAnswers(ctx.namespace_id, { limit: 2, before });
      walked.push(...page.answers.map((answer) => answer.chosen_label));
      pages += 1;
      if (page.next_before === null) break;
      const next = decisionCursor(page.next_before);
      expect(next).not.toBeNull();
      before = next ?? undefined;
    }

    expect(pages).toBe(3);
    expect(walked).toEqual(whole.answers.map((answer) => answer.chosen_label));
  });

  it("refuses a limit or a cursor it did not hand out, rather than silently ignoring it", async () => {
    const ctx = await provision();
    await seedLog(ctx.namespace_id);

    expect((await listDecisions({ namespace_id: ctx.namespace_id, limit: "0" })).status).toBe(422);
    expect((await listDecisions({ namespace_id: ctx.namespace_id, limit: "1000" })).status).toBe(422);
    expect((await listDecisions({ namespace_id: ctx.namespace_id, limit: "2.5" })).status).toBe(422);
    expect((await listDecisions({ namespace_id: ctx.namespace_id, before: "yesterday" })).status).toBe(422);

    const first = await listDecisions({ namespace_id: ctx.namespace_id, limit: "2" });
    expect(first.status).toBe(200);
    expect(first.body.count).toBe(2);
    const next = first.body.next_before as string;
    const second = await listDecisions({ namespace_id: ctx.namespace_id, limit: "2", before: next });
    expect(second.status).toBe(200);
    expect(second.body.count).toBe(2);
  });
});
