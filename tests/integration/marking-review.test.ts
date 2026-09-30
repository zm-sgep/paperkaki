import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { MARK_ATTEMPT_JOB, processAttemptMarking } from "@/application/attempt-marking";
import { assignMockToChild, saveAttemptProgress, startAttempt, submitAttempt } from "@/application/commands/attempts";
import { createChild } from "@/application/commands/children";
import { markMistakesReviewed, markResultSeenByChild, markResultSeenByParent, saveMarkingReview } from "@/application/commands/marking-review";
import { generateMock } from "@/application/commands/papers";
import { InputError, NotFoundError } from "@/application/errors";
import { getChildToday } from "@/application/queries/child-today";
import type { CurrentChild } from "@/application/queries/current-child";
import { getParentHome } from "@/application/queries/parent-home";
import {
  getChildResult,
  getMarkedPaper,
  getMarkingStatus,
  getParentResult,
  getQuickCheck,
  listRecentResults,
} from "@/application/queries/results";
import { serialiseStrokes } from "@/domain/attempts";
import type { Database } from "@/repositories/postgres/client";
import { listAttemptPaperQuestions } from "@/repositories/postgres/attempts";
import { attemptSessions, markingDecisions, markingReviews, attemptResponses } from "@/repositories/postgres/schema";
import { AnswerSchema } from "@/schemas/question-content";
import { createAIService } from "@/services/ai/gateway";
import { createDisabledAdapter } from "@/services/ai/disabled-adapter";
import { AIError, type AIAdapter, type AIService, type MarkingInput } from "@/services/ai/types";
import { createJobService, type JobService } from "@/services/jobs";
import { insertParentProfile } from "../factories";
import { confirmedAssessment, NOW } from "../helpers/assessment-fixtures";
import { createMemoryStorage, type MemoryStorage } from "../helpers/memory-storage";
import { BANK_TOPICS } from "../helpers/question-bank";
import { seedRealBank } from "../helpers/seed-bank";
import { silentLogger } from "../helpers/silent-logger";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

const key = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

function scribble() {
  return serialiseStrokes(
    [{ id: "s1", tool: "pen", width: 0.0032, points: [[0.1, 0.2, 0.5, 0], [0.3, 0.4, 0.5, 20], [0.6, 0.3, 0.5, 40]] }],
    1.6,
  );
}

/** A marker whose answer the test chooses. Everything else the adapter is asked for is refused. */
function markerAI(respond: (input: MarkingInput) => unknown): { ai: AIService; calls: MarkingInput[] } {
  const calls: MarkingInput[] = [];
  const refuse = async (): Promise<never> => {
    throw new AIError("disabled", "off");
  };
  const adapter: AIAdapter = {
    provider: "fixture",
    extractSchoolNotice: refuse,
    mapTopics: refuse,
    readAnswers: refuse,
    readPageNumbers: refuse,
    async markResponse(input) {
      calls.push(input);
      return { output: respond(input), model: "fixture", promptVersion: "test" };
    },
  };
  return { ai: createAIService({ adapter }), calls };
}

