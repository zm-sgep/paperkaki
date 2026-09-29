import { ForbiddenError } from "@/application/errors";
import {
  QUESTION_STATUS_LABEL,
  QuestionError,
  assertTransition,
  decideReview,
  isEditableInPlace,
  verifyQuestionAnswer,
  type ReviewChecklist,
} from "@/domain/questions";
import { recordAuditEvent } from "@/lib/audit";
import type { Database } from "@/repositories/postgres/client";
import { getReadyDb } from "@/repositories/postgres/ready";
import {
  findFamilyByCode,
  getProfileRole,
  getQuestion,
  getQuestionOutcomes,
  getVersionForQuestions,
  insertFamily,
  insertQuestionVersion,
  insertReview,
  listFamilyVersions,
  resolveOutcomesInVersion,
  setQuestionStatus,
  updateDraftQuestion,
  updateFamilyTitle,
  type OutcomeAssignment,
  type QuestionWithFamily,
} from "@/repositories/postgres/questions";
import type { QuestionDraft } from "@/schemas/question-content";
import { assetAssignments, draftColumns, parseDraft, rowToDraftInput, safeParseDraft } from "../question-drafts";

/**
 * Question-bank commands (M2-01, M2-03, M2-04, ADR-0004). Only admins may run them.
 *
 *   createQuestionDraft   a new draft version (creating the family when needed)
 *   reviseQuestion        draft: edited in place. Approved or retired: a NEW draft version.
 *   submitForReview       draft -> in review
 *   reviewQuestion        in review -> approved, or back to draft with a reason
 *   retireQuestion        any live version -> retired (never a generation candidate again)
 *
 * Every step that changes a question writes an audit event (ids and codes only). Review
 * decisions also write a question_reviews row. Approved and retired versions never change:
 * the database trigger refuses it even if this code were bypassed.
 */

/** A signed-in admin, or the system itself (development seed and importers). */
export type QuestionActor = { profileId: string } | { system: true };

export type QuestionCommandContext = {
  db?: Database;
  requestId?: string | null;
  now?: Date;
  /** Defaults to process.env.NODE_ENV. The system actor may not approve or retire in production. */
  nodeEnv?: string | undefined;
};

async function resolveDb(context: QuestionCommandContext): Promise<Database> {
  return context.db ?? (await getReadyDb());
}

function actorProfileId(actor: QuestionActor): string | null {
  return "profileId" in actor ? actor.profileId : null;
}

/** Repeated inside every command: server actions are public endpoints. */
async function assertAdminActor(db: Database, actor: QuestionActor, context: QuestionCommandContext, decides = false) {
  if ("system" in actor) {
    const nodeEnv = "nodeEnv" in context ? context.nodeEnv : process.env.NODE_ENV;
    if (decides && nodeEnv === "production") {
      throw new ForbiddenError("The system cannot approve or retire questions in production.");
    }
    return;
  }
  if ((await getProfileRole(db, actor.profileId)) !== "admin") {
    throw new ForbiddenError("Only an admin can change the question bank.");
  }
}

function outcomeCodesOf(draft: QuestionDraft): string[] {
  return [draft.primaryOutcomeCode, ...draft.secondaryOutcomeCodes];
}

/** Resolves a draft's outcome codes inside ONE curriculum version. Out-of-version codes are refused. */
async function resolveDraftOutcomes(
  db: Database,
  version: { id: string; code: string },
  draft: QuestionDraft,
): Promise<{ level: string; assignments: OutcomeAssignment[] }> {
  const codes = outcomeCodesOf(draft);
  const duplicated = codes.filter((code, index) => codes.indexOf(code) !== index);
  if (duplicated.length > 0) {
    throw new QuestionError("invalid_draft", "An outcome can only be mapped once per question.", [
      `Outcome ${[...new Set(duplicated)].join(", ")} is listed more than once.`,
    ]);
  }
  const found = await resolveOutcomesInVersion(db, version.id, codes);
  const missing = codes.filter((code) => !found.has(code));
  if (missing.length > 0) {
    throw new QuestionError(
      "unknown_outcome",
      `Outcome ${missing.join(", ")} is not part of curriculum version ${version.code}.`,
      missing.map((code) => `${code} is not an outcome of ${version.code}`),
    );
  }
  const primary = found.get(draft.primaryOutcomeCode);
  if (!primary) throw new QuestionError("unknown_outcome", "The primary outcome was not found.");
  return {
    level: primary.level,
    assignments: [
      { outcomeId: primary.id, role: "primary" },
      ...draft.secondaryOutcomeCodes.map((code) => ({ outcomeId: (found.get(code) as { id: string }).id, role: "secondary" as const })),
    ],
  };
}

