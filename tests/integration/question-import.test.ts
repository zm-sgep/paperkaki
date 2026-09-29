import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importQuestions, QuestionImportError } from "@/application/commands/import-questions";
import { DEV_FIXTURE_NOTE, seedDevelopmentQuestions } from "@/application/commands/seed-dev-questions";
import { SeedRefusedError } from "@/application/commands/seed-dev-curriculum";
import { reviewQuestion, submitForReview } from "@/application/commands/questions";
import type { Database } from "@/repositories/postgres/client";
import { questionFamilies, questionReviews, questions } from "@/repositories/postgres/schema";
import { buildDraft, createQuestionBed, type QuestionBed } from "../factories";
import { createTestDb, type TestDatabase } from "../helpers/test-db";
import { readContentQuestionFiles, seedRealBank } from "../helpers/seed-bank";

const ticked = { curriculum: true, answer: true, clarity: true, ageAppropriate: true };

describe("question import (M2-07)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let bed: QuestionBed;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    bed = await createQuestionBed(db, "IM");
    // The importer defaults to the newest published version; the bed's is a draft, so name it.
  });
  afterAll(async () => {
    await testDb.close();
  });

  const opts = () => ({ db, curriculumVersionCode: bed.version.code });
  const statuses = async (code: string) => {
    const [family] = await db.select().from(questionFamilies).where(eq(questionFamilies.code, code));
    if (!family) return [];
    const rows = await db.select().from(questions).where(eq(questions.familyId, family.id));
    return rows.sort((a, b) => a.version - b.version).map((r) => `v${r.version}:${r.status}`);
  };

  it("imports drafts, and importing the same file again changes nothing", async () => {
    const file = [buildDraft(bed, { familyCode: "IM-A" }), buildDraft(bed, { familyCode: "IM-B", marks: 3 })];
    const first = await importQuestions(file, opts());
    expect(first).toMatchObject({ total: 2, created: 2, unchanged: 0, familiesCreated: 2, revised: 0 });
    expect(await statuses("IM-A")).toEqual(["v1:draft"]);

    const again = await importQuestions(JSON.parse(JSON.stringify(file)), opts());
    expect(again).toMatchObject({ created: 0, unchanged: 2, revised: 0, updatedDrafts: 0, changedQuestionIds: [] });
    expect(await statuses("IM-A")).toEqual(["v1:draft"]);
  });

  it("is idempotent whatever order the JSON keys are in", async () => {
    const draft = buildDraft(bed, { familyCode: "IM-KEYS" });
    await importQuestions([draft], opts());
    const reverseKeys = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reverseKeys)
        : value !== null && typeof value === "object"
          ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverseKeys(v)]))
          : value;
    const shuffled = reverseKeys(draft);
    expect(Object.keys(shuffled as object)[0]).not.toBe(Object.keys(draft)[0]);
    expect((await importQuestions([shuffled], opts())).unchanged).toBe(1);
  });

  it("updates an unchanged-family draft in place when its content changes", async () => {
    await importQuestions([buildDraft(bed, { familyCode: "IM-DRAFT" })], opts());
    const result = await importQuestions([buildDraft(bed, { familyCode: "IM-DRAFT", marks: 4 })], opts());
    expect(result).toMatchObject({ updatedDrafts: 1, created: 0, revised: 0 });
    expect(await statuses("IM-DRAFT")).toEqual(["v1:draft"]);
  });

  it("creates a new draft version when the content of an approved question changes", async () => {
    const [imported] = (await importQuestions([buildDraft(bed, { familyCode: "IM-APPROVED" })], opts())).changedQuestionIds;
    const admin = { profileId: bed.admin.id };
    await submitForReview({ questionId: imported as string }, admin, { db });
    await reviewQuestion({ questionId: imported as string, decision: "approved", checklist: ticked }, admin, { db });

    const result = await importQuestions([buildDraft(bed, { familyCode: "IM-APPROVED", marks: 3 })], opts());
    expect(result).toMatchObject({ revised: 1, created: 0, updatedDrafts: 0 });
    expect(await statuses("IM-APPROVED")).toEqual(["v1:approved", "v2:draft"]);

    // and a third import of the same changed file is a no-op
    expect((await importQuestions([buildDraft(bed, { familyCode: "IM-APPROVED", marks: 3 })], opts())).unchanged).toBe(1);
    expect(await statuses("IM-APPROVED")).toEqual(["v1:approved", "v2:draft"]);
  });

  it("treats entries that share a family code in one file as separate questions, and stays idempotent", async () => {
    const a = buildDraft(bed, { familyCode: "IM-SIBLINGS" });
    const b = buildDraft(bed, { familyCode: "IM-SIBLINGS", marks: 3 });
    const first = await importQuestions([a, b], opts());
    expect(first).toMatchObject({ created: 2, revised: 0, familiesCreated: 1 });
    expect(await statuses("IM-SIBLINGS")).toEqual(["v1:draft", "v2:draft"]);
    expect(await importQuestions([a, b], opts())).toMatchObject({ unchanged: 2, created: 0, revised: 0 });
  });

  it("is all-or-nothing and lists every problem with the entry it belongs to", async () => {
    const before = (await db.select().from(questions)).length;
    const file = [
      buildDraft(bed, { familyCode: "IM-OK" }),
      buildDraft(bed, { familyCode: "IM-BAD-1", marks: 0 }),
      buildDraft(bed, { familyCode: "IM-BAD-2", primaryOutcomeCode: "NOPE-1" }),
    ];
    const error = await importQuestions(file, opts()).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(QuestionImportError);
    const issues = (error as QuestionImportError).issues.join("\n");
    expect(issues).toContain("[1] IM-BAD-1");
    expect(issues).toMatch(/marks/);
    // The outcome check runs after the shape check, so fix the shape problem to see it.
    const second = await importQuestions([file[0], file[2]], opts()).then(
      () => null,
      (e: unknown) => e,
    );
    expect((second as QuestionImportError).issues.join("\n")).toContain("outcome NOPE-1 is not part of curriculum version");
    expect((await db.select().from(questions)).length).toBe(before);
  });

  it("rejects a file that is not an array, and an unknown curriculum version", async () => {
    await expect(importQuestions({ nope: true }, opts())).rejects.toBeInstanceOf(QuestionImportError);
    await expect(importQuestions([], { db, curriculumVersionCode: "NO-SUCH-VERSION" })).rejects.toBeInstanceOf(QuestionImportError);
  });

  it("reports answer-check failures as warnings but still imports the draft", async () => {
    const result = await importQuestions(
      [buildDraft(bed, { familyCode: "IM-WRONG", answer: { kind: "number", value: "99", unit: "$" } })],
      opts(),
    );
    expect(result.created).toBe(1);
    expect(result.verifierWarnings.join(" ")).toMatch(/IM-WRONG/);
  });
});

