import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { buildAssessmentPlan } from "@/application/assessment-plan";
import { setPaperSettings } from "@/application/commands/assessments";
import { generateMock, MockGenerationError } from "@/application/commands/papers";
import { hasBannedParentWording } from "@/domain/assessments";
import { selectQuestions } from "@/domain/papers";
import type { Database } from "@/repositories/postgres/client";
import { getOwnedAssessment } from "@/repositories/postgres/assessments";
import { papers, questions } from "@/repositories/postgres/schema";
import { insertParentProfile } from "../factories";
import { confirmedAssessment, NOW } from "../helpers/assessment-fixtures";
import { createMemoryStorage, type MemoryStorage } from "../helpers/memory-storage";
import { seedRealBank } from "../helpers/seed-bank";
import { silentLogger } from "../helpers/silent-logger";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

const key = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("mock generation refuses to build a bad paper (M4-03, M4-06)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let storage: MemoryStorage;
  let parent: string;

  const context = () => ({ db, now: NOW, storage, logger: silentLogger });
  const papersOf = async (assessmentId: string) => db.select().from(papers).where(eq(papers.assessmentId, assessmentId));
  /** Changes stored questions behind the immutability trigger, as data damage would. */
  async function damage(run: () => Promise<unknown>) {
    await db.execute(sql`ALTER TABLE questions DISABLE TRIGGER questions_guard_row`);
    try {
      await run();
    } finally {
      await db.execute(sql`ALTER TABLE questions ENABLE TRIGGER questions_guard_row`);
    }
  }
  const candidateIds = async (assessmentId: string) => {
    const plan = await buildAssessmentPlan(db, (await getOwnedAssessment(db, parent, assessmentId))!);
    return { plan, ids: plan.candidates.map((c) => c.questionId) };
  };

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    storage = createMemoryStorage();
    await seedRealBank(db);
    parent = (await insertParentProfile(db, "A")).id;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("a question whose answer no longer verifies stops the mock: no paper, no files, calm words", async () => {
    const { assessmentId } = await confirmedAssessment(db, parent, ["Money"], { nickname: "Test Child M" });
    const { ids } = await candidateIds(assessmentId);
    // Point every candidate's check at an expression that cannot hold.
    await damage(() => db.update(questions).set({ verification: { expression: "1/0" } }).where(inArray(questions.id, ids)));

    const error = await generateMock(parent, assessmentId, key(1), context()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MockGenerationError);
    const failure = error as MockGenerationError;
    expect(failure.code).toBe("validation_failed");
    expect(failure.problems.join(" ")).toMatch(/Nothing was saved/);
    for (const line of failure.problems) expect(hasBannedParentWording(line)).toBe(false);
    expect(await papersOf(assessmentId)).toHaveLength(0);
    expect([...storage.objects.keys()].filter((k) => k.includes(assessmentId))).toEqual([]);
  });

  it("a question with no usable answer stops the mock the same way", async () => {
    // Answers are re-read from the exact question versions at validation time.
    const { assessmentId } = await confirmedAssessment(db, parent, ["Angles"], { nickname: "Test Child N" });
    const { ids } = await candidateIds(assessmentId);
    await damage(() => db.update(questions).set({ answer: { kind: "text", accepted: [] } }).where(inArray(questions.id, ids)));
    const error = await generateMock(parent, assessmentId, key(2), context()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MockGenerationError);
    expect((error as MockGenerationError).code).toBe("validation_failed");
    expect(await papersOf(assessmentId)).toHaveLength(0);
  });

  it("when the bank has nothing for the chosen topics, the parent is told what to change and nothing is created", async () => {
    const { assessmentId } = await confirmedAssessment(db, parent, ["Time"], { nickname: "Test Child T" });
    const { ids } = await candidateIds(assessmentId);
    await damage(() => db.update(questions).set({ status: "retired" }).where(inArray(questions.id, ids)));
    const error = await generateMock(parent, assessmentId, key(3), context()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MockGenerationError);
    expect((error as MockGenerationError).code).toBe("blocked");
    expect((error as MockGenerationError).problems.join(" ")).toMatch(/don't have questions/);
    expect(await papersOf(assessmentId)).toHaveLength(0);
  });

  it("settings the bank cannot meet are reported in plain words, with no paper", async () => {
    const { assessmentId } = await confirmedAssessment(db, parent, ["Parallel"], { nickname: "Test Child P" });
    // Parallel and perpendicular lines hold 19 marks in the whole bank: 60 marks cannot be met.
    await setPaperSettings(parent, assessmentId, { totalMarks: 60, durationMinutes: 60, difficulty: "balanced" }, context());
    const error = await generateMock(parent, assessmentId, key(4), context()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MockGenerationError);
    expect((error as MockGenerationError).code).toBe("blocked");
    for (const line of (error as MockGenerationError).problems) expect(hasBannedParentWording(line)).toBe(false);
    expect(await papersOf(assessmentId)).toHaveLength(0);
  });

  it("when the bank cannot make a different paper, Create another mock says so plainly and creates nothing", async () => {
    const { assessmentId } = await confirmedAssessment(db, parent, ["Reading bar graphs"], { nickname: "Test Child G" });
    await setPaperSettings(parent, assessmentId, { totalMarks: 10, durationMinutes: 15, difficulty: "balanced" }, context());
    const { plan, ids } = await candidateIds(assessmentId);
    const only = selectQuestions({ blueprint: plan.blueprint, candidates: plan.candidates, seed: "probe" });
    if (!only.ok) throw new Error("expected the bank to fill 10 marks of bar graphs");
    const keep = new Set(only.selection.map((q) => q.questionId));
    // Leave exactly one possible paper: retire every other approved question of this topic.
    await damage(() =>
      db.update(questions).set({ status: "retired" }).where(inArray(questions.id, ids.filter((id) => !keep.has(id)))),
    );

    const first = await generateMock(parent, assessmentId, key(5), context());
    expect(first).toMatchObject({ number: 1, created: true });

    const error = await generateMock(parent, assessmentId, key(6), context()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MockGenerationError);
    expect((error as MockGenerationError).code).toBe("no_different_paper");
    expect((error as MockGenerationError).problems[0]).toMatch(/can't make a different mock/);
    expect(hasBannedParentWording((error as MockGenerationError).problems.join(" "))).toBe(false);
    expect(await papersOf(assessmentId)).toHaveLength(1);
    // Nothing of Mock 1 was disturbed, and the same key still returns Mock 1.
    expect(await generateMock(parent, assessmentId, key(5), context())).toMatchObject({ paperId: first.paperId, created: false });
  });
});