describe("marking review, results and the marked paper (M7)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let storage: MemoryStorage;
  let parentA: string;
  let parentB: string;
  let child: CurrentChild;
  let otherChild: CurrentChild;
  let assessmentId: string;

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
  });

  afterAll(async () => {
    await testDb.close();
  });

  /** A job service that runs the marking job with the given AI service. */
  function jobsWith(ai: AIService): JobService {
    const jobs = createJobService({ db, now: () => at(1000) });
    jobs.register(MARK_ATTEMPT_JOB, async (payload) => {
      await processAttemptMarking(String(payload.attemptId), { db, ai, storage, now: at(1000) });
    });
    return jobs;
  }

  /**
   * Plays one mock: every multiple-choice and number question right except `wrongPositions`, which get a
   * wrong answer (with working for the word problems). Returns what was submitted.
   */
  async function play(paperNumberKey: number, options: { wrong: "word_problem" | "none" | "short"; jobs?: JobService } = { wrong: "word_problem" }) {
    const { paperId } = await generateMock(parentA, assessmentId, key(paperNumberKey), ctx());
    const { attemptId } = await assignMockToChild(parentA, paperId, ctx());
    await startAttempt(child, attemptId, ctx());
    const items = await listAttemptPaperQuestions(db, paperId);
    const wordProblems = items.filter((item) => item.question.questionType !== "mcq" && item.marks >= 3);
    const wordProblem = wordProblems.find((item) => AnswerSchema.parse(item.question.answer).kind === "number") ?? wordProblems[0]!;
    const shortQuestion = items.find((item) => item.question.questionType === "number" && item.marks < 3)!;
    const responses = items.map((item) => {
      const answer = AnswerSchema.parse(item.question.answer);
      const wrongHere = (options.wrong === "word_problem" && item === wordProblem) || (options.wrong === "short" && item === shortQuestion);
      if (answer.kind === "mcq") {
        const option = wrongHere ? (["A", "B", "C", "D"] as const).find((o) => o !== answer.correct)! : answer.correct;
        return { paperQuestionId: item.paperQuestionId, selected: option, typed: null, strokes: null, flagged: false };
      }
      if (answer.kind === "number") {
        const typed = wrongHere ? "0.01" : answer.value;
        return { paperQuestionId: item.paperQuestionId, selected: null, typed, strokes: item === wordProblem ? scribble() : null, flagged: false };
      }
      if (answer.kind === "fraction") {
        return { paperQuestionId: item.paperQuestionId, selected: null, typed: wrongHere ? "1/99" : answer.value, strokes: null, flagged: false };
      }
      return { paperQuestionId: item.paperQuestionId, selected: null, typed: answer.accepted[0]!, strokes: null, flagged: false };
    });
    await saveAttemptProgress(child, attemptId, { position: 1, savedAt: at(60).toISOString(), responses }, ctx(at(61)));
    const submitted = await submitAttempt(child, attemptId, { ...ctx(at(600)), ...(options.jobs ? { jobs: options.jobs } : {}) });
    return { paperId, attemptId, items, wordProblem, submitted };
  }

  let first: Awaited<ReturnType<typeof play>>;

  it("a paper with a doubtful answer waits for the parent, and results are not ready", async () => {
    first = await play(1);
    expect(first.submitted).toMatchObject({ ok: true, reviewCount: 1 });
    expect(first.submitted.markingJobId).toBeUndefined();

    const [attempt] = await db.select().from(attemptSessions).where(eq(attemptSessions.id, first.attemptId));
    expect(attempt).toMatchObject({ status: "submitted", markingStage: "done", markedAt: null });

    expect(await getMarkingStatus({ parentProfileId: parentA }, first.attemptId, ctx())).toMatchObject({ state: "needs_check", waitingCount: 1 });
    expect(await getParentResult(parentA, first.attemptId, ctx())).toBeNull();
    expect(await getChildResult(child.childId, first.attemptId, ctx())).toBeNull();
    expect(await getMarkedPaper({ kind: "parent", parentProfileId: parentA }, first.attemptId, ctx())).toBeNull();
  });

  it("puts 'a quick check' on the parent's Home and nothing on the child's Today yet", async () => {
    const home = await getParentHome(parentA, ctx());
    expect(home.action).toMatchObject({ kind: "review_marking", title: "We need a quick check on 1 answer", ctaLabel: "Check answers", href: `/progress/review/${first.attemptId}` });
    expect((await getChildToday(child, ctx())).action.kind).toBe("done_today");
  });

  it("shows the quick check for one answer with everything the parent needs, and no suggestion when nobody looked", async () => {
    const check = await getQuickCheck(parentA, first.attemptId, ctx());
    if (check?.state !== "check") throw new Error("expected a check");
    expect(check).toMatchObject({ position: first.wordProblem.position, marks: first.wordProblem.marks, childAnswer: "0.01", suggestion: null, progressText: "Last one to check", paperQuestionId: first.wordProblem.paperQuestionId });
    expect(check.choices).toEqual(Array.from({ length: first.wordProblem.marks + 1 }, (_, i) => i));
    expect(check.workingUrl).toBe(`/api/attempts/${first.attemptId}/working/${first.wordProblem.position}`);
    expect(check.scheme[0]).toMatch(/for the right answer/);
    expect(check.correctAnswer.length).toBeGreaterThan(0);
    expect(JSON.stringify(check).toLowerCase()).not.toMatch(/confidence|model|\bai\b/);
  });

  it("does not show another family's paper, and refuses their checks", async () => {
    expect(await getQuickCheck(parentB, first.attemptId, ctx())).toBeNull();
    expect(await getMarkingStatus({ parentProfileId: parentB }, first.attemptId, ctx())).toBeNull();
    expect(await getMarkingStatus({ childId: otherChild.childId }, first.attemptId, ctx())).toBeNull();
    await expect(saveMarkingReview(parentB, first.attemptId, { paperQuestionId: first.wordProblem.paperQuestionId, score: 1 }, ctx())).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveMarkingReview(parentA, "not-a-uuid", { paperQuestionId: first.wordProblem.paperQuestionId, score: 1 }, ctx())).rejects.toBeInstanceOf(NotFoundError);
    expect(await getQuickCheck(parentA, key(404), ctx())).toBeNull();
    expect(await db.select().from(markingReviews)).toHaveLength(0);
  });

  it("refuses a mark outside 0 to the marks, and a question that is not waiting", async () => {
    const marks = first.wordProblem.marks;
    for (const score of [-1, marks + 1, 1.5, Number.NaN]) {
      await expect(saveMarkingReview(parentA, first.attemptId, { paperQuestionId: first.wordProblem.paperQuestionId, score }, ctx())).rejects.toBeInstanceOf(InputError);
    }
    const settled = first.items.find((item) => item.paperQuestionId !== first.wordProblem.paperQuestionId)!;
    await expect(saveMarkingReview(parentA, first.attemptId, { paperQuestionId: settled.paperQuestionId, score: 0 }, ctx())).rejects.toBeInstanceOf(InputError);
    expect(await db.select().from(markingReviews)).toHaveLength(0);
  });

  it("a review updates the final score and the totals, keeps history, and makes the results ready", async () => {
    const marks = first.wordProblem.marks;
    const result = await saveMarkingReview(parentA, first.attemptId, { paperQuestionId: first.wordProblem.paperQuestionId, score: marks - 1 }, ctx(at(700)));
    expect(result).toEqual({ remaining: 0, resultsReady: true });

    const [attempt] = await db.select().from(attemptSessions).where(eq(attemptSessions.id, first.attemptId));
    expect(attempt).toMatchObject({ status: "marked", markingStage: "done" });
    expect(attempt?.markedAt?.toISOString()).toBe(at(700).toISOString());

    const [response] = await db.select().from(attemptResponses).where(eq(attemptResponses.paperQuestionId, first.wordProblem.paperQuestionId));
    const decisions = await db.select().from(markingDecisions).where(eq(markingDecisions.attemptResponseId, response!.id)).orderBy(asc(markingDecisions.seq));
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ method: "needs_review", reviewRequired: true, score: 0, finalScore: marks - 1 });

    const reviews = await db.select().from(markingReviews);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ reviewerId: parentA, score: marks - 1, maxScore: marks, markingDecisionId: decisions[0]!.id });

    // History is history: a review cannot be changed or removed, and a decision's own record cannot be rewritten.
    await expect(db.update(markingReviews).set({ score: 0 }).where(eq(markingReviews.id, reviews[0]!.id))).rejects.toThrow();
    await expect(db.delete(markingReviews).where(eq(markingReviews.id, reviews[0]!.id))).rejects.toThrow();
    await expect(db.update(markingDecisions).set({ reason: "changed" }).where(eq(markingDecisions.id, decisions[0]!.id))).rejects.toThrow();
    await expect(db.delete(markingDecisions).where(eq(markingDecisions.id, decisions[0]!.id))).rejects.toThrow();

    // The same answer cannot be checked twice.
    await expect(saveMarkingReview(parentA, first.attemptId, { paperQuestionId: first.wordProblem.paperQuestionId, score: 0 }, ctx())).rejects.toBeInstanceOf(InputError);
  });

  it("totals the marks that count, in the words a parent reads, and this is the first mock", async () => {
    const total = first.items.reduce((sum, item) => sum + item.marks, 0);
    const result = await getParentResult(parentA, first.attemptId, ctx());
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.maxScore).toBe(total);
    expect(result.score).toBe(total - 1);
    expect(result.scoreText).toBe(`${total - 1}/${total}`);
    expect(result.change).toEqual({ kind: "first", text: "First mock — this is your starting point" });
    expect(result.overTime).toBeNull();
    expect(result.mistakeCount).toBe(1);
    expect(result.topics.reduce((sum, topic) => sum + topic.marks, 0)).toBe(total - 1);
    expect(result.topics.reduce((sum, topic) => sum + topic.maxMarks, 0)).toBe(total);
    expect(result.attention.length).toBeGreaterThanOrEqual(1);
    expect(result.attention.length).toBeLessThanOrEqual(3);
    expect(result.nextAction.href).not.toBe("");
    expect(result.markedPaperHref).toBe(`/progress/results/${first.attemptId}/paper`);

    const words = JSON.stringify(result).toLowerCase();
    expect(words).not.toMatch(/confidence|predict|outcome|blueprint/);
    // Someone else's family sees nothing.
    expect(await getParentResult(parentB, first.attemptId, ctx())).toBeNull();
    expect(await getChildResult(otherChild.childId, first.attemptId, ctx())).toBeNull();
  });

  it("gives the child a warm result with no comparisons, and the marked paper puts the mistake first", async () => {
    const result = await getChildResult(child.childId, first.attemptId, ctx());
    expect(result).toMatchObject({ mistakeCount: 1, reviewHref: `/results/${first.attemptId}/paper` });
    expect(result?.headline).toMatch(/^(Fantastic work|Great effort)! Let's fix 1 mistake\.$/);
    expect(result?.thingsToLearn).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/rank|average|other children|weak/i);

    const paper = await getMarkedPaper({ kind: "child", childId: child.childId }, first.attemptId, ctx());
    expect(paper?.entries[0]).toMatchObject({ position: first.wordProblem.position, mistake: true, answerLine: "0.01" });
    expect(paper?.entries[0]?.markText).toMatch(/^✗ \d\/\d$/);
    expect(paper?.entries[0]?.workedSolution.length).toBeGreaterThan(0);
    expect(paper?.entries[0]?.workingUrl).toBe(`/api/attempts/${first.attemptId}/working/${first.wordProblem.position}`);
    expect(paper?.entries[0]?.parentNote).toBeNull();
    expect(paper?.entries.slice(1).every((entry) => !entry.mistake && entry.markText.startsWith("✓"))).toBe(true);
    expect(paper?.entries.filter((entry) => entry.mistake)).toHaveLength(1);
    expect(await getMarkedPaper({ kind: "child", childId: otherChild.childId }, first.attemptId, ctx())).toBeNull();
    expect(await getMarkedPaper({ kind: "parent", parentProfileId: parentB }, first.attemptId, ctx())).toBeNull();
  });

  it("moves Home and Today through the new states, one action at a time", async () => {
    let home = await getParentHome(parentA, ctx());
    expect(home.action).toMatchObject({ kind: "review_result", ctaLabel: "See what needs work", href: `/progress/results/${first.attemptId}` });
    let today = await getChildToday(child, ctx());
    expect(today.action).toMatchObject({ kind: "see_results", href: `/results/${first.attemptId}` });

    await markResultSeenByParent(parentA, first.attemptId, ctx());
    await markResultSeenByChild(child.childId, first.attemptId, ctx());
    home = await getParentHome(parentA, ctx());
    expect(home.action).toMatchObject({ kind: "review_mistakes", href: `/progress/results/${first.attemptId}#mistakes` });
    today = await getChildToday(child, ctx());
    expect(today.action).toMatchObject({ kind: "fix_mistakes", title: "Let's fix 1 mistake", ctaLabel: "Review mistakes", href: `/results/${first.attemptId}` });

    // Someone else's account changes nothing here.
    await markMistakesReviewed({ parentProfileId: parentB }, first.attemptId, ctx());
    expect((await getChildToday(child, ctx())).action.kind).toBe("fix_mistakes");
    await markMistakesReviewed({ childId: child.childId }, first.attemptId, ctx());
    expect((await getChildToday(child, ctx())).action.kind).not.toBe("fix_mistakes");
    expect((await getParentHome(parentA, ctx())).action.kind).not.toBe("review_mistakes");
  });

  it("lists recent results for each of them", async () => {
    const parents = await listRecentResults({ kind: "parent", parentProfileId: parentA }, 5, ctx());
    expect(parents).toHaveLength(1);
    expect(parents[0]).toMatchObject({ attemptId: first.attemptId, href: `/progress/results/${first.attemptId}` });
    expect(await listRecentResults({ kind: "parent", parentProfileId: parentB }, 5, ctx())).toEqual([]);
    expect((await listRecentResults({ kind: "child", childId: child.childId }, 5, ctx()))[0]?.href).toBe(`/results/${first.attemptId}`);
  });

  describe("AI-assisted marking", () => {
    it("settles a clear, high-confidence proposal, keeps the rule-based decision, and records the prompt version", async () => {
      const { ai, calls } = markerAI((input) => ({ proposedScore: input.marks - 1, maxScore: input.marks, confidence: "high", reason: "Right method, one slip at the end.", errorType: "calculation", reviewRequired: false }));
      const jobs = jobsWith(ai);
      const second = await play(2, { wrong: "word_problem", jobs });
      expect(second.submitted.markingJobId).toBeDefined();
      expect(await getMarkingStatus({ parentProfileId: parentA }, second.attemptId, ctx())).toMatchObject({ state: "marking" });
      expect((await getParentHome(parentA, ctx())).action).toMatchObject({ kind: "marking_in_progress", href: `/progress/results/${second.attemptId}` });

      await jobs.run(second.submitted.markingJobId as string);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ marks: second.wordProblem.marks, childAnswer: "0.01" });
      expect(calls[0]?.working?.mime).toBe("image/png");
      expect(JSON.stringify(calls[0])).not.toContain("Darius");

      const [attempt] = await db.select().from(attemptSessions).where(eq(attemptSessions.id, second.attemptId));
      expect(attempt).toMatchObject({ status: "marked", markingStage: "done" });

      const [response] = await db.select().from(attemptResponses).where(eq(attemptResponses.paperQuestionId, second.wordProblem.paperQuestionId));
      const history = await db.select().from(markingDecisions).where(eq(markingDecisions.attemptResponseId, response!.id)).orderBy(asc(markingDecisions.seq));
      expect(history.map((row) => row.method)).toEqual(["needs_review", "ai_assisted"]);
      expect(history[0]).toMatchObject({ reviewRequired: true, finalScore: null, promptVersion: null });
      expect(history[1]).toMatchObject({ confidence: "high", reviewRequired: false, score: second.wordProblem.marks - 1, finalScore: second.wordProblem.marks - 1, errorType: "calculation", promptVersion: expect.stringMatching(/^\d{4}-\d{2}-\d{2}\.\d+$/) });

      // The change from Mock 1: the same score, because Mock 1 lost the same single mark.
      const result = await getParentResult(parentA, second.attemptId, ctx());
      expect(result?.change).toEqual({ kind: "same", text: "The same as Mock 1" });

      // The parent sees the marker's one sentence beside the mark; the child does not.
      const parentPaper = await getMarkedPaper({ kind: "parent", parentProfileId: parentA }, second.attemptId, ctx());
      expect(parentPaper?.entries[0]?.parentNote).toBe("Right method, one slip at the end.");
      // Only the marker's specific note, not the general sentence as well (it would say the same thing twice).
      expect(parentPaper?.entries[0]?.explanation).toBeNull();
      const childPaper = await getMarkedPaper({ kind: "child", childId: child.childId }, second.attemptId, ctx());
      expect(childPaper?.entries[0]?.parentNote).toBeNull();
      expect(childPaper?.entries[0]?.explanation).toMatch(/slip in the calculation/);
      expect(JSON.stringify(childPaper)).not.toMatch(/Right method, one slip at the end\./);
    });

    it("leaves a low-confidence proposal for the parent, with the proposal and its reason shown as a suggestion", async () => {
      const { ai } = markerAI((input) => ({ proposedScore: 1, maxScore: input.marks, confidence: "low", reason: "The method is hard to follow.", reviewRequired: true }));
      const jobs = jobsWith(ai);
      const third = await play(3, { wrong: "word_problem", jobs });
      await jobs.run(third.submitted.markingJobId as string);

      const status = await getMarkingStatus({ parentProfileId: parentA }, third.attemptId, ctx());
      expect(status).toMatchObject({ state: "needs_check", waitingCount: 1 });
      const check = await getQuickCheck(parentA, third.attemptId, ctx());
      if (check?.state !== "check") throw new Error("expected a check");
      expect(check.suggestion).toEqual({ score: 1, reason: "The method is hard to follow." });
      expect((await getParentHome(parentA, ctx())).action).toMatchObject({ kind: "review_marking", href: `/progress/review/${third.attemptId}` });

      // The decision in force is the marker's proposal, and the rule-based one is kept under it.
      const [response] = await db.select().from(attemptResponses).where(eq(attemptResponses.paperQuestionId, third.wordProblem.paperQuestionId));
      const history = await db.select().from(markingDecisions).where(eq(markingDecisions.attemptResponseId, response!.id)).orderBy(asc(markingDecisions.seq));
      expect(history.map((row) => [row.method, row.reviewRequired, row.finalScore])).toEqual([["needs_review", true, null], ["ai_assisted", true, null]]);

      const done = await saveMarkingReview(parentA, third.attemptId, { paperQuestionId: third.wordProblem.paperQuestionId, score: 1 }, ctx(at(900)));
      expect(done).toEqual({ remaining: 0, resultsReady: true });
      const [finalRow] = await db.select().from(markingDecisions).where(eq(markingDecisions.id, history[1]!.id));
      expect(finalRow?.finalScore).toBe(1);
    });

    it("leaves the answer for the parent when the AI service is off, and never loses it", async () => {
      const jobs = jobsWith(createAIService({ adapter: createDisabledAdapter() }));
      const fourth = await play(4, { wrong: "word_problem", jobs });
      await jobs.run(fourth.submitted.markingJobId as string);
      expect(await getMarkingStatus({ parentProfileId: parentA }, fourth.attemptId, ctx())).toMatchObject({ state: "needs_check", waitingCount: 1 });
      const check = await getQuickCheck(parentA, fourth.attemptId, ctx());
      expect(check).toMatchObject({ state: "check", suggestion: null });
    });

    it("does not trust a proposal for the wrong total, and asks the parent instead", async () => {
      const { ai } = markerAI(() => ({ proposedScore: 1, maxScore: 99, confidence: "high", reason: "Looks fine.", reviewRequired: false }));
      const jobs = jobsWith(ai);
      const fifth = await play(5, { wrong: "word_problem", jobs });
      await jobs.run(fifth.submitted.markingJobId as string);
      expect(await getMarkingStatus({ parentProfileId: parentA }, fifth.attemptId, ctx())).toMatchObject({ state: "needs_check" });
    });

    it("only asks the marker about answers that have handwriting and that rules could not settle", async () => {
      const { ai, calls } = markerAI((input) => ({ proposedScore: 0, maxScore: input.marks, confidence: "high", reason: "No working.", reviewRequired: false }));
      const jobs = jobsWith(ai);
      // A wrong short answer with no working is settled by rule at once: nothing is left for anyone.
      const sixth = await play(6, { wrong: "short", jobs });
      expect(sixth.submitted).toMatchObject({ reviewCount: 0 });
      expect(sixth.submitted.markingJobId).toBeUndefined();
      expect(calls).toHaveLength(0);
      const [attempt] = await db.select().from(attemptSessions).where(eq(attemptSessions.id, sixth.attemptId));
      expect(attempt).toMatchObject({ status: "marked", markingStage: "done" });
      expect(attempt?.markedAt).not.toBeNull();
      const result = await getParentResult(parentA, sixth.attemptId, ctx());
      expect(result?.mistakeCount).toBe(1);
    });
  });
});
