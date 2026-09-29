import { and, eq, notInArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/repositories/postgres/client";
import { getLatestBlueprint } from "@/repositories/postgres/assessments";
import { paperQuestions, papers, questions } from "@/repositories/postgres/schema";
import { insertParentProfile } from "../factories";
import { confirmedAssessment } from "../helpers/assessment-fixtures";
import { seedRealBank } from "../helpers/seed-bank";
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

describe("paper schema and immutability trigger (M4-01, ADR-0004)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let parentId: string;
  let assessmentId: string;
  let blueprintId: string;
  let questionIds: string[];
  let counter = 0;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    await seedRealBank(db);
    parentId = (await insertParentProfile(db, "A")).id;
    ({ assessmentId } = await confirmedAssessment(db, parentId, ["Fractions"]));
    blueprintId = (await getLatestBlueprint(db, assessmentId))!.id;
    questionIds = (await db.select({ id: questions.id }).from(questions).where(eq(questions.status, "approved")).limit(6)).map((q) => q.id);
  });

  afterAll(async () => {
    await testDb.close();
  });

  const paperValues = (over: Partial<typeof papers.$inferInsert> = {}): typeof papers.$inferInsert => {
    counter += 1;
    return {
      assessmentId,
      blueprintId,
      number: counter,
      seed: `${assessmentId}:${counter}`,
      requestKey: `key-${counter}`,
      selectionReport: { totalMarks: 2 },
      studentPdfBucket: "paper-pdfs",
      studentPdfKey: `parents/p/assessments/a/mock-${counter}-student.pdf`,
      answerPdfBucket: "paper-pdfs",
      answerPdfKey: `parents/p/assessments/a/mock-${counter}-answers.pdf`,
      createdBy: parentId,
      ...over,
    };
  };

  /** A whole paper in one transaction, as the generator creates it. */
  async function createPaper(count = 2, over: Partial<typeof papers.$inferInsert> = {}) {
    return db.transaction(async (tx) => {
      const [paper] = await tx.insert(papers).values(paperValues(over)).returning();
      await tx.insert(paperQuestions).values(
        questionIds.slice(0, count).map((questionId, index) => ({
          paperId: paper!.id,
          position: index + 1,
          sectionCode: "A",
          questionId,
          marks: 2,
        })),
      );
      return paper!;
    });
  }

  it("creates a paper and its ordered question list, and stores keys not links", async () => {
    const paper = await createPaper(3);
    expect(paper.status).toBe("generated");
    const rows = await db.select().from(paperQuestions).where(eq(paperQuestions.paperId, paper.id)).orderBy(paperQuestions.position);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.questionId)).toEqual(questionIds.slice(0, 3));
    expect(paper.studentPdfKey).not.toMatch(/^[a-z]+:\/\//i);
    await expect(
      db.insert(papers).values(paperValues({ studentPdfKey: "https://example.test/x.pdf" })),
    ).rejects.toThrow();
  });

  it("numbers papers per assessment: the same number twice is rejected", async () => {
    const paper = await createPaper(1);
    const message = await rejectionMessage(db.insert(papers).values(paperValues({ number: paper.number })));
    expect(message).toMatch(/papers_assessment_number_key|duplicate key/);
  });

  it("request keys are unique", async () => {
    const paper = await createPaper(1);
    const message = await rejectionMessage(db.insert(papers).values(paperValues({ requestKey: paper.requestKey })));
    expect(message).toMatch(/papers_request_key_key|duplicate key/);
  });

  it("a question can appear once per paper, and positions are unique", async () => {
    await expect(
      db.transaction(async (tx) => {
        const [paper] = await tx.insert(papers).values(paperValues()).returning();
        await tx.insert(paperQuestions).values({ paperId: paper!.id, position: 1, sectionCode: "A", questionId: questionIds[0]!, marks: 2 });
        await tx.insert(paperQuestions).values({ paperId: paper!.id, position: 2, sectionCode: "A", questionId: questionIds[0]!, marks: 2 });
      }),
    ).rejects.toThrow();
    await expect(
      db.transaction(async (tx) => {
        const [paper] = await tx.insert(papers).values(paperValues()).returning();
        await tx.insert(paperQuestions).values({ paperId: paper!.id, position: 1, sectionCode: "A", questionId: questionIds[0]!, marks: 2 });
        await tx.insert(paperQuestions).values({ paperId: paper!.id, position: 1, sectionCode: "A", questionId: questionIds[1]!, marks: 2 });
      }),
    ).rejects.toThrow();
  });

  it("the question list is frozen: no insert, update or delete after the paper was created", async () => {
    const paper = await createPaper(2);
    const later = await rejectionMessage(
      db.insert(paperQuestions).values({ paperId: paper.id, position: 3, sectionCode: "A", questionId: questionIds[2]!, marks: 2 }),
    );
    expect(later).toMatch(/already generated/);
    expect(await rejectionMessage(db.update(paperQuestions).set({ marks: 5 }).where(eq(paperQuestions.paperId, paper.id)))).toMatch(/frozen/);
    expect(await rejectionMessage(db.update(paperQuestions).set({ questionId: questionIds[5]! }).where(eq(paperQuestions.paperId, paper.id)))).toMatch(/frozen/);
    expect(await rejectionMessage(db.delete(paperQuestions).where(eq(paperQuestions.paperId, paper.id)))).toMatch(/frozen/);
    const rows = await db.select().from(paperQuestions).where(eq(paperQuestions.paperId, paper.id));
    expect(rows).toHaveLength(2);
  });

  it("papers are never deleted and only their status may change, generated to retired", async () => {
    const paper = await createPaper(1);
    expect(await rejectionMessage(db.delete(papers).where(eq(papers.id, paper.id)))).toMatch(/cannot be deleted/);
    expect(await rejectionMessage(db.update(papers).set({ seed: "other" }).where(eq(papers.id, paper.id)))).toMatch(/frozen/);
    expect(await rejectionMessage(db.update(papers).set({ studentPdfKey: "parents/x/other.pdf" }).where(eq(papers.id, paper.id)))).toMatch(/frozen/);
    expect(await rejectionMessage(db.update(papers).set({ selectionReport: {} }).where(eq(papers.id, paper.id)))).toMatch(/frozen/);
    await db.update(papers).set({ status: "retired" }).where(eq(papers.id, paper.id));
    expect(await rejectionMessage(db.update(papers).set({ status: "generated" }).where(eq(papers.id, paper.id)))).toMatch(/generated to retired/);
  });

  it("only approved questions can be put on a paper", async () => {
    const [draft] = await db
      .select({ id: questions.id })
      .from(questions)
      .where(and(eq(questions.status, "approved"), notInArray(questions.id, questionIds)))
      .limit(1);
    // A retired question is no longer approved: it cannot be added to a new paper.
    await db.execute(sql`ALTER TABLE questions DISABLE TRIGGER questions_guard_row`);
    await db.update(questions).set({ status: "retired" }).where(eq(questions.id, draft!.id));
    await db.execute(sql`ALTER TABLE questions ENABLE TRIGGER questions_guard_row`);
    const message = await rejectionMessage(
      db.transaction(async (tx) => {
        const [paper] = await tx.insert(papers).values(paperValues()).returning();
        await tx.insert(paperQuestions).values({ paperId: paper!.id, position: 1, sectionCode: "A", questionId: draft!.id, marks: 2 });
      }),
    );
    expect(message).toMatch(/not approved/);
  });

  it("protects history: a question on a paper cannot be deleted or edited, and neither can the blueprint or assessment", async () => {
    const paper = await createPaper(1);
    const [question] = await db.select().from(paperQuestions).where(eq(paperQuestions.paperId, paper.id));
    expect(await rejectionMessage(db.delete(questions).where(eq(questions.id, question!.questionId)))).toMatch(/cannot be deleted|foreign key|restrict/i);
    expect(await rejectionMessage(db.update(questions).set({ marks: 9 }).where(eq(questions.id, question!.questionId)))).toMatch(/approved/);
    expect(await rejectionMessage(db.execute(sql`DELETE FROM assessment_blueprints WHERE id = ${blueprintId}`))).toMatch(/foreign key|restrict|violates/i);
    expect(await rejectionMessage(db.execute(sql`DELETE FROM assessments WHERE id = ${assessmentId}`))).toMatch(/foreign key|restrict|violates/i);
  });
});
