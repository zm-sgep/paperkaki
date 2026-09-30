import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { MARK_ATTEMPT_JOB, processAttemptMarking } from "@/application/attempt-marking";
import { createChild } from "@/application/commands/children";
import { retryMarking, saveMarkingReview } from "@/application/commands/marking-review";
import { generateMock } from "@/application/commands/papers";
import { addUploadPage, movePage, removeUploadPage, reorderPages, submitPrintUpload } from "@/application/commands/print-upload";
import { assignMockToChild } from "@/application/commands/attempts";
import { InputError, NotFoundError } from "@/application/errors";
import { getAttemptWorkingImage } from "@/application/queries/attempts";
import { getMockPage } from "@/application/queries/papers";
import { getUploadPageFile, getUploadScreen } from "@/application/queries/print-upload";
import { getMarkingStatus, getParentResult, getQuickCheck } from "@/application/queries/results";
import type { Database } from "@/repositories/postgres/client";
import { listAttemptPaperQuestions } from "@/repositories/postgres/attempts";
import { attemptResponses, attemptSessions, markingDecisions, printUploadPages, type PrintUploadPageRow } from "@/repositories/postgres/schema";
import { AnswerSchema } from "@/schemas/question-content";
import { createDisabledAdapter } from "@/services/ai/disabled-adapter";
import { createFixtureAdapter } from "@/services/ai/fixture-adapter";
import { encodeFixturePage, type FixturePage } from "@/services/ai/fixture-pages";
import { createAIService } from "@/services/ai/gateway";
import type { AIService } from "@/services/ai/types";
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

