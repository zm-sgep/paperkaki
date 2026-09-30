import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { assignMockToChild, handwritingKeyFor, saveAttemptProgress, startAttempt, submitAttempt } from "@/application/commands/attempts";
import { createChild } from "@/application/commands/children";
import { generateMock } from "@/application/commands/papers";
import { NotFoundError } from "@/application/errors";
import { getAttemptAsset, getMockRun, getMockStart, getParentAttemptView } from "@/application/queries/attempts";
import { getChildToday } from "@/application/queries/child-today";
import type { CurrentChild } from "@/application/queries/current-child";
import { getMockPage } from "@/application/queries/papers";
import { getParentHome } from "@/application/queries/parent-home";
import { deserialiseStrokes, serialiseStrokes } from "@/domain/attempts";
import type { Database } from "@/repositories/postgres/client";
import { listAttemptPaperQuestions } from "@/repositories/postgres/attempts";
import { attemptResponses, attemptSessions, auditLogs, markingDecisions } from "@/repositories/postgres/schema";
import { AnswerSchema } from "@/schemas/question-content";
import { insertParentProfile } from "../factories";
import { confirmedAssessment, NOW } from "../helpers/assessment-fixtures";
import { createMemoryStorage, type MemoryStorage } from "../helpers/memory-storage";
import { BANK_TOPICS } from "../helpers/question-bank";
import { seedRealBank } from "../helpers/seed-bank";
import { silentLogger } from "../helpers/silent-logger";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

/** The common end-of-year paper: 50 marks, 1 h 30 min, with word problems in Section C. */
const LIMIT_SECONDS = 90 * 60;
const key = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000);

/** A short scribble in the stroke model's own format. */
function scribble(aspect = 1.6) {
  return serialiseStrokes(
    [
      {
        id: "s1",
        tool: "pen",
        width: 0.0032,
        points: [
          [0.1, 0.2, 0.5, 0],
          [0.3, 0.4, 0.5, 20],
          [0.6, 0.3, 0.5, 40],
        ],
      },
    ],
    aspect,
  );
}

