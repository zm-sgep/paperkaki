import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { createAssessment } from "@/application/commands/assessments";
import { selectChild } from "@/application/commands/children";
import { generateMock, MockGenerationError, paperFileKeys } from "@/application/commands/papers";
import { buildAssessmentPlan } from "@/application/assessment-plan";
import { sameQuestionSet, selectQuestions } from "@/domain/papers";
import { getOwnedAssessment } from "@/repositories/postgres/assessments";
import { InputError, NotFoundError } from "@/application/errors";
import { getAssessmentSetup, getPrepareOverview } from "@/application/queries/assessment-setup";
import { getMockDownloadUrl, getMockPage } from "@/application/queries/papers";
import { getParentHome } from "@/application/queries/parent-home";
import { extractPdfText } from "../helpers/pdf-text";
import type { Database } from "@/repositories/postgres/client";
import { auditLogs, paperQuestions, papers } from "@/repositories/postgres/schema";
import { insertParentProfile } from "../factories";
import { confirmedAssessment, NOW } from "../helpers/assessment-fixtures";
import { createMemoryStorage, type MemoryStorage } from "../helpers/memory-storage";
import { seedRealBank } from "../helpers/seed-bank";
import { silentLogger } from "../helpers/silent-logger";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

const key = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("mock generation command (M4-06)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let storage: MemoryStorage;
  let parentA: string;
  let parentB: string;
  let assessmentId: string;

  const context = () => ({ db, now: NOW, storage, logger: silentLogger });
  const decode = (bytes: Uint8Array) => Buffer.from(bytes);

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    storage = createMemoryStorage();
    await seedRealBank(db);
    parentA = (await insertParentProfile(db, "A")).id;
    parentB = (await insertParentProfile(db, "B")).id;
    ({ assessmentId } = await confirmedAssessment(db, parentA, ["Fractions", "Whole numbers", "Adding and subtracting"]));
  });

  afterAll(async () => {
    await testDb.close();
  });

  const questionIdsOf = async (paperId: string) =>
    (await db.select().from(paperQuestions).where(eq(paperQuestions.paperId, paperId)).orderBy(asc(paperQuestions.position))).map((r) => r.questionId);

  it("creates Mock 1: a frozen paper with numbered questions, both PDFs stored privately by key", async () => {
    const result = await generateMock(parentA, assessmentId, key(1), context());
    expect(result).toMatchObject({ assessmentId, number: 1, created: true });

    const [paper] = await db.select().from(papers).where(eq(papers.id, result.paperId));
    expect(paper).toMatchObject({ number: 1, status: "generated", seed: `${assessmentId}:1`, requestKey: key(1), createdBy: parentA });
    const keys = paperFileKeys(parentA, assessmentId, 1);
    expect(keys).toEqual({
      student: `parents/${parentA}/assessments/${assessmentId}/mock-1-student.pdf`,
      answers: `parents/${parentA}/assessments/${assessmentId}/mock-1-answers.pdf`,
    });
    expect(paper).toMatchObject({
      studentPdfBucket: "paper-pdfs",
      studentPdfKey: keys.student,
      answerPdfBucket: "paper-pdfs",
      answerPdfKey: keys.answers,
    });
    // Keys, never links.
    expect(`${paper!.studentPdfKey}${paper!.answerPdfKey}`).not.toMatch(/https?:|\/api\/files|sig=/);

    const rows = await db.select().from(paperQuestions).where(eq(paperQuestions.paperId, paper!.id)).orderBy(asc(paperQuestions.position));
    expect(rows.map((r) => r.position)).toEqual(rows.map((_, i) => i + 1));
    expect(rows.reduce((total, r) => total + r.marks, 0)).toBe(40);
    // Section A (multiple choice) comes before section B.
    expect(rows.map((r) => r.sectionCode).join("")).toMatch(/^A+B+$/);

    expect(paper!.selectionReport).toMatchObject({ totalMarks: 40, questionCount: rows.length, blueprintVersion: 1 });

    const student = storage.objects.get(`paper-pdfs/${keys.student}`);
    const answers = storage.objects.get(`paper-pdfs/${keys.answers}`);
    expect(student?.contentType).toBe("application/pdf");
    expect(decode(student!.body).subarray(0, 4).toString()).toBe("%PDF");
    const studentText = (await extractPdfText(student!.body)).text;
    const answerText = (await extractPdfText(answers!.body)).text;
    expect(studentText).toContain("Mock 1");
    expect(studentText).toContain("Total: 40 marks");
    expect(studentText).toContain("Mathematics WA2 · Mock 1");
    expect(studentText).not.toContain("Answer pack");
    expect(studentText).not.toContain("Worked solution");
    expect(answerText).toContain("Answer pack");
    expect(answerText).toContain("Worked solution");
    expect(answerText).not.toMatch(/P3-/);
  });

  it("records who generated it, without personal content", async () => {
    const [event] = await db.select().from(auditLogs).where(eq(auditLogs.action, "paper.generated"));
    expect(event).toMatchObject({ entityType: "paper", actorProfileId: parentA });
    expect(event?.metadata).toMatchObject({ assessmentId, number: 1, totalMarks: 40 });
    expect(JSON.stringify(event?.metadata)).not.toMatch(/Test Child|nickname|answer/i);
  });

  it("is idempotent for a request key: the same key returns the same paper and stores nothing new", async () => {
    const first = (await db.select().from(papers).where(eq(papers.assessmentId, assessmentId)))[0]!;
    const objectsBefore = storage.objects.size;
    const again = await generateMock(parentA, assessmentId, key(1), context());
    expect(again).toMatchObject({ paperId: first.id, number: 1, created: false });
    expect(await db.select().from(papers).where(eq(papers.assessmentId, assessmentId))).toHaveLength(1);
    expect(storage.objects.size).toBe(objectsBefore);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, "paper.generated"))).toHaveLength(1);
  });

  it("two requests with the same new key at the same time make one paper", async () => {
    const [a, b] = await Promise.all([
      generateMock(parentA, assessmentId, key(50), context()),
      generateMock(parentA, assessmentId, key(50), context()),
    ]);
    expect(a.paperId).toBe(b.paperId);
    expect(a.number).toBe(2);
    expect(await db.select().from(papers).where(eq(papers.assessmentId, assessmentId))).toHaveLength(2);
  });

  it("a new key makes the next mock with a different set that avoids earlier questions where it can", async () => {
    const result = await generateMock(parentA, assessmentId, key(2), context());
    expect(result.number).toBe(3);
    const rows = await db.select().from(papers).where(eq(papers.assessmentId, assessmentId)).orderBy(asc(papers.number));
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3]);
    expect(rows[2]!.seed).toBe(`${assessmentId}:3`);

    const [one, two, three] = await Promise.all(rows.map((r) => questionIdsOf(r.id)));
    expect(sameQuestionSet(one!, two!)).toBe(false);
    expect(sameQuestionSet(one!, three!)).toBe(false);
    expect(sameQuestionSet(two!, three!)).toBe(false);
    expect(new Set(three).size).toBe(three!.length);

    // Avoid list: Mock 2 repeats no more of Mock 1 than a paper made without the list would.
    const owned = (await getOwnedAssessment(db, parentA, assessmentId))!;
    const plan = await buildAssessmentPlan(db, owned);
    const control = selectQuestions({ blueprint: plan.blueprint, candidates: plan.candidates, seed: `${assessmentId}:2` });
    if (!control.ok) throw new Error("control selection failed");
    const repeatedWithout = control.selection.filter((q) => one!.includes(q.questionId)).length;
    const repeated = two!.filter((id) => one!.includes(id)).length;
    expect(repeated).toBeLessThanOrEqual(repeatedWithout);
    expect(rows[1]!.selectionReport).toMatchObject({ usedAvoided: repeated });
    expect(rows[2]!.selectionReport).toMatchObject({
      usedAvoided: three!.filter((id) => one!.includes(id) || two!.includes(id)).length,
      totalMarks: 40,
    });
  });

  it("papers stay frozen when the bank changes afterwards", async () => {
    const [first] = await db.select().from(papers).where(eq(papers.assessmentId, assessmentId)).orderBy(asc(papers.number));
    const before = await questionIdsOf(first!.id);
    const [middle] = (await db.select().from(paperQuestions).where(eq(paperQuestions.paperId, first!.id)).orderBy(asc(paperQuestions.position))).slice(2, 3);
    await db.execute(sql`UPDATE questions SET status = 'retired' WHERE id = ${middle!.questionId}`);
    expect(await questionIdsOf(first!.id)).toEqual(before);
    const next = await generateMock(parentA, assessmentId, key(3), context());
    expect(await questionIdsOf(next.paperId)).not.toContain(middle!.questionId);
  });

  it("only the owner can create, read or download; anyone else gets not found", async () => {
    await expect(generateMock(parentB, assessmentId, key(90), context())).rejects.toBeInstanceOf(NotFoundError);
    const [first] = await db.select().from(papers).where(eq(papers.assessmentId, assessmentId)).orderBy(asc(papers.number));
    expect(await getMockPage(parentB, assessmentId, first!.id, context())).toBeNull();
    expect(await getMockDownloadUrl({ parentProfileId: parentB, role: "parent" }, assessmentId, first!.id, "student", context())).toBeNull();
    // A paper id under the wrong assessment is also not found.
    const other = await confirmedAssessment(db, parentA, ["Fractions"], { nickname: "Test Child A2" });
    expect(await getMockPage(parentA, other.assessmentId, first!.id, context())).toBeNull();
    // A request key already used for someone else's assessment does not leak or duplicate.
    await expect(generateMock(parentA, other.assessmentId, key(1), context())).rejects.toBeInstanceOf(InputError);
    await expect(generateMock(parentA, assessmentId, "not-a-uuid", context())).rejects.toBeInstanceOf(InputError);
    expect(await db.select().from(papers).where(eq(papers.assessmentId, other.assessmentId))).toHaveLength(0);
  });

  it("the mock page and a five-minute download link come from the database row", async () => {
    const [first] = await db.select().from(papers).where(eq(papers.assessmentId, assessmentId)).orderBy(asc(papers.number));
    const page = await getMockPage(parentA, assessmentId, first!.id, context());
    expect(page).toMatchObject({
      heading: "Mock 1 is ready",
      contextLine: "Test Child A · Mathematics WA2 · Wed 14 Oct",
      tip: "Print on A4. Give Test Child A 45 minutes.",
      answerPackNote: "Keep this for yourself. It has the answers.",
    });
    expect(page?.summary).toBe("40 marks · 45 min · Sections A, B");
    expect(page?.topicsLine).toBe("Whole numbers to 10 000, Adding and subtracting bigger numbers, Fractions");
    expect(`${page?.heading}${page?.summary}${page?.topicsLine}${page?.tip}`).not.toMatch(/blueprint|outcome|P3-|%/i);
    const url = await getMockDownloadUrl({ parentProfileId: parentA, role: "parent" }, assessmentId, first!.id, "answers", context());
    expect(url).toContain(`/api/files/paper-pdfs/parents/${parentA}/assessments/${assessmentId}/mock-1-answers.pdf`);
    expect(url).toContain("exp=300");
  });

  it("Home and Prepare say Mock N is ready, and screen C lists the mocks newest first", async () => {
    const childId = (await getOwnedAssessment(db, parentA, assessmentId))!.childId;
    await selectChild(parentA, childId, context());
    const home = await getParentHome(parentA, context());
    expect(home.action).toMatchObject({ kind: "start_mock", ctaLabel: "Print mock" });
    const latest = (await db.select().from(papers).where(eq(papers.assessmentId, assessmentId)).orderBy(asc(papers.number))).at(-1)!;
    expect(home.action.title).toMatch(/^Mathematics WA2 · Mock \d+ is ready$/);
    expect(home.action.href).toBe(`/prepare/${assessmentId}/mocks/${latest.id}`);

    const setup = await getAssessmentSetup(parentA, assessmentId, context());
    expect(setup?.mocks.map((m) => m.number)).toEqual([...(setup?.mocks.map((m) => m.number) ?? [])].sort((a, b) => b - a));
    expect(setup?.mocks[0]).toMatchObject({ id: latest.id });
    // created_at is the database clock, so only the shape of the text is fixed.
    expect(setup?.mocks[0]?.createdText).toMatch(/^Created [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}( \d{4})?$/);

    const overview = await getPrepareOverview(parentA, childId, context());
    expect(overview.upcoming.find((c) => c.id === assessmentId)).toMatchObject({ actionLabel: "Print mock", actionHref: home.action.href });
  });

  it("if storing the files fails nothing is saved, and trying again with the same key works", async () => {
    const parent = (await insertParentProfile(db, "C")).id;
    const { assessmentId: id } = await confirmedAssessment(db, parent, ["Fractions", "Whole numbers"], { nickname: "Test Child C" });
    storage.failNextPut();
    const error = await generateMock(parent, id, key(70), context()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MockGenerationError);
    expect((error as MockGenerationError).code).toBe("storage_failed");
    expect((error as MockGenerationError).problems.join(" ")).toMatch(/Nothing was saved/);
    expect(await db.select().from(papers).where(eq(papers.assessmentId, id))).toHaveLength(0);
    expect(await db.select().from(paperQuestions).innerJoin(papers, eq(papers.id, paperQuestions.paperId)).where(eq(papers.assessmentId, id))).toHaveLength(0);

    const retry = await generateMock(parent, id, key(70), context());
    expect(retry).toMatchObject({ number: 1, created: true });
    expect(storage.objects.has(`paper-pdfs/${paperFileKeys(parent, id, 1).student}`)).toBe(true);
  });

  it("an assessment whose topics are not confirmed cannot make a mock", async () => {
    const draft = await createAssessment(parentA, { newChildNickname: "Test Child D", type: "wa1", date: "2026-10-20" }, context());
    const error = await generateMock(parentA, draft.id, key(80), context()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MockGenerationError);
    expect((error as MockGenerationError).code).toBe("not_ready");
  });
});