describe("photographed paper: upload, order, read, mark (M7)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let storage: MemoryStorage;
  let parentA: string;
  let parentB: string;
  let paperId: string;
  let assessmentId: string;
  let fixtureAI: AIService;
  let items: Awaited<ReturnType<typeof listAttemptPaperQuestions>>;

  const ctx = (now: Date = NOW, ai?: AIService) => ({ db, now, storage, logger: silentLogger, ...(ai ? { ai } : {}) });

  function jobsWith(ai: AIService): JobService {
    const jobs = createJobService({ db, now: () => at(2000) });
    jobs.register(MARK_ATTEMPT_JOB, async (payload) => {
      await processAttemptMarking(String(payload.attemptId), { db, ai, storage, now: at(2000) });
    });
    return jobs;
  }

  /** What the child wrote for every question: the right answer, except where the test says otherwise. */
  function answersOf(overrides: Record<number, { answerText: string; confident?: boolean; hasWorking?: boolean }>): Record<string, { answerText: string; confident?: boolean; hasWorking?: boolean }> {
    const out: Record<string, { answerText: string; confident?: boolean; hasWorking?: boolean }> = {};
    for (const item of items) {
      const answer = AnswerSchema.parse(item.question.answer);
      const text = answer.kind === "mcq" ? answer.correct : answer.kind === "text" ? answer.accepted[0]! : answer.value;
      out[String(item.position)] = overrides[item.position] ?? { answerText: text };
    }
    return out;
  }

  const page = (fixture: FixturePage, options?: Parameters<typeof encodeFixturePage>[1]) => encodeFixturePage(fixture, options);

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    storage = createMemoryStorage();
    await seedRealBank(db);
    parentA = (await insertParentProfile(db, "A")).id;
    parentB = (await insertParentProfile(db, "B")).id;
    const made = await confirmedAssessment(db, parentA, BANK_TOPICS.map((topic) => topic.label), { nickname: "Darius", type: "end_of_year" });
    assessmentId = made.assessmentId;
    await createChild(parentB, { nickname: "Test Child B" }, { db, now: NOW });
    paperId = (await generateMock(parentA, assessmentId, key(1), ctx())).paperId;
    items = await listAttemptPaperQuestions(db, paperId);
    fixtureAI = createAIService({ adapter: createFixtureAdapter({ dir: await mkdtemp(path.join(os.tmpdir(), "pk-print-")) }) });
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("stores each page privately, flags only a page with a problem, and orders pages by their footer number", async () => {
    const wordProblem = items.find((item) => item.marks >= 3 && item.question.questionType !== "mcq")!;
    const wrongText = "0.01";
    const answers = answersOf({
      1: { answerText: "B or C", confident: false },
      [wordProblem.position]: { answerText: wrongText, hasWorking: true },
    });
    // The pages are added out of order: the footers say 2, then 1.
    const second = await addUploadPage(parentA, paperId, { bytes: page({ page: 2, answers }), sharpness: 300 }, ctx(NOW, fixtureAI));
    const first = await addUploadPage(parentA, paperId, { bytes: page({ page: 1 }), sharpness: 250 }, ctx(NOW, fixtureAI));
    expect(second.problem).toBeNull();
    expect(first.problem).toBeNull();

    const rows = await db.select().from(printUploadPages).orderBy(asc(printUploadPages.position));
    expect(rows.map((row) => [row.id, row.detectedPage])).toEqual([[first.pageId, 1], [second.pageId, 2]]);
    expect(rows[0]).toMatchObject({ bucket: "submission-uploads", mime: "image/png", attemptId: null, parentProfileId: parentA, paperId });
    expect(rows[0]?.objectKey).toMatch(/^parents\/[0-9a-f-]{36}\/papers\/[0-9a-f-]{36}\/pages\/[0-9a-f-]{36}\.png$/);
    expect(rows[0]?.objectKey).not.toMatch(/^[a-z]+:\/\//);
    expect((await storage.get({ bucket: "submission-uploads", key: rows[0]!.objectKey }))?.contentType).toBe("image/png");

    // A blurry page, one on its side and one too small are flagged; a good page is not mentioned.
    const blurry = await addUploadPage(parentA, paperId, { bytes: page({}, {}), sharpness: 1 }, ctx(NOW, fixtureAI));
    const sideways = await addUploadPage(parentA, paperId, { bytes: page({}, { width: 850, height: 600 }), sharpness: 300 }, ctx(NOW, fixtureAI));
    const tiny = await addUploadPage(parentA, paperId, { bytes: page({}, { width: 300, height: 400 }), sharpness: 300 }, ctx(NOW, fixtureAI));
    expect([blurry.problem, sideways.problem, tiny.problem]).toEqual(["blurry", "rotated", "small"]);

    const screen = await getUploadScreen(parentA, assessmentId, paperId, ctx());
    expect(screen?.pages.map((p) => [p.label, p.problem?.kind ?? null])).toEqual([["Page 1", null], ["Page 2", null], ["Page 3", "blurry"], ["Page 4", "rotated"], ["Page 5", "small"]]);
    expect(screen?.pages[2]?.problem?.text).toBe("Page 3 looks blurry. Retake it, holding the camera still.");
    expect(screen?.expectedPages).toBeGreaterThan(1);
    expect(screen?.countNote).toMatch(/^The paper has \d+ pages and you have added 5\./);
    // Someone else's paper has no upload screen, no page files, and no way in.
    expect(await getUploadScreen(parentB, assessmentId, paperId, ctx())).toBeNull();
    expect(await getUploadPageFile(parentB, first.pageId, ctx())).toBeNull();
    expect((await getUploadPageFile(parentA, first.pageId, ctx()))?.contentType).toBe("image/png");
    await expect(addUploadPage(parentB, paperId, { bytes: page({ page: 1 }) }, ctx())).rejects.toBeInstanceOf(NotFoundError);
    await expect(removeUploadPage(parentB, paperId, first.pageId, ctx())).rejects.toBeInstanceOf(NotFoundError);
    await expect(movePage(parentB, paperId, first.pageId, "later", ctx())).rejects.toBeInstanceOf(NotFoundError);
    await expect(submitPrintUpload(parentB, paperId, jobsWith(fixtureAI), ctx())).rejects.toBeInstanceOf(NotFoundError);

    // Retake the three problem pages: remove them, and the order closes up.
    for (const id of [blurry.pageId, sideways.pageId, tiny.pageId]) await removeUploadPage(parentA, paperId, id, ctx());
    expect(await storage.get({ bucket: "submission-uploads", key: (await db.select().from(printUploadPages).where(eq(printUploadPages.id, blurry.pageId)))[0]?.objectKey ?? "none" })).toBeNull();
    const after = await getUploadScreen(parentA, assessmentId, paperId, ctx());
    expect(after?.pages.map((p) => p.label)).toEqual(["Page 1", "Page 2"]);
  });

  it("lets the parent move pages, and refuses a list that is not exactly the pages", async () => {
    const [a, b] = (await getUploadScreen(parentA, assessmentId, paperId, ctx()))!.pages;
    await movePage(parentA, paperId, a!.id, "later", ctx());
    expect((await getUploadScreen(parentA, assessmentId, paperId, ctx()))!.pages.map((p) => p.id)).toEqual([b!.id, a!.id]);
    await reorderPages(parentA, paperId, [a!.id, b!.id], ctx());
    expect((await getUploadScreen(parentA, assessmentId, paperId, ctx()))!.pages.map((p) => p.id)).toEqual([a!.id, b!.id]);
    await expect(reorderPages(parentA, paperId, [a!.id], ctx())).rejects.toBeInstanceOf(InputError);
    await expect(reorderPages(parentA, paperId, [a!.id, a!.id], ctx())).rejects.toBeInstanceOf(InputError);
  });

  it("refuses what cannot be read, without keeping it", async () => {
    const before = (await db.select().from(printUploadPages)).length;
    await expect(addUploadPage(parentA, paperId, { bytes: new Uint8Array([1, 2, 3, 4]) }, ctx())).rejects.toBeInstanceOf(InputError);
    await expect(addUploadPage(parentA, paperId, { bytes: new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]) }, ctx())).rejects.toMatchObject({ fieldErrors: { file: expect.stringMatching(/JPEG or PNG/) } });
    await expect(addUploadPage(parentA, paperId, { bytes: new Uint8Array() }, ctx())).rejects.toBeInstanceOf(InputError);
    expect((await db.select().from(printUploadPages)).length).toBe(before);
  });

  let attemptId: string;
  let wordProblemPosition: number;

  it("submits for marking: an attempt with mode print_upload, the pages fixed to it, and progress that says where it is", async () => {
    await expect(submitPrintUpload(parentA, paperId, jobsWith(fixtureAI), ctx(at(100), fixtureAI))).resolves.toBeDefined();
    const [attempt] = await db.select().from(attemptSessions).where(eq(attemptSessions.paperId, paperId));
    attemptId = attempt!.id;
    expect(attempt).toMatchObject({ mode: "print_upload", status: "submitted", markingStage: "reading", createdBy: parentA, elapsedSeconds: 0, overTimeSeconds: 0 });
    const pages = await db.select().from(printUploadPages).where(eq(printUploadPages.attemptId, attemptId));
    expect(pages).toHaveLength(2);
    expect(await db.select().from(printUploadPages).where(eq(printUploadPages.paperId, paperId))).toHaveLength(2);

    const status = await getMarkingStatus({ parentProfileId: parentA }, attemptId, ctx());
    expect(status).toMatchObject({ state: "marking", mode: "print_upload" });
    if (status?.state === "marking") {
      expect(status.steps.map((s) => [s.label, s.state])).toEqual([["Uploading paper", "done"], ["Reading answers", "active"], ["Marking questions", "waiting"], ["Preparing results", "waiting"]]);
    }
    // Nothing more to submit: the draft is empty.
    await expect(submitPrintUpload(parentA, paperId, jobsWith(fixtureAI), ctx())).rejects.toBeInstanceOf(InputError);
    // The mock page now says it was uploaded and points at the results.
    const mockPage = await getMockPage(parentA, assessmentId, paperId, ctx());
    expect(mockPage?.upload.attempt).toMatchObject({ href: `/progress/results/${attemptId}` });
    expect(mockPage?.ipad).toBeNull();
  });

  it("when the reader is off, the pages stay safe and Try again starts reading over", async () => {
    const off = createAIService({ adapter: createDisabledAdapter() });
    const jobs = jobsWith(off);
    const job = await jobs.enqueue(MARK_ATTEMPT_JOB, { attemptId });
    await jobs.run(job.id);
    const status = await getMarkingStatus({ parentProfileId: parentA }, attemptId, ctx());
    expect(status).toMatchObject({ state: "failed" });
    expect(await db.select().from(printUploadPages).where(eq(printUploadPages.attemptId, attemptId))).toHaveLength(2);
    expect(await db.select().from(attemptResponses).where(eq(attemptResponses.attemptId, attemptId))).toHaveLength(0);

    await expect(retryMarking(parentB, attemptId, jobs, ctx())).rejects.toBeInstanceOf(NotFoundError);
    const retryJob = await retryMarking(parentA, attemptId, jobs, ctx());
    expect(retryJob).not.toBeNull();
    expect(await retryMarking(parentA, attemptId, jobs, ctx())).toBeNull();
    const [attempt] = await db.select().from(attemptSessions).where(eq(attemptSessions.id, attemptId));
    expect(attempt?.markingStage).toBe("reading");
  });

  it("reads the answers from the pages, marks by rule, and sends the unclear ones to a quick check", async () => {
    const jobs = jobsWith(fixtureAI);
    const job = await jobs.enqueue(MARK_ATTEMPT_JOB, { attemptId });
    const ran = await jobs.run(job.id);
    expect(ran?.errorCode).toBeNull();

    const responses = await db.select().from(attemptResponses).where(eq(attemptResponses.attemptId, attemptId));
    expect(responses).toHaveLength(items.length);
    expect(responses.every((row) => row.handwritingBucket === "submission-uploads" && row.handwritingKey?.includes("/pages/"))).toBe(true);

    const decisions = await db
      .select({ decision: markingDecisions, paperQuestionId: attemptResponses.paperQuestionId })
      .from(markingDecisions)
      .innerJoin(attemptResponses, eq(attemptResponses.id, markingDecisions.attemptResponseId))
      .where(eq(attemptResponses.attemptId, attemptId));
    const byPosition = new Map(items.map((item) => [item.position, decisions.find((row) => row.paperQuestionId === item.paperQuestionId)!.decision]));

    // Right answers are marked by rule; the unclear one and the wrong word problem with working wait for a person.
    expect(byPosition.get(2)).toMatchObject({ method: "deterministic", reviewRequired: false });
    expect(byPosition.get(1)).toMatchObject({ method: "needs_review", reviewRequired: true, finalScore: null });
    const wordProblem = items.find((item) => item.marks >= 3 && item.question.questionType !== "mcq")!;
    wordProblemPosition = wordProblem.position;
    expect(byPosition.get(wordProblem.position)).toMatchObject({ method: "needs_review", reviewRequired: true });

    const [attempt] = await db.select().from(attemptSessions).where(eq(attemptSessions.id, attemptId));
    expect(attempt).toMatchObject({ status: "submitted", markingStage: "done" });
    const status = await getMarkingStatus({ parentProfileId: parentA }, attemptId, ctx());
    expect(status).toMatchObject({ state: "needs_check", waitingCount: 2 });
    expect(await getParentResult(parentA, attemptId, ctx())).toBeNull();
  });

  it("shows the parent the page the answer is on, and the check completes the results", async () => {
    let check = await getQuickCheck(parentA, attemptId, ctx());
    if (check?.state !== "check") throw new Error("expected a check");
    expect(check.position).toBe(1);
    expect(check.childAnswer).toBe("B or C");
    expect(check.workingUrl).toBe(`/api/attempts/${attemptId}/working/1`);
    const image = await getAttemptWorkingImage({ parentProfileId: parentA }, attemptId, 1, ctx());
    expect(image?.contentType).toBe("image/png");
    expect(await getAttemptWorkingImage({ parentProfileId: parentB }, attemptId, 1, ctx())).toBeNull();

    await saveMarkingReview(parentA, attemptId, { paperQuestionId: check.paperQuestionId, score: check.marks }, ctx(at(3000)));
    check = await getQuickCheck(parentA, attemptId, ctx());
    if (check?.state !== "check") throw new Error("expected a second check");
    expect(check.position).toBe(wordProblemPosition);
    expect(check.suggestion).toBeNull();
    const done = await saveMarkingReview(parentA, attemptId, { paperQuestionId: check.paperQuestionId, score: 0 }, ctx(at(3001)));
    expect(done).toEqual({ remaining: 0, resultsReady: true });

    const result = await getParentResult(parentA, attemptId, ctx());
    const total = items.reduce((sum, item) => sum + item.marks, 0);
    // Every other question was answered right; the parent gave question 1 full marks and the word problem none.
    expect(result?.score).toBe(total - wordProblemMarks());
    expect(result?.maxScore).toBe(total);
    expect(result?.overTime).toBeNull();
    expect(result?.change.kind).toBe("first");
  });

  function wordProblemMarks(): number {
    return items.find((item) => item.position === wordProblemPosition)!.marks;
  }

  it("does not offer the printed paper again while the mock is on the iPad", async () => {
    const second = await generateMock(parentA, assessmentId, key(2), ctx());
    await assignMockToChild(parentA, second.paperId, ctx());
    await addUploadPage(parentA, second.paperId, { bytes: page({ page: 1 }), sharpness: 300 }, ctx(NOW, fixtureAI));
    await expect(submitPrintUpload(parentA, second.paperId, jobsWith(fixtureAI), ctx())).rejects.toMatchObject({ fieldErrors: { form: expect.stringMatching(/on the iPad/) } });
    const screen = await getUploadScreen(parentA, assessmentId, second.paperId, ctx());
    expect(screen?.blocked).toMatch(/on the iPad/);
  });

  it("reads only the pages that belong to the attempt, in the order they were fixed", async () => {
    const rows: PrintUploadPageRow[] = await db.select().from(printUploadPages).where(eq(printUploadPages.attemptId, attemptId)).orderBy(asc(printUploadPages.position));
    expect(rows.map((row) => row.detectedPage)).toEqual([1, 2]);
    // Once attached, a page can no longer be removed.
    await expect(removeUploadPage(parentA, paperId, rows[0]!.id, ctx())).rejects.toBeInstanceOf(NotFoundError);
  });
});