describe("attempts: assign, start, autosave, resume, submit and mark", () => {
  let testDb: TestDatabase;
  let db: Database;
  let storage: MemoryStorage;
  let parentA: string;
  let parentB: string;
  let child: CurrentChild;
  let otherChild: CurrentChild;
  let paperId: string;
  let assessmentId: string;
  let attemptId: string;

  const ctx = (now: Date = NOW) => ({ db, now, storage, logger: silentLogger });

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    storage = createMemoryStorage();
    await seedRealBank(db);
    parentA = (await insertParentProfile(db, "A")).id;
    parentB = (await insertParentProfile(db, "B")).id;
    const made = await confirmedAssessment(db, parentA, BANK_TOPICS.map((topic) => topic.label), { nickname: "Darius", type: "end_of_year" });
    assessmentId = made.assessmentId;
    child = { childId: made.childId, nickname: "Darius", deviceId: "device-a", parentProfileId: parentA };
    const other = await createChild(parentB, { nickname: "Test Child B" }, { db, now: NOW });
    otherChild = { childId: other.id, nickname: "Test Child B", deviceId: "device-b", parentProfileId: parentB };
    paperId = (await generateMock(parentA, assessmentId, key(1), ctx())).paperId;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("gives a mock to the child's Today screen once, and only for the parent's own paper", async () => {
    const first = await assignMockToChild(parentA, paperId, ctx());
    expect(first.created).toBe(true);
    attemptId = first.attemptId;

    const again = await assignMockToChild(parentA, paperId, ctx());
    expect(again).toEqual({ attemptId, created: false });
    expect(await db.select().from(attemptSessions).where(eq(attemptSessions.paperId, paperId))).toHaveLength(1);

    const [row] = await db.select().from(attemptSessions).where(eq(attemptSessions.id, attemptId));
    expect(row).toMatchObject({ childId: child.childId, mode: "ipad", status: "assigned", createdBy: parentA, startedAt: null, timeLimitSeconds: LIMIT_SECONDS });

    await expect(assignMockToChild(parentB, paperId, ctx())).rejects.toBeInstanceOf(NotFoundError);
    await expect(assignMockToChild(parentA, "not-a-uuid", ctx())).rejects.toBeInstanceOf(NotFoundError);
    const audit = await db.select().from(auditLogs).where(eq(auditLogs.action, "attempt.assigned"));
    expect(audit).toHaveLength(1);
  });

  it("shows the parent where the mock is, on the mock page and on Home", async () => {
    const page = await getMockPage(parentA, assessmentId, paperId, ctx());
    expect(page?.ipad).toMatchObject({ status: "assigned", message: "Mock 1 is waiting on Darius's Today screen." });

    const home = await getParentHome(parentA, ctx());
    expect(home.action).toMatchObject({ kind: "start_mock", ctaLabel: "Hand over the iPad", href: `/mock/${attemptId}` });
    expect(home.action.title).toBe("Mathematics End-of-year exam · Mock 1 is waiting on Darius's Today screen");
    expect(await getParentAttemptView(parentB, attemptId, ctx())).toBeNull();
    expect(await getParentAttemptView(parentA, attemptId, ctx())).toMatchObject({ status: "assigned", childNickname: "Darius" });
  });

  it("puts the waiting mock on the child's Today as the mission, with its time and no points", async () => {
    const today = await getChildToday(child, ctx());
    expect(today.action).toMatchObject({
      kind: "start_mock",
      title: "Mathematics End-of-year exam · Mock 1",
      supportingText: "1 h 30 min",
      ctaLabel: "Start",
      href: `/mock/${attemptId}/start`,
    });
    expect(today.countdownLine).toMatch(/^Next: End-of-year exam · /);
    expect(JSON.stringify(today).toLowerCase()).not.toMatch(/point|reward/);
    // Another child sees none of it.
    expect((await getChildToday(otherChild, ctx())).action.kind).toBe("done_today");
  });

  it("shows the pre-mock facts to the child, and a 404 to any other child", async () => {
    const start = await getMockStart(child, attemptId, ctx());
    expect(start).toMatchObject({ status: "assigned", title: "Mathematics End-of-year exam · Mock 1", facts: { marks: "50 marks", duration: "1 h 30 min" } });
    expect(start?.facts.questions).toMatch(/^\d+ questions$/);
    expect(start?.instructions).toHaveLength(3);
    expect(await getMockStart(otherChild, attemptId, ctx())).toBeNull();
    expect(await getMockStart(child, "not-a-uuid", ctx())).toBeNull();
    // Not started yet: Mock Mode is not open.
    expect(await getMockRun(child, attemptId, ctx())).toMatchObject({ state: "not_started" });
    await expect(startAttempt(otherChild, attemptId, ctx())).rejects.toBeInstanceOf(NotFoundError);
    expect(await saveAttemptProgress(child, attemptId, { position: 1, savedAt: NOW.toISOString(), responses: [] }, ctx())).toEqual({ ok: false, reason: "not_open" });
  });

  it("starts the clock once, on the server", async () => {
    const started = await startAttempt(child, attemptId, ctx());
    expect(started).toMatchObject({ status: "in_progress" });
    expect(started.startedAt?.toISOString()).toBe(NOW.toISOString());

    const later = await startAttempt(child, attemptId, ctx(at(NOW, 600)));
    expect(later.startedAt?.toISOString()).toBe(NOW.toISOString());

    const page = await getMockPage(parentA, assessmentId, paperId, ctx());
    expect(page?.ipad?.status).toBe("in_progress");
  });

  it("gives Mock Mode the frozen paper without any answers, marking scheme or solutions", async () => {
    const run = await getMockRun(child, attemptId, ctx(at(NOW, 754)));
    expect(run?.state).toBe("in_progress");
    if (run?.state !== "in_progress") return;
    expect(run.elapsedSeconds).toBe(754);
    expect(run.paper.durationMinutes).toBe(90);
    expect(run.paper.title).toBe("Mathematics End-of-year exam · Mock 1");
    expect(run.paper.questions.length).toBeGreaterThan(10);
    expect(run.paper.questions.reduce((sum, q) => sum + q.marks, 0)).toBe(50);

    const json = JSON.stringify(run);
    for (const forbidden of ['"answer"', "markingScheme", "workedSolution", "verification", '"correct"', "acceptEquivalent"]) {
      expect(json, forbidden).not.toContain(forbidden);
    }
    // Multiple choice may use working if asked; everything else has a working area.
    for (const question of run.paper.questions) {
      expect(question.working).toBe(true);
      expect(Boolean(question.workingOptional)).toBe(question.input.kind === "mcq");
    }
    // Question ids are the paper's own question rows, in printed order.
    const items = await listAttemptPaperQuestions(db, run.paper.questions.length ? (await db.select().from(attemptSessions).where(eq(attemptSessions.id, attemptId)))[0]!.paperId : "");
    expect(run.paper.questions.map((q) => q.id)).toEqual(items.map((item) => item.paperQuestionId));
  });

  it("saves answers idempotently, by question, and hands them back on resume (also on another device)", async () => {
    const items = await listAttemptPaperQuestions(db, paperId);
    const [q1, q2, q3] = items;
    const payload = (savedAt: Date, typed = "12") => ({
      position: 3,
      savedAt: savedAt.toISOString(),
      responses: [
        { paperQuestionId: q1!.paperQuestionId, selected: "B", typed: null, strokes: null, flagged: true },
        { paperQuestionId: q2!.paperQuestionId, selected: null, typed, strokes: scribble(), flagged: false },
      ],
    });

    const t1 = at(NOW, 60);
    expect(await saveAttemptProgress(child, attemptId, payload(t1), ctx(at(NOW, 61)))).toEqual({ ok: true });
    expect(await saveAttemptProgress(child, attemptId, payload(t1), ctx(at(NOW, 62)))).toEqual({ ok: true });
    const rows = await db.select().from(attemptResponses).where(eq(attemptResponses.attemptId, attemptId)).orderBy(asc(attemptResponses.paperQuestionId));
    expect(rows).toHaveLength(2);

    // An older write arriving late changes nothing; a newer one replaces it.
    expect(await saveAttemptProgress(child, attemptId, payload(at(NOW, 30), "999"), ctx(at(NOW, 70)))).toEqual({ ok: true });
    let second = (await db.select().from(attemptResponses).where(eq(attemptResponses.paperQuestionId, q2!.paperQuestionId)))[0]!;
    expect(second.typedAnswer).toBe("12");
    expect(await saveAttemptProgress(child, attemptId, payload(at(NOW, 90), "15"), ctx(at(NOW, 91)))).toEqual({ ok: true });
    second = (await db.select().from(attemptResponses).where(eq(attemptResponses.paperQuestionId, q2!.paperQuestionId)))[0]!;
    expect(second.typedAnswer).toBe("15");
    expect(second.lastSavedAt.toISOString()).toBe(at(NOW, 90).toISOString());

    // The stroke document is stored in the versioned model, with its aspect, and can be read back.
    const stored = deserialiseStrokes(second.strokes);
    expect(stored).toHaveLength(1);
    expect(second.strokes).toMatchObject({ version: 1, aspect: 1.6 });

    // A device clock far in the future cannot win against every later save.
    const future = new Date(NOW.getTime() + 24 * 3_600_000);
    await saveAttemptProgress(child, attemptId, payload(future, "future"), ctx(at(NOW, 100)));
    const clamped = (await db.select().from(attemptResponses).where(eq(attemptResponses.paperQuestionId, q2!.paperQuestionId)))[0]!;
    expect(clamped.lastSavedAt.getTime()).toBeLessThanOrEqual(at(NOW, 105).getTime());
    await saveAttemptProgress(child, attemptId, payload(at(NOW, 110), "15"), ctx(at(NOW, 111)));

    // Resume: everything comes back, on any device with the child's session.
    const run = await getMockRun(child, attemptId, ctx(at(NOW, 120)));
    if (run?.state !== "in_progress") throw new Error("expected in progress");
    expect(run.saved.currentIndex).toBe(2);
    expect(run.saved.flagged).toEqual([q1!.paperQuestionId]);
    expect(run.saved.responses[q1!.paperQuestionId]).toEqual({ selected: "B" });
    expect(run.saved.responses[q2!.paperQuestionId]).toMatchObject({ typed: "15", strokes: { version: 1, aspect: 1.6 } });
    expect(run.saved.responses[q3!.paperQuestionId]).toBeUndefined();
    expect(run.elapsedSeconds).toBe(120);

    const today = await getChildToday(child, ctx(at(NOW, 120)));
    expect(today.action).toMatchObject({ kind: "resume_mock", title: "Carry on with your mock", supportingText: `Question 3 of ${items.length}`, ctaLabel: "Continue", href: `/mock/${attemptId}` });
  });

  it("refuses what it cannot trust: another child's attempt, another paper's question, broken strokes", async () => {
    const items = await listAttemptPaperQuestions(db, paperId);
    const ok = { position: 1, savedAt: at(NOW, 200).toISOString() };
    await expect(saveAttemptProgress(otherChild, attemptId, { ...ok, responses: [] }, ctx())).rejects.toBeInstanceOf(NotFoundError);
    expect(await saveAttemptProgress(child, attemptId, { ...ok, responses: [{ paperQuestionId: key(999), selected: null, typed: "1", strokes: null, flagged: false }] }, ctx())).toEqual({ ok: false, reason: "invalid" });
    expect(
      await saveAttemptProgress(child, attemptId, { ...ok, responses: [{ paperQuestionId: items[0]!.paperQuestionId, selected: null, typed: null, strokes: { version: 9, strokes: "x" }, flagged: false }] }, ctx()),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(await saveAttemptProgress(child, attemptId, { position: 0, savedAt: "not a date", responses: [] }, ctx())).toEqual({ ok: false, reason: "invalid" });
    expect(await saveAttemptProgress(child, attemptId, { ...ok, responses: [{ paperQuestionId: items[0]!.paperQuestionId, selected: "Z", typed: null, strokes: null, flagged: false }] }, ctx())).toEqual({ ok: false, reason: "invalid" });
  });

  it("hands in: freezes the attempt, saves a picture of the working, marks by rule, and sends the doubtful answer to review", async () => {
    const items = await listAttemptPaperQuestions(db, paperId);
    const answerOf = (i: number) => AnswerSchema.parse(items[i]!.question.answer);
    const mcqs = items.map((item, i) => ({ item, i })).filter(({ item }) => item.question.questionType === "mcq");
    const numbers = items.map((item, i) => ({ item, i })).filter(({ item }) => item.question.questionType === "number" && item.marks < 3);
    const wordProblems = items.map((item, i) => ({ item, i })).filter(({ item }) => item.question.questionType !== "mcq" && item.marks >= 3);
    expect(mcqs.length).toBeGreaterThanOrEqual(2);
    expect(numbers.length).toBeGreaterThanOrEqual(1);
    expect(wordProblems.length).toBeGreaterThanOrEqual(1);

    const rightMcq = mcqs[0]!;
    const wrongMcq = mcqs[1]!;
    const numberQ = numbers.find(({ i }) => answerOf(i).kind === "number" && (answerOf(i) as { unit?: string }).unit) ?? numbers[0]!;
    const wordQ = wordProblems[0]!;
    const correctOption = (i: number) => (answerOf(i) as { correct: "A" | "B" | "C" | "D" }).correct;
    const wrongOption = (i: number) => (["A", "B", "C", "D"] as const).find((o) => o !== correctOption(i))!;
    const numberAnswer = answerOf(numberQ.i) as { kind: "number"; value: string; unit?: string };

    const submitTime = at(NOW, LIMIT_SECONDS + 90);
    const saveAt = at(NOW, 300);
    const responses = [
      { paperQuestionId: rightMcq.item.paperQuestionId, selected: correctOption(rightMcq.i), typed: null, strokes: null, flagged: false },
      { paperQuestionId: wrongMcq.item.paperQuestionId, selected: wrongOption(wrongMcq.i), typed: null, strokes: null, flagged: true },
      { paperQuestionId: numberQ.item.paperQuestionId, selected: null, typed: numberAnswer.value, strokes: null, flagged: false },
      { paperQuestionId: wordQ.item.paperQuestionId, selected: null, typed: "0.01", strokes: scribble(), flagged: false },
    ];
    // Earlier test answers on the first two questions are replaced by these newer ones.
    expect(await saveAttemptProgress(child, attemptId, { position: 5, savedAt: saveAt.toISOString(), responses }, ctx(at(NOW, 301)))).toEqual({ ok: true });

    const result = await submitAttempt(child, attemptId, ctx(submitTime));
    expect(result).toMatchObject({ ok: true, alreadySubmitted: false });

    const [attempt] = await db.select().from(attemptSessions).where(eq(attemptSessions.id, attemptId));
    expect(attempt).toMatchObject({ status: "submitted", elapsedSeconds: LIMIT_SECONDS + 90, overTimeSeconds: 90 });
    expect(attempt?.submittedAt?.toISOString()).toBe(submitTime.toISOString());

    // One answer row and one decision per question, blank ones included.
    const answers = await db.select().from(attemptResponses).where(eq(attemptResponses.attemptId, attemptId));
    expect(answers).toHaveLength(items.length);
    const decisions = await db.select({ decision: markingDecisions, paperQuestionId: attemptResponses.paperQuestionId }).from(markingDecisions).innerJoin(attemptResponses, eq(attemptResponses.id, markingDecisions.attemptResponseId)).where(eq(attemptResponses.attemptId, attemptId));
    expect(decisions).toHaveLength(items.length);
    const byQuestion = new Map(decisions.map((row) => [row.paperQuestionId, row.decision]));

    expect(byQuestion.get(rightMcq.item.paperQuestionId)).toMatchObject({ score: rightMcq.item.marks, maxScore: rightMcq.item.marks, method: "deterministic", confidence: "high", reviewRequired: false, finalScore: rightMcq.item.marks });
    expect(byQuestion.get(wrongMcq.item.paperQuestionId)).toMatchObject({ score: 0, maxScore: wrongMcq.item.marks, reviewRequired: false, finalScore: 0 });
    // The unit that stood beside the box counts, so a bare correct number earns full marks.
    expect(byQuestion.get(numberQ.item.paperQuestionId)).toMatchObject({ score: numberQ.item.marks, reviewRequired: false, finalScore: numberQ.item.marks });
    // A word problem with a wrong answer but working shown needs a person.
    expect(byQuestion.get(wordQ.item.paperQuestionId)).toMatchObject({ score: 0, method: "needs_review", confidence: "low", reviewRequired: true, finalScore: null });
    // Blank questions score zero and are not doubtful (unless a word problem shows working, and none does).
    const blankQuestion = items.find((item) => ![rightMcq, wrongMcq, numberQ, wordQ].some((chosen) => chosen.item.paperQuestionId === item.paperQuestionId))!;
    expect(byQuestion.get(blankQuestion.paperQuestionId)).toMatchObject({ score: 0, reviewRequired: false, finalScore: 0 });

    // Totals: proposed score of everything settled, and exactly one answer waiting for review.
    const settled = decisions.filter((row) => !row.decision.reviewRequired);
    expect(settled.reduce((sum, row) => sum + row.decision.score, 0)).toBe(rightMcq.item.marks + numberQ.item.marks);
    expect(decisions.filter((row) => row.decision.reviewRequired)).toHaveLength(1);
    expect(decisions.reduce((sum, row) => sum + row.decision.maxScore, 0)).toBe(50);

    // A private picture of the working, by key only.
    const wordRow = answers.find((row) => row.paperQuestionId === wordQ.item.paperQuestionId)!;
    const expectedKey = handwritingKeyFor(parentA, attemptId, wordQ.item.position);
    expect(wordRow).toMatchObject({ handwritingBucket: "attempt-handwriting", handwritingKey: expectedKey });
    expect(expectedKey).toMatch(/^parents\/[0-9a-f-]{36}\/attempts\/[0-9a-f-]{36}\/question-\d+\.png$/);
    const png = await storage.get({ bucket: "attempt-handwriting", key: expectedKey });
    expect(png?.contentType).toBe("image/png");
    expect(Buffer.from(png!.body).subarray(1, 4).toString()).toBe("PNG");
    // Only questions with working on them have pictures (the earlier scribble on Question 2 was cleared by the newer save).
    expect(answers.filter((row) => row.handwritingKey !== null)).toHaveLength(1);
    expect(answers.every((row) => !row.handwritingKey || !/^[a-z]+:\/\//i.test(row.handwritingKey))).toBe(true);
  });

  it("is idempotent once handed in: no more saves, no second marking, and a 404 for others", async () => {
    const before = await db.select().from(markingDecisions);
    expect(await submitAttempt(child, attemptId, ctx(at(NOW, 9000)))).toMatchObject({ ok: true, alreadySubmitted: true });
    expect((await db.select().from(markingDecisions)).length).toBe(before.length);
    expect(await saveAttemptProgress(child, attemptId, { position: 1, savedAt: at(NOW, 9000).toISOString(), responses: [] }, ctx(at(NOW, 9001)))).toEqual({ ok: false, reason: "not_open" });

    const [attempt] = await db.select().from(attemptSessions).where(eq(attemptSessions.id, attemptId));
    expect(attempt?.elapsedSeconds).toBe(LIMIT_SECONDS + 90);

    await expect(submitAttempt(otherChild, attemptId, ctx())).rejects.toBeInstanceOf(NotFoundError);
    expect(await getMockRun(otherChild, attemptId, ctx())).toBeNull();
    expect(await getMockRun(child, attemptId, ctx())).toEqual({ state: "submitted", attemptId });
    expect(await getAttemptAsset(otherChild, attemptId, "any/key.png", ctx())).toBeNull();
  });

  it("puts the child back on 'done for today' and tells the parent it was handed in", async () => {
    const today = await getChildToday(child, ctx(at(NOW, 9000)));
    expect(today.action).toMatchObject({ kind: "done_today", title: "You're done for today. Nice work." });

    const page = await getMockPage(parentA, assessmentId, paperId, ctx());
    expect(page?.ipad).toMatchObject({ status: "submitted", message: "Darius handed in Mock 1." });
    // A mock that was handed in is not given again.
    const again = await assignMockToChild(parentA, paperId, ctx());
    expect(again.created).toBe(true);
  });
});
