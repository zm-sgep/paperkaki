import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getQuestionEditorOptions, listCandidateQuestions, listQuestionsForAdmin } from "@/application/queries/questions";
import type { Database } from "@/repositories/postgres/client";
import { seedRealBank } from "../helpers/seed-bank";
import { createTestDb, type TestDatabase } from "../helpers/test-db";
import { BANK_SIZE } from "../helpers/question-bank";

const PAGE_COUNT = Math.ceil(BANK_SIZE / 25);

/** Filters, pagination and index use over the real seeded bank (every question in content/questions, approved). */
describe("question list filters and pagination (M2-06)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let versionId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    await seedRealBank(db);
    versionId = (await getQuestionEditorOptions(null, { db })).curriculumVersionId as string;
  }, 120_000);
  afterAll(async () => {
    await testDb.close();
  });

  const list = (filters: Parameters<typeof listQuestionsForAdmin>[0], page = 1) => listQuestionsForAdmin(filters, page, { db });

  it("lists everything, 25 per page, in a stable order", async () => {
    const first = await list({});
    expect(first.total).toBe(BANK_SIZE);
    expect(first.pageSize).toBe(25);
    expect(first.pageCount).toBe(PAGE_COUNT);
    expect(first.rows).toHaveLength(25);
    const last = await list({}, PAGE_COUNT);
    expect(last.rows).toHaveLength(BANK_SIZE - (PAGE_COUNT - 1) * 25);

    const seen = new Set<string>();
    for (let page = 1; page <= PAGE_COUNT; page += 1) {
      for (const row of (await list({}, page)).rows) {
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
      }
    }
    expect(seen.size).toBe(BANK_SIZE);
    const codes = first.rows.map((r) => r.familyCode);
    expect([...codes].sort()).toEqual(codes);
  });

  it("clamps a page number that is out of range", async () => {
    expect((await list({}, 999)).page).toBe(PAGE_COUNT);
    expect((await list({}, 0)).page).toBe(1);
  });

  it("filters by topic, which is the topic of the primary outcome", async () => {
    const { topics } = await getQuestionEditorOptions(null, { db });
    const fractions = topics.find((t) => t.title === "Fractions");
    expect(fractions).toBeDefined();
    const result = await list({ topicId: fractions?.id });
    expect(result.total).toBeGreaterThan(0);
    expect(result.total).toBeLessThan(BANK_SIZE);
    expect(result.rows.every((r) => r.topicTitle === "Fractions")).toBe(true);
    const everyTopic = await Promise.all(topics.map((t) => list({ topicId: t.id })));
    expect(everyTopic.reduce((n, r) => n + r.total, 0)).toBe(BANK_SIZE);
  });

  it("filters by outcome", async () => {
    const { topics } = await getQuestionEditorOptions(null, { db });
    const outcome = topics.find((t) => t.title === "Fractions")?.outcomes[0];
    const result = await list({ outcomeId: outcome?.id });
    expect(result.total).toBeGreaterThan(0);
    expect(result.rows.every((r) => r.primaryOutcomeCode === outcome?.code || r.topicTitle === "Fractions")).toBe(true);
  });

  it("filters by level, type, difficulty and status", async () => {
    expect((await list({ level: "P3" })).total).toBe(BANK_SIZE);
    expect((await list({ level: "P4" })).total).toBe(0);
    const mcq = await list({ questionType: "mcq" });
    expect(mcq.total).toBeGreaterThan(0);
    expect(mcq.rows.every((r) => r.questionType === "mcq")).toBe(true);
    const hard = await list({ difficulty: "challenging" });
    expect(hard.rows.every((r) => r.difficulty === "challenging")).toBe(true);
    expect((await list({ status: "approved" })).total).toBe(BANK_SIZE);
    expect((await list({ status: "draft" })).total).toBe(0);
    expect((await list({ status: "retired" })).total).toBe(0);
  });

  it("combines filters with AND", async () => {
    const { topics } = await getQuestionEditorOptions(null, { db });
    const fractions = topics.find((t) => t.title === "Fractions");
    const topicOnly = await list({ topicId: fractions?.id });
    const combined = await list({ topicId: fractions?.id, questionType: "mcq", difficulty: "standard", status: "approved", level: "P3" });
    expect(combined.total).toBeLessThan(topicOnly.total);
    expect(combined.rows.every((r) => r.topicTitle === "Fractions" && r.questionType === "mcq" && r.difficulty === "standard")).toBe(true);
    const expected = (await list({ topicId: fractions?.id })).rows
      .concat((await list({ topicId: fractions?.id }, 2)).rows)
      .filter((r) => r.questionType === "mcq" && r.difficulty === "standard").length;
    expect(combined.total).toBe(expected);

    const wrongTopicForOutcome = topics.find((t) => t.title === "Money")?.outcomes[0];
    expect((await list({ topicId: fractions?.id, outcomeId: wrongTopicForOutcome?.id })).total).toBe(0);
  });

  it("returns a readable summary and no raw content", async () => {
    const [row] = (await list({})).rows;
    expect(row?.summary.length).toBeGreaterThan(0);
    expect(row).not.toHaveProperty("content");
  });

  it("uses indexes for the approved-only generation path and the filter paths", async () => {
    const plan = async (query: ReturnType<typeof sql>) => {
      await db.execute(sql`set enable_seqscan = off`);
      try {
        const result = (await db.execute(sql`explain ${query}`)) as unknown as { rows: Record<string, string>[] };
        return result.rows.map((r) => Object.values(r)[0]).join("\n");
      } finally {
        await db.execute(sql`reset enable_seqscan`);
      }
    };
    const generation = await plan(
      sql`select id from questions where status = 'approved' and curriculum_version_id = ${versionId} and subject = 'Mathematics' and level = 'P3'`,
    );
    expect(generation).toMatch(/idx_questions_(approved|generation)/);
    const byOutcome = await plan(sql`select question_id from question_outcomes where outcome_id = ${versionId}`);
    expect(byOutcome).toMatch(/idx_question_outcomes_outcome|question_outcomes_pkey_key/);
    const byFamily = await plan(sql`select id from questions where family_id = ${versionId}`);
    expect(byFamily).toMatch(/idx_questions_family|questions_family_version_key/);
    const byType = await plan(sql`select id from questions where curriculum_version_id = ${versionId} and question_type = 'mcq' and difficulty = 'basic'`);
    expect(byType).toMatch(/idx_questions_/);
  });

  it("returns every approved question as a generation candidate for all of a version's outcomes", async () => {
    const { topics } = await getQuestionEditorOptions(null, { db });
    const outcomeIds = topics.flatMap((t) => t.outcomes.map((o) => o.id));
    const candidates = await listCandidateQuestions({ curriculumVersionId: versionId, outcomeIds, level: "P3", subject: "Mathematics" }, { db });
    expect(candidates).toHaveLength(BANK_SIZE);
    expect(new Set(candidates.map((c) => c.questionId)).size).toBe(BANK_SIZE);
    expect(candidates.every((c) => c.marks > 0 && c.topicId && c.familyId && c.primaryOutcomeId)).toBe(true);
  });
});
