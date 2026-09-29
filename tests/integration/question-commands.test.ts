import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError } from "@/application/errors";
import {
  createQuestionDraft,
  retireQuestion,
  reviewQuestion,
  reviseQuestion,
  submitForReview,
} from "@/application/commands/questions";
import { getQuestionForAdmin, listCandidateQuestions } from "@/application/queries/questions";
import { QuestionError } from "@/domain/questions";
import type { Database } from "@/repositories/postgres/client";
import { auditLogs, questionOutcomes, questionReviews, questions } from "@/repositories/postgres/schema";
import { buildDraft, buildHumanCheckedDraft, createQuestionBed, type QuestionBed } from "../factories";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

const ticked = { curriculum: true, answer: true, clarity: true, ageAppropriate: true };

async function expectQuestionError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected a QuestionError (${code})`).toBeInstanceOf(QuestionError);
  expect((error as QuestionError).code).toBe(code);
  return error as QuestionError;
}

describe("question commands (M2-01, M2-03, M2-04)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let bed: QuestionBed;
  let n = 0;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    bed = await createQuestionBed(db, "CM");
  });
  afterAll(async () => {
    await testDb.close();
  });

  const admin = () => ({ profileId: bed.admin.id });
  const ctx = () => ({ db });
  const uniqueCode = () => `CM-F${++n}`;

  async function create(overrides = {}) {
    return createQuestionDraft(
      { curriculumVersionId: bed.version.id, draft: buildDraft(bed, { familyCode: uniqueCode(), ...overrides }) },
      admin(),
      ctx(),
    );
  }
  async function toReview(overrides = {}) {
    const created = await create(overrides);
    await submitForReview({ questionId: created.questionId }, admin(), ctx());
    return created;
  }
  async function approved(overrides = {}) {
    const created = await toReview(overrides);
    await reviewQuestion({ questionId: created.questionId, decision: "approved", checklist: ticked }, admin(), ctx());
    return created;
  }
  const statusOf = async (id: string) => (await db.select().from(questions).where(eq(questions.id, id)))[0]?.status;

  describe("createQuestionDraft", () => {
    it("stores a valid draft with level and subject taken from the curriculum, and one primary outcome", async () => {
      const created = await create({ secondaryOutcomeCodes: [bed.secondOutcome.code] });
      const [row] = await db.select().from(questions).where(eq(questions.id, created.questionId));
      expect(row).toMatchObject({ status: "draft", version: 1, level: "P3", subject: "Test Maths", marks: 2 });
      const mappings = await db.select().from(questionOutcomes).where(eq(questionOutcomes.questionId, created.questionId));
      expect(mappings.map((m) => m.role).sort()).toEqual(["primary", "secondary"]);
    });

    it("rejects a malformed draft and lists every problem", async () => {
      const bad = buildDraft(bed, { familyCode: uniqueCode(), marks: 0, estimatedSeconds: 1 });
      const error = await expectQuestionError(
        createQuestionDraft({ curriculumVersionId: bed.version.id, draft: bad }, admin(), ctx()),
        "invalid_draft",
      );
      expect(error.issues.join("\n")).toMatch(/marks/);
      expect(error.issues.join("\n")).toMatch(/estimatedSeconds/);
    });

    it("rejects an outcome from another curriculum version", async () => {
      const other = await createQuestionBed(db, "CX");
      const error = await expectQuestionError(
        createQuestionDraft(
          { curriculumVersionId: bed.version.id, draft: buildDraft(bed, { familyCode: uniqueCode(), primaryOutcomeCode: other.outcome.code }) },
          admin(),
          ctx(),
        ),
        "unknown_outcome",
      );
      expect(error.message).toContain(other.outcome.code);
      expect(error.message).toContain(bed.version.code);
    });

    it("rejects an unknown secondary outcome and a repeated outcome", async () => {
      await expectQuestionError(create({ secondaryOutcomeCodes: ["NOPE"] }), "unknown_outcome");
      await expectQuestionError(create({ secondaryOutcomeCodes: [bed.outcome.code] }), "invalid_draft");
    });

    it("puts a draft with an existing family code in that family as its next version", async () => {
      const first = await create();
      const second = await createQuestionDraft(
        { curriculumVersionId: bed.version.id, draft: buildDraft(bed, { familyCode: first.familyCode, marks: 3 }) },
        admin(),
        ctx(),
      );
      expect(second.familyId).toBe(first.familyId);
      expect(second.version).toBe(2);
    });

    it("writes an audit event with codes and ids only", async () => {
      const created = await create();
      const [event] = await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityType, "question"), eq(auditLogs.entityId, created.questionId)));
      expect(event).toMatchObject({ action: "question.created", actorProfileId: bed.admin.id });
      expect(event?.metadata).toMatchObject({ familyCode: created.familyCode, version: 1 });
    });

    it("refuses anyone who is not an admin", async () => {
      await expect(
        createQuestionDraft(
          { curriculumVersionId: bed.version.id, draft: buildDraft(bed, { familyCode: uniqueCode() }) },
          { profileId: bed.parent.id },
          ctx(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("reviseQuestion", () => {
    it("edits a draft in place", async () => {
      const created = await create();
      const result = await reviseQuestion(
        { questionId: created.questionId, draft: buildDraft(bed, { familyCode: created.familyCode, marks: 4, familyTitle: "Renamed" }) },
        admin(),
        ctx(),
      );
      expect(result).toMatchObject({ mode: "edited_in_place", questionId: created.questionId, version: 1 });
      const [row] = await db.select().from(questions).where(eq(questions.id, created.questionId));
      expect(row?.marks).toBe(4);
    });

    it("creates version + 1 as a draft when the question is approved, leaving the approved one untouched", async () => {
      const first = await approved();
      const result = await reviseQuestion(
        { questionId: first.questionId, draft: buildDraft(bed, { familyCode: first.familyCode, marks: 3 }) },
        admin(),
        ctx(),
      );
      expect(result).toMatchObject({ mode: "new_version", version: 2, familyId: first.familyId });
      expect(result.questionId).not.toBe(first.questionId);
      expect(await statusOf(first.questionId)).toBe("approved");
      expect(await statusOf(result.questionId)).toBe("draft");
      const [original] = await db.select().from(questions).where(eq(questions.id, first.questionId));
      expect(original?.marks).toBe(2);
      const [copy] = await db.select().from(questions).where(eq(questions.id, result.questionId));
      expect(copy?.supersedesQuestionId).toBe(first.questionId);
    });

    it("creates a new version from a retired question too", async () => {
      const first = await approved();
      await retireQuestion({ questionId: first.questionId, notes: "Wording" }, admin(), ctx());
      const result = await reviseQuestion(
        { questionId: first.questionId, draft: buildDraft(bed, { familyCode: first.familyCode }) },
        admin(),
        ctx(),
      );
      expect(result.mode).toBe("new_version");
    });

    it("does not edit a question that is in review, and does not move it to another family", async () => {
      const inReview = await toReview();
      await expectQuestionError(
        reviseQuestion({ questionId: inReview.questionId, draft: buildDraft(bed, { familyCode: inReview.familyCode }) }, admin(), ctx()),
        "not_editable",
      );
      const draft = await create();
      await expectQuestionError(
        reviseQuestion({ questionId: draft.questionId, draft: buildDraft(bed, { familyCode: "SOMEWHERE-ELSE" }) }, admin(), ctx()),
        "invalid_draft",
      );
    });

    it("approving the corrected version retires the version it replaces", async () => {
      const first = await approved();
      const second = await reviseQuestion(
        { questionId: first.questionId, draft: buildDraft(bed, { familyCode: first.familyCode, marks: 3 }) },
        admin(),
        ctx(),
      );
      await submitForReview({ questionId: second.questionId }, admin(), ctx());
      const result = await reviewQuestion({ questionId: second.questionId, decision: "approved", checklist: ticked }, admin(), ctx());
      expect(result.retiredPreviousVersionId).toBe(first.questionId);
      expect(await statusOf(first.questionId)).toBe("retired");
      expect(await statusOf(second.questionId)).toBe("approved");
    });
  });

  describe("submitForReview and reviewQuestion", () => {
    it("moves draft -> in review -> approved and records who approved and the checklist", async () => {
      const created = await toReview();
      expect(await statusOf(created.questionId)).toBe("in_review");
      const result = await reviewQuestion(
        { questionId: created.questionId, decision: "approved", checklist: ticked, notes: "Looks good" },
        admin(),
        ctx(),
      );
      expect(result.status).toBe("approved");
      const [row] = await db.select().from(questions).where(eq(questions.id, created.questionId));
      expect(row).toMatchObject({ status: "approved", approvedBy: bed.admin.id });
      expect(row?.approvedAt).toBeInstanceOf(Date);
      const [review] = await db.select().from(questionReviews).where(eq(questionReviews.questionId, created.questionId));
      expect(review).toMatchObject({ decision: "approved", reviewerId: bed.admin.id, checklist: ticked, notes: "Looks good" });
    });

    it("cannot approve a draft that was never submitted", async () => {
      const draft = await create();
      await expectQuestionError(
        reviewQuestion({ questionId: draft.questionId, decision: "approved", checklist: ticked }, admin(), ctx()),
        "invalid_transition",
      );
    });

    it("blocks approval when any checklist item is not ticked", async () => {
      const created = await toReview();
      const error = await expectQuestionError(
        reviewQuestion({ questionId: created.questionId, decision: "approved", checklist: { ...ticked, clarity: false } }, admin(), ctx()),
        "review_blocked",
      );
      expect(error.issues.join(" ")).toContain("wording is clear");
      expect(await statusOf(created.questionId)).toBe("in_review");
    });

    it("blocks approval when the deterministic answer check fails, whatever the checklist says", async () => {
      const created = await toReview({ answer: { kind: "number", value: "16.75", unit: "$" } });
      const error = await expectQuestionError(
        reviewQuestion({ questionId: created.questionId, decision: "approved", checklist: ticked }, admin(), ctx()),
        "review_blocked",
      );
      expect(error.issues.join(" ")).toMatch(/Expression gives 63\/4 but the stored answer is 16\.75/);
      expect(await statusOf(created.questionId)).toBe("in_review");
      expect(await db.select().from(questionReviews).where(eq(questionReviews.questionId, created.questionId))).toHaveLength(0);
    });

    it("accepts the answer tick as the human check when the verifier cannot check, and says so in the notes", async () => {
      const created = await createQuestionDraft(
        { curriculumVersionId: bed.version.id, draft: buildHumanCheckedDraft(bed, { familyCode: uniqueCode() }) },
        admin(),
        ctx(),
      );
      await submitForReview({ questionId: created.questionId }, admin(), ctx());
      await expectQuestionError(
        reviewQuestion({ questionId: created.questionId, decision: "approved", checklist: { ...ticked, answer: false } }, admin(), ctx()),
        "review_blocked",
      );
      await reviewQuestion({ questionId: created.questionId, decision: "approved", checklist: ticked }, admin(), ctx());
      const [review] = await db.select().from(questionReviews).where(eq(questionReviews.questionId, created.questionId));
      expect(review?.notes).toMatch(/confirmed by the reviewer/);
    });

    it("sends a question back to draft with a reason, and needs the reason", async () => {
      const created = await toReview();
      await expectQuestionError(
        reviewQuestion({ questionId: created.questionId, decision: "changes_requested", checklist: ticked }, admin(), ctx()),
        "review_blocked",
      );
      const result = await reviewQuestion(
        { questionId: created.questionId, decision: "changes_requested", checklist: { ...ticked, clarity: false }, notes: "Clearer wording" },
        admin(),
        ctx(),
      );
      expect(result.status).toBe("draft");
      expect(await statusOf(created.questionId)).toBe("draft");
    });

    it("writes an audit event for each step", async () => {
      const created = await approved();
      const detail = await getQuestionForAdmin(created.questionId, ctx());
      expect(detail?.events.map((e) => e.action).sort()).toEqual(["question.approved", "question.created", "question.submitted"]);
      expect(detail?.reviews).toHaveLength(1);
    });

    it("only admins may approve, and the system may not approve in production", async () => {
      const created = await toReview();
      await expect(
        reviewQuestion({ questionId: created.questionId, decision: "approved", checklist: ticked }, { profileId: bed.parent.id }, ctx()),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        reviewQuestion({ questionId: created.questionId, decision: "approved", checklist: ticked }, { system: true }, { db, nodeEnv: "production" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await reviewQuestion({ questionId: created.questionId, decision: "approved", checklist: ticked }, { system: true }, { db, nodeEnv: "development" });
      expect(await statusOf(created.questionId)).toBe("approved");
    });

    it("refuses to submit a stored question that no longer passes the schema", async () => {
      const created = await create();
      await db.update(questions).set({ marks: 9 }).where(eq(questions.id, created.questionId));
      await expectQuestionError(submitForReview({ questionId: created.questionId }, admin(), ctx()), "invalid_draft");
    });
  });

  describe("retireQuestion and candidates", () => {
    it("retires with a reason, records it, and stops the question being a generation candidate", async () => {
      const keep = await approved();
      const drop = await approved();
      const query = () =>
        listCandidateQuestions(
          { curriculumVersionId: bed.version.id, outcomeIds: [bed.outcome.id], level: "P3", subject: "Test Maths" },
          ctx(),
        );
      const before = (await query()).map((c) => c.questionId);
      expect(before).toEqual(expect.arrayContaining([keep.questionId, drop.questionId]));

      await expectQuestionError(retireQuestion({ questionId: drop.questionId, notes: " " }, admin(), ctx()), "review_blocked");
      await retireQuestion({ questionId: drop.questionId, notes: "Ambiguous wording" }, admin(), ctx());
      const after = (await query()).map((c) => c.questionId);
      expect(after).toContain(keep.questionId);
      expect(after).not.toContain(drop.questionId);
      const [review] = await db.select().from(questionReviews).where(and(eq(questionReviews.questionId, drop.questionId), eq(questionReviews.decision, "retired")));
      expect(review?.notes).toBe("Ambiguous wording");
      await expectQuestionError(retireQuestion({ questionId: drop.questionId, notes: "again" }, admin(), ctx()), "invalid_transition");
    });

    it("returns only approved questions, with their primary outcome, topic, type, difficulty, marks and family", async () => {
      const draftOnly = await create();
      const inReview = await toReview();
      const ok = await approved({ difficulty: "challenging", marks: 3 });
      const candidates = await listCandidateQuestions(
        { curriculumVersionId: bed.version.id, outcomeIds: [bed.outcome.id], level: "P3", subject: "Test Maths" },
        ctx(),
      );
      const ids = candidates.map((c) => c.questionId);
      expect(ids).not.toContain(draftOnly.questionId);
      expect(ids).not.toContain(inReview.questionId);
      expect(candidates.find((c) => c.questionId === ok.questionId)).toEqual({
        questionId: ok.questionId,
        familyId: ok.familyId,
        topicId: bed.topic.id,
        primaryOutcomeId: bed.outcome.id,
        questionType: "number",
        difficulty: "challenging",
        marks: 3,
        estimatedSeconds: 60,
      });
    });

    it("filters candidates by outcome, level and subject, and returns nothing without outcomes", async () => {
      const base = { curriculumVersionId: bed.version.id, level: "P3", subject: "Test Maths" };
      expect(await listCandidateQuestions({ ...base, outcomeIds: [] }, ctx())).toEqual([]);
      expect(await listCandidateQuestions({ ...base, outcomeIds: [bed.secondOutcome.id] }, ctx())).toEqual([]);
      expect(await listCandidateQuestions({ ...base, outcomeIds: [bed.outcome.id], level: "P4" }, ctx())).toEqual([]);
      expect(await listCandidateQuestions({ ...base, outcomeIds: [bed.outcome.id], subject: "Science" }, ctx())).toEqual([]);
    });
  });
});
