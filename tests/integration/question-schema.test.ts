import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createQuestionDraft, reviewQuestion, submitForReview } from "@/application/commands/questions";
import type { Database } from "@/repositories/postgres/client";
import {
  questionAssets,
  questionFamilies,
  questionOutcomes,
  questionReviews,
  questions,
} from "@/repositories/postgres/schema";
import { buildDraft, createQuestionBed, type QuestionBed } from "../factories";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

/** Drizzle wraps driver errors; the database's own message is on `cause`. */
async function rejectionMessage(promise: PromiseLike<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    return `${error instanceof Error ? error.message : String(error)} ${cause}`;
  }
  throw new Error("expected the statement to be rejected");
}

describe("question bank schema and immutability trigger (M2-01, ADR-0004)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let bed: QuestionBed;
  let counter = 0;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    bed = await createQuestionBed(db, "SC");
  });

  afterAll(async () => {
    await testDb.close();
  });

  const actor = () => ({ profileId: bed.admin.id });

  async function newDraft(overrides = {}) {
    counter += 1;
    return createQuestionDraft(
      { curriculumVersionId: bed.version.id, draft: buildDraft(bed, { familyCode: `SC-F${counter}`, ...overrides }) },
      actor(),
      { db },
    );
  }

  async function approvedQuestion() {
    const created = await newDraft();
    await submitForReview({ questionId: created.questionId }, actor(), { db });
    await reviewQuestion(
      {
        questionId: created.questionId,
        decision: "approved",
        checklist: { curriculum: true, answer: true, clarity: true, ageAppropriate: true },
      },
      actor(),
      { db },
    );
    return created;
  }

  it("creates the question tables", async () => {
    const result = (await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    )) as unknown as { rows: { table_name: string }[] };
    expect(result.rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining(["question_families", "questions", "question_outcomes", "question_assets", "question_reviews"]),
    );
  });

  it("uses ON DELETE RESTRICT for every foreign key between question tables", async () => {
    const result = (await db.execute(sql`
      select tc.table_name, rc.delete_rule
      from information_schema.table_constraints tc
      join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public' and tc.table_name like 'question%'
    `)) as unknown as { rows: { table_name: string; delete_rule: string }[] };
    expect(result.rows.length).toBeGreaterThanOrEqual(10);
    expect(result.rows.filter((r) => r.delete_rule !== "RESTRICT")).toEqual([]);
  });

  it("enforces one version number per family and one family code per curriculum version", async () => {
    const created = await newDraft();
    const [row] = await db.select().from(questions).where(eq(questions.id, created.questionId));
    if (!row) throw new Error("missing row");
    const { id: _id, ...copy } = row;
    void _id;
    expect(await rejectionMessage(db.insert(questions).values(copy))).toMatch(/questions_family_version_key|duplicate/i);
    expect(
      await rejectionMessage(
        db.insert(questionFamilies).values({ code: created.familyCode, title: "Again", curriculumVersionId: bed.version.id }),
      ),
    ).toMatch(/question_families_version_code_key|duplicate/i);
  });

  it("allows only one primary outcome per question, but any number of secondaries", async () => {
    const created = await newDraft();
    expect(
      await rejectionMessage(
        db.insert(questionOutcomes).values({ questionId: created.questionId, outcomeId: bed.secondOutcome.id, role: "primary" }),
      ),
    ).toMatch(/uq_question_outcomes_one_primary|duplicate/i);
    await db.insert(questionOutcomes).values({ questionId: created.questionId, outcomeId: bed.secondOutcome.id, role: "secondary" });
  });

  it("refuses an outcome from a different curriculum version", async () => {
    const other = await createQuestionBed(db, "OT");
    const created = await newDraft();
    expect(
      await rejectionMessage(
        db.insert(questionOutcomes).values({ questionId: created.questionId, outcomeId: other.outcome.id, role: "secondary" }),
      ),
    ).toMatch(/not part of the question's curriculum version/);
  });

  it("refuses approval without exactly one primary outcome", async () => {
    const created = await newDraft();
    await db.delete(questionOutcomes).where(eq(questionOutcomes.questionId, created.questionId));
    expect(
      await rejectionMessage(
        db.update(questions).set({ status: "approved", approvedAt: new Date() }).where(eq(questions.id, created.questionId)),
      ),
    ).toMatch(/needs exactly one primary outcome/);
  });

  it("refuses to change what a pupil sees or how it is marked once approved", async () => {
    const approved = await approvedQuestion();
    const edits: Record<string, Record<string, unknown>> = {
      content: { content: { stem: [{ t: "p", c: [{ t: "text", v: "Changed" }] }] } },
      answer: { answer: { kind: "number", value: "1" } },
      verification: { verification: { expression: "1+1" } },
      worked_solution: { workedSolution: [{ t: "p", c: [{ t: "text", v: "Changed" }] }] },
      marking_scheme: { markingScheme: { method: "exact" } },
      marks: { marks: 5 },
      question_type: { questionType: "text" },
      difficulty: { difficulty: "challenging" },
    };
    for (const [label, change] of Object.entries(edits)) {
      expect(
        await rejectionMessage(db.update(questions).set(change).where(eq(questions.id, approved.questionId))),
        label,
      ).toMatch(/is approved; only moving it to retired is allowed/);
    }
    const [row] = await db.select().from(questions).where(eq(questions.id, approved.questionId));
    expect(row?.marks).toBe(2);
    expect(row?.status).toBe("approved");
  });

  it("refuses to delete approved or retired questions, and any change to their outcome mappings or assets", async () => {
    const approved = await approvedQuestion();
    expect(await rejectionMessage(db.delete(questions).where(eq(questions.id, approved.questionId)))).toMatch(/cannot be deleted/);
    expect(
      await rejectionMessage(db.delete(questionOutcomes).where(eq(questionOutcomes.questionId, approved.questionId))),
    ).toMatch(/is approved or retired/);
    expect(
      await rejectionMessage(
        db.update(questionOutcomes).set({ role: "secondary" }).where(eq(questionOutcomes.questionId, approved.questionId)),
      ),
    ).toMatch(/is approved or retired/);
    expect(
      await rejectionMessage(
        db.insert(questionOutcomes).values({ questionId: approved.questionId, outcomeId: bed.secondOutcome.id, role: "secondary" }),
      ),
    ).toMatch(/is approved or retired/);
    expect(
      await rejectionMessage(
        db.insert(questionAssets).values({ questionId: approved.questionId, objectKey: "x.png", alt: "x", contentType: "image/png" }),
      ),
    ).toMatch(/is approved or retired/);
  });

  it("allows approved -> retired, then nothing else", async () => {
    const approved = await approvedQuestion();
    await db.update(questions).set({ status: "retired" }).where(eq(questions.id, approved.questionId));
    expect(
      await rejectionMessage(db.update(questions).set({ status: "approved" }).where(eq(questions.id, approved.questionId))),
    ).toMatch(/is retired and cannot be changed/);
    expect(await rejectionMessage(db.update(questions).set({ marks: 3 }).where(eq(questions.id, approved.questionId)))).toMatch(
      /is retired and cannot be changed/,
    );
    expect(await rejectionMessage(db.delete(questions).where(eq(questions.id, approved.questionId)))).toMatch(/cannot be deleted/);
  });

  it("still lets a draft be edited and deleted", async () => {
    const draft = await newDraft();
    await db.update(questions).set({ marks: 3 }).where(eq(questions.id, draft.questionId));
    await db.delete(questionOutcomes).where(eq(questionOutcomes.questionId, draft.questionId));
    await db.delete(questions).where(eq(questions.id, draft.questionId));
  });

  it("keeps the review trail append-only", async () => {
    const approved = await approvedQuestion();
    expect(await rejectionMessage(db.delete(questionReviews).where(eq(questionReviews.questionId, approved.questionId)))).toMatch(
      /append-only/,
    );
    expect(
      await rejectionMessage(db.update(questionReviews).set({ notes: "edited" }).where(eq(questionReviews.questionId, approved.questionId))),
    ).toMatch(/append-only/);
  });

  it("rejects asset keys that are URLs", async () => {
    const draft = await newDraft();
    expect(
      await rejectionMessage(
        db.insert(questionAssets).values({ questionId: draft.questionId, objectKey: "https://example.test/a.png", alt: "x", contentType: "image/png" }),
      ),
    ).toMatch(/question_assets_not_url|check/i);
  });

  it("refuses a question whose curriculum version differs from its family's, and refuses inserting a non-draft", async () => {
    const other = await createQuestionBed(db, "TW");
    const created = await newDraft();
    const [row] = await db.select().from(questions).where(eq(questions.id, created.questionId));
    if (!row) throw new Error("missing row");
    const { id: _id, ...copy } = row;
    void _id;
    expect(
      await rejectionMessage(db.insert(questions).values({ ...copy, version: 9, curriculumVersionId: other.version.id })),
    ).toMatch(/its family belongs to/);
    expect(await rejectionMessage(db.insert(questions).values({ ...copy, version: 10, status: "approved", approvedAt: new Date() }))).toMatch(
      /must be created as a draft/,
    );
  });
});
