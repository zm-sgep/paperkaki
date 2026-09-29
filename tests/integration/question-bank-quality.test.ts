import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createQuestionDraft, reviewQuestion, submitForReview } from "@/application/commands/questions";
import { checkQuestionBankQuality } from "@/application/queries/question-bank-quality";
import type { Database } from "@/repositories/postgres/client";
import { questionAssets, questionFamilies, questionOutcomes, questions } from "@/repositories/postgres/schema";
import { createLocalStorage } from "@/services/storage/local-adapter";
import { buildDraft, createQuestionBed } from "../factories";
import { seedRealBank } from "../helpers/seed-bank";
import { createTestDb, type TestDatabase } from "../helpers/test-db";
import { BANK_SIZE } from "../helpers/question-bank";

/**
 * Consistency of the approved question bank (M2-08): exactly one primary outcome, marks > 0,
 * a valid answer that the deterministic verifier confirms, referenced assets in storage, and no
 * duplicate family/version. Runs over the real bank as seeded by `npm run db:seed`.
 */

const ticked = { curriculum: true, answer: true, clarity: true, ageAppropriate: true };

describe("question bank quality suite (M2-08)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let storageDir: string;
  let storage: ReturnType<typeof createLocalStorage>;

  beforeAll(async () => {
    storageDir = await mkdtemp(path.join(os.tmpdir(), "pk-quality-"));
    storage = createLocalStorage({ rootDir: storageDir, signingSecret: "test-only-storage-signing-secret-0123456789" });
    testDb = await createTestDb();
    db = testDb.db;
    await seedRealBank(db);
  }, 120_000);

  afterAll(async () => {
    await testDb.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  it("passes for every approved question in the seeded bank", async () => {
    const { checked, violations } = await checkQuestionBankQuality({ db, storage });
    expect(checked).toBe(BANK_SIZE);
    expect(violations).toEqual([]);
  });

  it("has exactly one primary outcome and positive marks on every approved question", async () => {
    const result = (await db.execute(sql`
      select q.id from questions q where q.status = 'approved' and (
        (select count(*) from question_outcomes o where o.question_id = q.id and o.role = 'primary') <> 1 or q.marks <= 0)
    `)) as unknown as { rows: unknown[] };
    expect(result.rows).toEqual([]);
  });

  it("has unique family codes per curriculum version and unique versions per family", async () => {
    const dupes = (await db.execute(sql`
      select curriculum_version_id, code, count(*) from question_families group by 1, 2 having count(*) > 1
    `)) as unknown as { rows: unknown[] };
    expect(dupes.rows).toEqual([]);
    const versions = (await db.execute(sql`
      select family_id, version, count(*) from questions group by 1, 2 having count(*) > 1
    `)) as unknown as { rows: unknown[] };
    expect(versions.rows).toEqual([]);
  });

  describe("fails on an intentionally broken bank", () => {
    it("reports each rule that a broken approved question breaks", async () => {
      const broken = await createTestDb();
      const bdb = broken.db;
      try {
        const bed = await createQuestionBed(bdb, "BR");
        const admin = { profileId: bed.admin.id };
        const make = async (code: string, overrides = {}) => {
          const created = await createQuestionDraft(
            { curriculumVersionId: bed.version.id, draft: buildDraft(bed, { familyCode: code, ...overrides }) },
            admin,
            { db: bdb },
          );
          await submitForReview({ questionId: created.questionId }, admin, { db: bdb });
          await reviewQuestion({ questionId: created.questionId, decision: "approved", checklist: ticked }, admin, { db: bdb });
          return created;
        };
        const good = await make("BR-GOOD");
        const wrongAnswer = await make("BR-WRONG");
        const noPrimary = await make("BR-NOPRIMARY");
        const badMarks = await make("BR-MARKS");
        const withImage = await make("BR-IMAGE");

        // The immutability trigger stops this in normal operation. Switch it off to corrupt the data
        // the way a bad manual edit or a buggy migration would.
        await bdb.execute(sql`alter table questions disable trigger questions_guard_row`);
        await bdb.execute(sql`alter table question_outcomes disable trigger question_outcomes_guard`);
        await bdb.execute(sql`alter table question_assets disable trigger question_assets_guard`);
        await bdb.update(questions).set({ answer: { kind: "number", value: "1", unit: "$" } }).where(eq(questions.id, wrongAnswer.questionId));
        await bdb.delete(questionOutcomes).where(eq(questionOutcomes.questionId, noPrimary.questionId));
        await bdb.execute(sql`alter table questions drop constraint questions_marks_positive`);
        await bdb.update(questions).set({ marks: 0 }).where(eq(questions.id, badMarks.questionId));
        await bdb
          .update(questions)
          .set({ content: { stem: [{ t: "image", assetKey: "questions/missing.png", alt: "A missing picture" }] } })
          .where(eq(questions.id, withImage.questionId));
        await bdb.insert(questionAssets).values({ questionId: withImage.questionId, objectKey: "questions/missing.png", alt: "A missing picture", contentType: "image/png" });

        const { violations } = await checkQuestionBankQuality({ db: bdb, storage });
        const rulesFor = (id: string) => violations.filter((v) => v.questionId === id).map((v) => v.rule);
        expect(rulesFor(good.questionId)).toEqual([]);
        expect(rulesFor(wrongAnswer.questionId)).toContain("answer_verified");
        expect(rulesFor(noPrimary.questionId)).toContain("one_primary_outcome");
        expect(rulesFor(badMarks.questionId)).toContain("marks_positive");
        expect(rulesFor(withImage.questionId)).toContain("asset_in_storage");

        // Putting the file in storage fixes the asset finding and nothing else.
        await storage.put({ bucket: "question-assets", key: "questions/missing.png", body: "x", contentType: "image/png" });
        const again = await checkQuestionBankQuality({ db: bdb, storage });
        expect(again.violations.filter((v) => v.questionId === withImage.questionId)).toEqual([]);
        expect(again.violations.length).toBe(violations.length - 1);
      } finally {
        await broken.close();
      }
    });

    it("reports an image that is used in a question but not registered as an asset", async () => {
      const broken = await createTestDb();
      try {
        const bed = await createQuestionBed(broken.db, "BU");
        const admin = { profileId: bed.admin.id };
        const draft = buildDraft(bed, { familyCode: "BU-IMG" });
        draft.content.stem.push({ t: "image", assetKey: "questions/unregistered.png", alt: "Unregistered" });
        const created = await createQuestionDraft({ curriculumVersionId: bed.version.id, draft }, admin, { db: broken.db });
        await submitForReview({ questionId: created.questionId }, admin, { db: broken.db });
        await reviewQuestion({ questionId: created.questionId, decision: "approved", checklist: ticked }, admin, { db: broken.db });
        // createQuestionDraft registers the asset, so remove that record the way a bad edit could.
        await broken.db.execute(sql`alter table question_assets disable trigger question_assets_guard`);
        await broken.db.delete(questionAssets).where(eq(questionAssets.questionId, created.questionId));
        const { violations } = await checkQuestionBankQuality({ db: broken.db, storage });
        expect(violations.map((v) => v.rule)).toContain("asset_registered");
      } finally {
        await broken.close();
      }
    });

    it("cannot be fooled by a family that is in another curriculum version", async () => {
      const broken = await createTestDb();
      try {
        const bed = await createQuestionBed(broken.db, "BF");
        const other = await createQuestionBed(broken.db, "BG");
        const admin = { profileId: bed.admin.id };
        const created = await createQuestionDraft(
          { curriculumVersionId: bed.version.id, draft: buildDraft(bed, { familyCode: "BF-X" }) },
          admin,
          { db: broken.db },
        );
        await submitForReview({ questionId: created.questionId }, admin, { db: broken.db });
        await reviewQuestion({ questionId: created.questionId, decision: "approved", checklist: ticked }, admin, { db: broken.db });
        await broken.db.execute(sql`alter table questions disable trigger questions_guard_row`);
        await broken.db.update(questionFamilies).set({ curriculumVersionId: other.version.id }).where(eq(questionFamilies.id, created.familyId));
        const { violations } = await checkQuestionBankQuality({ db: broken.db, storage });
        expect(violations.map((v) => v.rule)).toContain("outcome_in_curriculum_version");
      } finally {
        await broken.close();
      }
    });
  });
});