async function requireUsableVersion(db: Database, curriculumVersionId: string) {
  const version = await getVersionForQuestions(db, curriculumVersionId);
  if (!version) throw new QuestionError("curriculum_unavailable", "That curriculum version was not found.");
  if (version.status === "retired") {
    throw new QuestionError("curriculum_unavailable", `Curriculum version ${version.code} is retired; questions cannot be added to it.`);
  }
  return version;
}

export type CreatedQuestion = { questionId: string; familyId: string; familyCode: string; version: number };

/**
 * Inserts one draft version. Shared by createQuestionDraft, reviseQuestion and the importer, so
 * every route into the bank applies the same validation.
 */
export async function insertDraftVersion(
  tx: Database,
  input: {
    version: { id: string; code: string; subject: string };
    draft: QuestionDraft;
    actor: QuestionActor;
    supersedesQuestionId?: string | null;
    requestId?: string | null;
    auditAction?: string;
  },
): Promise<CreatedQuestion> {
  const { draft, version } = input;
  const resolved = await resolveDraftOutcomes(tx, version, draft);

  let family = await findFamilyByCode(tx, version.id, draft.familyCode);
  if (!family) {
    family = await insertFamily(tx, { code: draft.familyCode, title: draft.familyTitle, curriculumVersionId: version.id });
  } else if (family.title !== draft.familyTitle) {
    await updateFamilyTitle(tx, family.id, draft.familyTitle);
  }
  const versions = await listFamilyVersions(tx, family.id);
  const nextVersion = versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;

  const row = await insertQuestionVersion(
    tx,
    {
      ...draftColumns(draft, { level: resolved.level, subject: version.subject }),
      familyId: family.id,
      version: nextVersion,
      status: "draft",
      curriculumVersionId: version.id,
      supersedesQuestionId: input.supersedesQuestionId ?? null,
      createdBy: actorProfileId(input.actor),
    },
    resolved.assignments,
    assetAssignments(draft),
  );
  await recordAuditEvent(tx, {
    action: input.auditAction ?? "question.created",
    entityType: "question",
    entityId: row.id,
    actorProfileId: actorProfileId(input.actor),
    metadata: {
      familyCode: family.code,
      version: nextVersion,
      curriculumVersionId: version.id,
      ...(input.supersedesQuestionId ? { supersedesQuestionId: input.supersedesQuestionId } : {}),
    },
    requestId: input.requestId ?? null,
  });
  return { questionId: row.id, familyId: family.id, familyCode: family.code, version: nextVersion };
}

/**
 * Creates a draft. Validates it with QuestionDraftSchema and resolves its outcome codes within
 * the given curriculum version: a code from another version is refused. When the family code
 * already exists in that version the draft becomes its next version.
 */
export async function createQuestionDraft(
  input: { curriculumVersionId: string; draft: unknown },
  actor: QuestionActor,
  context: QuestionCommandContext = {},
): Promise<CreatedQuestion> {
  const db = await resolveDb(context);
  await assertAdminActor(db, actor, context);
  const draft = parseDraft(input.draft);
  return db.transaction(async (tx) => {
    const version = await requireUsableVersion(tx, input.curriculumVersionId);
    return insertDraftVersion(tx, { version, draft, actor, requestId: context.requestId });
  });
}

export type RevisionResult = CreatedQuestion & { mode: "edited_in_place" | "new_version" };

/**
 * A draft is edited in place. An approved or retired question is never edited: this creates
 * version + 1 as a new draft in the same family (ADR-0004). A question in review must first be
 * sent back with "request changes".
 */
