import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { loadPaperImages, loadPaperQuestions } from "@/application/paper-data";
import { createQuestionDraft, reviewQuestion, submitForReview } from "@/application/commands/questions";
import type { Database } from "@/repositories/postgres/client";
import { questions } from "@/repositories/postgres/schema";
import { buildDraft, createQuestionBed } from "../factories";
import { createMemoryStorage } from "../helpers/memory-storage";
import { seedRealBank } from "../helpers/seed-bank";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

describe("loading questions for a paper (M4-03)", () => {
  let testDb: TestDatabase;
  let db: Database;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("every approved question of the real bank is usable: approved, answered, verified, no missing files", async () => {
    await seedRealBank(db);
    const ids = (await db.select({ id: questions.id }).from(questions).where(eq(questions.status, "approved"))).map((q) => q.id);
    expect(ids.length).toBeGreaterThan(100);
    const loaded = await loadPaperQuestions(db, createMemoryStorage(), ids);
    expect(loaded).toHaveLength(ids.length);
    const bad = loaded.filter(
      (q) => !q.facts.approved || !q.facts.hasAnswer || !q.facts.answerVerified || q.facts.missingAssets.length > 0 || !q.draft || q.topicLabel === "",
    );
    expect(bad.map((q) => q.questionId)).toEqual([]);
    expect(loaded.every((q) => !/^P3-/.test(q.topicLabel))).toBe(true);
  });

  it("a retired question is reported as not approved", async () => {
    const [row] = await db.select({ id: questions.id }).from(questions).where(eq(questions.status, "approved")).limit(1);
    await db.execute(sql`ALTER TABLE questions DISABLE TRIGGER questions_guard_row`);
    await db.update(questions).set({ status: "retired" }).where(eq(questions.id, row!.id));
    await db.execute(sql`ALTER TABLE questions ENABLE TRIGGER questions_guard_row`);
    const [loaded] = await loadPaperQuestions(db, createMemoryStorage(), [row!.id]);
    expect(loaded?.facts.approved).toBe(false);
  });

  it("a stored answer that no longer matches its check is reported, and so is a missing file", async () => {
    const bed = await createQuestionBed(db, "PD");
    const actor = { profileId: bed.admin.id };
    const approve = async (draft: ReturnType<typeof buildDraft>) => {
      const created = await createQuestionDraft({ curriculumVersionId: bed.version.id, draft }, actor, { db });
      await submitForReview({ questionId: created.questionId }, actor, { db });
      await reviewQuestion(
        { questionId: created.questionId, decision: "approved", checklist: { curriculum: true, answer: true, clarity: true, ageAppropriate: true } },
        actor,
        { db },
      );
      return created.questionId;
    };

    const withImage = await approve(
      buildDraft(bed, {
        familyCode: "PD-IMG",
        content: {
          stem: [
            { t: "image", assetKey: "pd-shape.png", alt: "A shape", widthMm: 50 },
            { t: "p", c: [{ t: "text", v: "How much does he have? " }, { t: "blank" }] },
          ],
        },
      }),
    );
    const svg = await approve(
      buildDraft(bed, {
        familyCode: "PD-SVG",
        content: { stem: [{ t: "image", assetKey: "pd-shape.svg", alt: "A shape" }, { t: "p", c: [{ t: "blank" }] }] },
      }),
    );

    const storage = createMemoryStorage();
    const [missing] = await loadPaperQuestions(db, storage, [withImage]);
    expect(missing?.facts.missingAssets).toEqual(["pd-shape.png"]);

    await storage.put({ bucket: "question-assets", key: "pd-shape.png", body: new Uint8Array([137, 80, 78, 71]), contentType: "image/png" });
    const [found] = await loadPaperQuestions(db, storage, [withImage]);
    expect(found?.facts.missingAssets).toEqual([]);
    expect(found?.facts.answerVerified).toBe(true);
    const images = await loadPaperImages(storage, [found!]);
    expect(images["pd-shape.png"]).toMatchObject({ format: "png" });

    // A format the renderer cannot draw counts as unresolvable, even when the file exists.
    await storage.put({ bucket: "question-assets", key: "pd-shape.svg", body: "<svg/>", contentType: "image/svg+xml" });
    const [undrawable] = await loadPaperQuestions(db, storage, [svg]);
    expect(undrawable?.facts.missingAssets).toEqual(["pd-shape.svg"]);

    // Corrupt the stored answer behind the trigger's back: the independent check now fails.
    await db.execute(sql`ALTER TABLE questions DISABLE TRIGGER questions_guard_row`);
    await db
      .update(questions)
      .set({ answer: { kind: "number", value: "99", unit: "$" } })
      .where(eq(questions.id, withImage));
    await db.execute(sql`ALTER TABLE questions ENABLE TRIGGER questions_guard_row`);
    const [wrong] = await loadPaperQuestions(db, storage, [withImage]);
    expect(wrong?.facts.answerVerified).toBe(false);
    expect(wrong?.facts.verificationReasons.join(" ")).toMatch(/stored answer is 99/);
  });
});