describe("development question seed (M2-07)", () => {
  it("refuses to run in production", async () => {
    const testDb = await createTestDb();
    try {
      await expect(
        seedDevelopmentQuestions([], { db: testDb.db, curriculumVersionCode: "X", nodeEnv: "production" }),
      ).rejects.toBeInstanceOf(SeedRefusedError);
    } finally {
      await testDb.close();
    }
  });

  it("imports every content file, approves all of them with the labelled system note, and is idempotent", async () => {
    const testDb = await createTestDb();
    try {
      const expected = readContentQuestionFiles().reduce((n, f) => n + (f.input as unknown[]).length, 0);
      expect(expected).toBe(268);
      const first = await seedRealBank(testDb.db);
      expect(first.imported.created).toBe(expected);
      expect(first.approved).toBe(expected);
      expect(first.blocked).toEqual([]);

      const rows = await testDb.db.select().from(questions);
      expect(rows.filter((r) => r.status === "approved")).toHaveLength(expected);
      const reviews = await testDb.db.select().from(questionReviews);
      expect(reviews).toHaveLength(expected);
      expect(reviews.every((r) => r.reviewerId === null && (r.notes ?? "").startsWith(DEV_FIXTURE_NOTE))).toBe(true);

      const second = await seedRealBank(testDb.db);
      expect(second.imported).toMatchObject({ created: 0, unchanged: expected });
      expect(second.approved).toBe(0);
      expect(await testDb.db.select().from(questions)).toHaveLength(expected);
    } finally {
      await testDb.close();
    }
  }, 120_000);
});