export async function reviseQuestion(
  input: { questionId: string; draft: unknown },
  actor: QuestionActor,
  context: QuestionCommandContext = {},
): Promise<RevisionResult> {
  const db = await resolveDb(context);
  await assertAdminActor(db, actor, context);
  const draft = parseDraft(input.draft);
  return db.transaction(async (tx) => {
    const existing = await getQuestion(tx, input.questionId);
    if (!existing) throw new QuestionError("not_found", "That question was not found.");
    if (draft.familyCode !== existing.familyCode) {
      throw new QuestionError("invalid_draft", "A question cannot move to another family. Create a new question instead.", [
        `familyCode: must stay ${existing.familyCode}`,
      ]);
    }
    const version = await requireUsableVersion(tx, existing.curriculumVersionId);

    if (isEditableInPlace(existing.status)) {
      const resolved = await resolveDraftOutcomes(tx, version, draft);
      if (existing.familyTitle !== draft.familyTitle) await updateFamilyTitle(tx, existing.familyId, draft.familyTitle);
      await updateDraftQuestion(
        tx,
        existing.id,
        draftColumns(draft, { level: resolved.level, subject: version.subject }),
        resolved.assignments,
        assetAssignments(draft),
      );
      await recordAuditEvent(tx, {
        action: "question.edited",
        entityType: "question",
        entityId: existing.id,
        actorProfileId: actorProfileId(actor),
        metadata: { familyCode: existing.familyCode, version: existing.version },
        requestId: context.requestId ?? null,
      });
      return { questionId: existing.id, familyId: existing.familyId, familyCode: existing.familyCode, version: existing.version, mode: "edited_in_place" as const };
    }

    if (existing.status === "in_review") {
      throw new QuestionError(
        "not_editable",
        "This question is in review. Ask for changes first, then edit the draft.",
      );
    }
    const created = await insertDraftVersion(tx, {
      version,
      draft,
      actor,
      supersedesQuestionId: existing.id,
      requestId: context.requestId,
      auditAction: "question.revised",
    });
    return { ...created, mode: "new_version" as const };
  });
}

async function loadQuestion(db: Database, questionId: string): Promise<QuestionWithFamily> {
  const row = await getQuestion(db, questionId);
  if (!row) throw new QuestionError("not_found", "That question was not found.");
  return row;
}

/** Draft -> in review. The stored question must still pass the schema. */
export async function submitForReview(
  input: { questionId: string },
  actor: QuestionActor,
  context: QuestionCommandContext = {},
): Promise<void> {
  const db = await resolveDb(context);
  await assertAdminActor(db, actor, context);
  await db.transaction(async (tx) => {
    const row = await loadQuestion(tx, input.questionId);
    assertTransition(row.status, "in_review");
    parseDraft(rowToDraftInput(row, await getQuestionOutcomes(tx, row.id)));
    await setQuestionStatus(tx, row.id, "in_review");
    await recordAuditEvent(tx, {
      action: "question.submitted",
      entityType: "question",
      entityId: row.id,
      actorProfileId: actorProfileId(actor),
      metadata: { familyCode: row.familyCode, version: row.version },
      requestId: context.requestId ?? null,
    });
  });
}

export type ReviewResult = { status: "approved" | "draft"; retiredPreviousVersionId: string | null };

/**
 * Approve or send back a question that is in review.
 *  - Approve needs every checklist item ticked and the deterministic answer check to pass. If the
 *    check says a person must confirm the answer, the "answer is correct" tick is that check and
 *    is recorded in the notes.
 *  - Request changes needs a reason and returns the question to draft.
 * Approving a version that corrects an earlier one retires the earlier one.
 */
export async function reviewQuestion(
  input: { questionId: string; decision: "approved" | "changes_requested"; checklist: ReviewChecklist; notes?: string },
  actor: QuestionActor,
  context: QuestionCommandContext = {},
): Promise<ReviewResult> {
  const db = await resolveDb(context);
  await assertAdminActor(db, actor, context, true);
  const now = context.now ?? new Date();
  return db.transaction(async (tx) => {
    const row = await loadQuestion(tx, input.questionId);
    const target = input.decision === "approved" ? "approved" : "draft";
    assertTransition(row.status, target);

    const parsed = safeParseDraft(rowToDraftInput(row, await getQuestionOutcomes(tx, row.id)));
    if (input.decision === "approved" && !parsed.ok) {
      throw new QuestionError(
        "review_blocked",
        "This question is not valid, so it cannot be approved.",
        parsed.issues.map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message)),
      );
    }
    const verification =
      input.decision === "approved" && parsed.ok
        ? verifyQuestionAnswer(parsed.draft)
        : ({ ok: true } as const);
    const outcome = decideReview({
      decision: input.decision,
      checklist: input.checklist,
      notes: input.notes ?? "",
      verification,
    });
    if (!outcome.ok) {
      throw new QuestionError("review_blocked", outcome.reasons[0] ?? "This review cannot be recorded.", outcome.reasons);
    }

    await insertReview(tx, {
      questionId: row.id,
      reviewerId: actorProfileId(actor),
      decision: input.decision,
      checklist: { ...input.checklist },
      notes: outcome.notes,
    });
    if (input.decision === "approved") {
      await setQuestionStatus(tx, row.id, "approved", { approvedBy: actorProfileId(actor), approvedAt: now });
    } else {
      await setQuestionStatus(tx, row.id, "draft");
    }
    await recordAuditEvent(tx, {
      action: input.decision === "approved" ? "question.approved" : "question.changes_requested",
      entityType: "question",
      entityId: row.id,
      actorProfileId: actorProfileId(actor),
      metadata: { familyCode: row.familyCode, version: row.version },
      requestId: context.requestId ?? null,
    });

    let retiredPreviousVersionId: string | null = null;
    if (input.decision === "approved" && row.supersedesQuestionId) {
      const previous = await getQuestion(tx, row.supersedesQuestionId);
      if (previous && previous.status === "approved") {
        await retireInTransaction(tx, previous, actor, `Replaced by version ${row.version}.`, context);
        retiredPreviousVersionId = previous.id;
      }
    }
    return { status: target, retiredPreviousVersionId };
  });
}

async function retireInTransaction(
  tx: Database,
  row: QuestionWithFamily,
  actor: QuestionActor,
  reason: string,
  context: QuestionCommandContext,
): Promise<void> {
  assertTransition(row.status, "retired");
  await insertReview(tx, {
    questionId: row.id,
    reviewerId: actorProfileId(actor),
    decision: "retired",
    checklist: { curriculum: false, answer: false, clarity: false, ageAppropriate: false },
    notes: reason,
  });
  await setQuestionStatus(tx, row.id, "retired");
  await recordAuditEvent(tx, {
    action: "question.retired",
    entityType: "question",
    entityId: row.id,
    actorProfileId: actorProfileId(actor),
    metadata: { familyCode: row.familyCode, version: row.version, previousStatus: row.status },
    requestId: context.requestId ?? null,
  });
}

/** Takes a question out of use for good. Retired questions are never generation candidates. */
export async function retireQuestion(
  input: { questionId: string; notes: string },
  actor: QuestionActor,
  context: QuestionCommandContext = {},
): Promise<void> {
  const db = await resolveDb(context);
  await assertAdminActor(db, actor, context, true);
  const outcome = decideReview({
    decision: "retired",
    checklist: { curriculum: false, answer: false, clarity: false, ageAppropriate: false },
    notes: input.notes,
    verification: { ok: true },
  });
  if (!outcome.ok) throw new QuestionError("review_blocked", outcome.reasons[0] ?? "Say why.", outcome.reasons);
  await db.transaction(async (tx) => {
    const row = await loadQuestion(tx, input.questionId);
    if (row.status === "retired") {
      throw new QuestionError("invalid_transition", `${QUESTION_STATUS_LABEL[row.status]} questions cannot be retired again.`);
    }
    await retireInTransaction(tx, row, actor, outcome.notes ?? "", context);
  });
}
