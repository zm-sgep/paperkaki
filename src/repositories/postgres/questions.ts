import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Candidate } from "@/domain/papers";
import type { Database } from "./client";
import {
  auditLogs,
  curriculumOutcomes,
  curriculumTopics,
  curriculumVersions,
  parentProfiles,
  questionAssets,
  questionFamilies,
  questionOutcomes,
  questionReviews,
  questions,
  subjects,
  type NewQuestionRow,
  type QuestionAssetRow,
  type QuestionFamily,
  type QuestionRow,
} from "./schema";

/**
 * Question bank reads and writes. Business rules (who may do what, what may be approved) live
 * in src/domain/questions and src/application/commands/questions.ts; the database trigger in
 * drizzle/0004_question_immutability.sql is the last line of defence.
 */

export type QuestionWithFamily = QuestionRow & { familyCode: string; familyTitle: string };

export type OutcomeMapping = {
  outcomeId: string;
  code: string;
  role: "primary" | "secondary" | "prerequisite";
  statement: string;
  childLabel: string;
  topicId: string;
  topicTitle: string;
};

// ---------------------------------------------------------------------------
// Curriculum lookups scoped to one version
// ---------------------------------------------------------------------------

export type ResolvedOutcome = { id: string; code: string; level: string; topicId: string };

/** The outcomes with these codes in ONE curriculum version. Codes not in that version are absent. */
export async function resolveOutcomesInVersion(
  db: Database,
  versionId: string,
  codes: readonly string[],
): Promise<Map<string, ResolvedOutcome>> {
  if (codes.length === 0) return new Map();
  const rows = await db
    .select({
      id: curriculumOutcomes.id,
      code: curriculumOutcomes.code,
      level: curriculumOutcomes.level,
      topicId: curriculumOutcomes.topicId,
    })
    .from(curriculumOutcomes)
    .where(and(eq(curriculumOutcomes.curriculumVersionId, versionId), inArray(curriculumOutcomes.code, [...codes])));
  return new Map(rows.map((row) => [row.code, row]));
}

/** The version's status and subject name, or null when it does not exist. */
export async function getVersionForQuestions(db: Database, versionId: string) {
  const [row] = await db
    .select({
      id: curriculumVersions.id,
      code: curriculumVersions.code,
      status: curriculumVersions.status,
      subject: subjects.name,
    })
    .from(curriculumVersions)
    .innerJoin(subjects, eq(subjects.id, curriculumVersions.subjectId))
    .where(eq(curriculumVersions.id, versionId))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Families and versions
// ---------------------------------------------------------------------------

export async function findFamilyByCode(db: Database, versionId: string, code: string): Promise<QuestionFamily | null> {
  const [row] = await db
    .select()
    .from(questionFamilies)
    .where(and(eq(questionFamilies.curriculumVersionId, versionId), eq(questionFamilies.code, code)))
    .limit(1);
  return row ?? null;
}

export async function insertFamily(
  db: Database,
  input: { code: string; title: string; curriculumVersionId: string },
): Promise<QuestionFamily> {
  const [row] = await db.insert(questionFamilies).values(input).returning();
  if (!row) throw new Error("Question family was not stored.");
  return row;
}

export async function updateFamilyTitle(db: Database, familyId: string, title: string): Promise<void> {
  await db.update(questionFamilies).set({ title }).where(eq(questionFamilies.id, familyId));
}

/** Every version of a family, oldest first. */
export async function listFamilyVersions(db: Database, familyId: string): Promise<QuestionRow[]> {
  return db.select().from(questions).where(eq(questions.familyId, familyId)).orderBy(asc(questions.version));
}

export async function getQuestion(db: Database, questionId: string): Promise<QuestionWithFamily | null> {
  const [row] = await db
    .select({ question: questions, familyCode: questionFamilies.code, familyTitle: questionFamilies.title })
    .from(questions)
    .innerJoin(questionFamilies, eq(questionFamilies.id, questions.familyId))
    .where(eq(questions.id, questionId))
    .limit(1);
  return row ? { ...row.question, familyCode: row.familyCode, familyTitle: row.familyTitle } : null;
}

export async function getQuestionOutcomes(db: Database, questionId: string): Promise<OutcomeMapping[]> {
  const rows = await db
    .select({
      outcomeId: curriculumOutcomes.id,
      code: curriculumOutcomes.code,
      role: questionOutcomes.role,
      statement: curriculumOutcomes.statement,
      childLabel: curriculumOutcomes.childLabel,
      topicId: curriculumTopics.id,
      topicTitle: curriculumTopics.title,
    })
    .from(questionOutcomes)
    .innerJoin(curriculumOutcomes, eq(curriculumOutcomes.id, questionOutcomes.outcomeId))
    .innerJoin(curriculumTopics, eq(curriculumTopics.id, curriculumOutcomes.topicId))
    .where(eq(questionOutcomes.questionId, questionId))
    .orderBy(
      sql`case ${questionOutcomes.role} when 'primary' then 0 when 'secondary' then 1 else 2 end`,
      asc(curriculumOutcomes.code),
    );
  return rows;
}

export async function getQuestionAssets(db: Database, questionId: string): Promise<QuestionAssetRow[]> {
  return db.select().from(questionAssets).where(eq(questionAssets.questionId, questionId)).orderBy(asc(questionAssets.objectKey));
}

export type OutcomeAssignment = { outcomeId: string; role: "primary" | "secondary" | "prerequisite" };
export type AssetAssignment = { objectKey: string; alt: string; contentType: string };

async function replaceMappings(
  db: Database,
  questionId: string,
  outcomes: readonly OutcomeAssignment[],
  assets: readonly AssetAssignment[],
): Promise<void> {
  await db.delete(questionOutcomes).where(eq(questionOutcomes.questionId, questionId));
  if (outcomes.length > 0) {
    await db.insert(questionOutcomes).values(outcomes.map((o) => ({ questionId, outcomeId: o.outcomeId, role: o.role })));
  }
  await db.delete(questionAssets).where(eq(questionAssets.questionId, questionId));
  if (assets.length > 0) {
    await db.insert(questionAssets).values(assets.map((a) => ({ questionId, bucket: "question-assets", ...a })));
  }
}

/** Inserts a new draft version with its outcome mappings and asset references. */
export async function insertQuestionVersion(
  db: Database,
  values: NewQuestionRow,
  outcomes: readonly OutcomeAssignment[],
  assets: readonly AssetAssignment[],
): Promise<QuestionRow> {
  const [row] = await db.insert(questions).values(values).returning();
  if (!row) throw new Error("Question was not stored.");
  await replaceMappings(db, row.id, outcomes, assets);
  return row;
}

export type DraftColumns = Omit<
  NewQuestionRow,
  "id" | "familyId" | "version" | "status" | "curriculumVersionId" | "createdBy" | "createdAt" | "approvedAt" | "approvedBy" | "supersedesQuestionId"
>;

/** Replaces the content of a DRAFT version in place (the database refuses it for any other status). */
export async function updateDraftQuestion(
  db: Database,
  questionId: string,
  values: DraftColumns,
  outcomes: readonly OutcomeAssignment[],
  assets: readonly AssetAssignment[],
): Promise<void> {
  await db.update(questions).set(values).where(eq(questions.id, questionId));
  await replaceMappings(db, questionId, outcomes, assets);
}

export async function setQuestionStatus(
  db: Database,
  questionId: string,
  status: QuestionRow["status"],
  approval?: { approvedBy: string | null; approvedAt: Date },
): Promise<void> {
  await db
    .update(questions)
    .set(approval ? { status, approvedBy: approval.approvedBy, approvedAt: approval.approvedAt } : { status })
    .where(eq(questions.id, questionId));
}

export async function insertReview(
  db: Database,
  input: {
    questionId: string;
    reviewerId: string | null;
    decision: "approved" | "changes_requested" | "retired";
    checklist: Record<string, boolean>;
    notes: string | null;
  },
): Promise<void> {
  await db.insert(questionReviews).values(input);
}

export async function getProfileRole(db: Database, profileId: string): Promise<"parent" | "admin" | null> {
  const [row] = await db
    .select({ role: parentProfiles.role })
    .from(parentProfiles)
    .where(eq(parentProfiles.id, profileId))
    .limit(1);
  return row?.role ?? null;
}

/** Ids of draft versions in the named families of one curriculum version, in family and version order. */
export async function listDraftIdsInFamilies(db: Database, versionId: string, familyCodes: readonly string[]): Promise<string[]> {
  if (familyCodes.length === 0) return [];
  const rows = await db
    .select({ id: questions.id })
    .from(questions)
    .innerJoin(questionFamilies, eq(questionFamilies.id, questions.familyId))
    .where(
      and(
        eq(questions.curriculumVersionId, versionId),
        eq(questions.status, "draft"),
        inArray(questionFamilies.code, [...familyCodes]),
      ),
    )
    .orderBy(asc(questionFamilies.code), asc(questions.version));
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Admin list (M2-06)
// ---------------------------------------------------------------------------

export const ADMIN_PAGE_SIZE = 25;

export type QuestionListFilters = {
  level?: string;
  topicId?: string;
  outcomeId?: string;
  questionType?: QuestionRow["questionType"];
  difficulty?: QuestionRow["difficulty"];
  status?: QuestionRow["status"];
};

export type QuestionListRow = {
  id: string;
  familyId: string;
  familyCode: string;
  familyTitle: string;
  version: number;
  status: QuestionRow["status"];
  level: string;
  questionType: QuestionRow["questionType"];
  difficulty: QuestionRow["difficulty"];
  marks: number;
  content: unknown;
  primaryOutcomeId: string;
  primaryOutcomeCode: string;
  topicId: string;
  topicTitle: string;
};

export type QuestionListPage = { rows: QuestionListRow[]; total: number; page: number; pageSize: number; pageCount: number };

function filterConditions(filters: QuestionListFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.level) conditions.push(eq(questions.level, filters.level));
  if (filters.questionType) conditions.push(eq(questions.questionType, filters.questionType));
  if (filters.difficulty) conditions.push(eq(questions.difficulty, filters.difficulty));
  if (filters.status) conditions.push(eq(questions.status, filters.status));
  if (filters.topicId) conditions.push(eq(curriculumOutcomes.topicId, filters.topicId));
  if (filters.outcomeId) {
    conditions.push(
      sql`exists (select 1 from ${questionOutcomes} qo where qo.question_id = ${questions.id} and qo.outcome_id = ${filters.outcomeId})`,
    );
  }
  return conditions;
}

/** One page of questions, filters combined with AND. Topic is the topic of the PRIMARY outcome. */
export async function listQuestionsPage(
  db: Database,
  filters: QuestionListFilters,
  page: number,
  pageSize = ADMIN_PAGE_SIZE,
): Promise<QuestionListPage> {
  const where = and(...filterConditions(filters));
  const base = db
    .select({
      id: questions.id,
      familyId: questions.familyId,
      familyCode: questionFamilies.code,
      familyTitle: questionFamilies.title,
      version: questions.version,
      status: questions.status,
      level: questions.level,
      questionType: questions.questionType,
      difficulty: questions.difficulty,
      marks: questions.marks,
      content: questions.content,
      primaryOutcomeId: curriculumOutcomes.id,
      primaryOutcomeCode: curriculumOutcomes.code,
      topicId: curriculumTopics.id,
      topicTitle: curriculumTopics.title,
    })
    .from(questions)
    .innerJoin(questionFamilies, eq(questionFamilies.id, questions.familyId))
    .innerJoin(questionOutcomes, and(eq(questionOutcomes.questionId, questions.id), eq(questionOutcomes.role, "primary")))
    .innerJoin(curriculumOutcomes, eq(curriculumOutcomes.id, questionOutcomes.outcomeId))
    .innerJoin(curriculumTopics, eq(curriculumTopics.id, curriculumOutcomes.topicId))
    .where(where);

  const [totalRow] = await db
    .select({ total: count() })
    .from(questions)
    .innerJoin(questionOutcomes, and(eq(questionOutcomes.questionId, questions.id), eq(questionOutcomes.role, "primary")))
    .innerJoin(curriculumOutcomes, eq(curriculumOutcomes.id, questionOutcomes.outcomeId))
    .where(where);
  const total = totalRow?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);

  const rows = await base
    .orderBy(asc(questionFamilies.code), asc(questions.version), asc(questions.id))
    .limit(pageSize)
    .offset((current - 1) * pageSize);
  return { rows, total, page: current, pageSize, pageCount };
}

// ---------------------------------------------------------------------------
// Generation candidates (M4-02)
// ---------------------------------------------------------------------------

export type CandidateQuestion = Candidate & { estimatedSeconds: number };

/** Approved questions only, from one curriculum version, whose PRIMARY outcome is one of `outcomeIds`. */
export async function listApprovedCandidates(
  db: Database,
  input: { curriculumVersionId: string; outcomeIds: readonly string[]; level: string; subject: string },
): Promise<CandidateQuestion[]> {
  if (input.outcomeIds.length === 0) return [];
  const rows = await db
    .select({
      questionId: questions.id,
      familyId: questions.familyId,
      topicId: curriculumOutcomes.topicId,
      primaryOutcomeId: questionOutcomes.outcomeId,
      questionType: questions.questionType,
      difficulty: questions.difficulty,
      marks: questions.marks,
      estimatedSeconds: questions.estimatedSeconds,
    })
    .from(questions)
    .innerJoin(questionOutcomes, and(eq(questionOutcomes.questionId, questions.id), eq(questionOutcomes.role, "primary")))
    .innerJoin(curriculumOutcomes, eq(curriculumOutcomes.id, questionOutcomes.outcomeId))
    .where(
      and(
        eq(questions.status, "approved"),
        eq(questions.curriculumVersionId, input.curriculumVersionId),
        eq(questions.subject, input.subject),
        eq(questions.level, input.level),
        inArray(questionOutcomes.outcomeId, [...input.outcomeIds]),
      ),
    )
    .orderBy(asc(questions.id));
  return rows;
}

// ---------------------------------------------------------------------------
// Review trail
// ---------------------------------------------------------------------------

export type ReviewTrailEntry = {
  id: string;
  decision: "approved" | "changes_requested" | "retired";
  checklist: Record<string, boolean>;
  notes: string | null;
  createdAt: Date;
  reviewerName: string | null;
};

export async function listReviews(db: Database, questionId: string): Promise<ReviewTrailEntry[]> {
  return db
    .select({
      id: questionReviews.id,
      decision: questionReviews.decision,
      checklist: questionReviews.checklist,
      notes: questionReviews.notes,
      createdAt: questionReviews.createdAt,
      reviewerName: sql<string | null>`coalesce(${parentProfiles.displayName}, ${parentProfiles.email})`,
    })
    .from(questionReviews)
    .leftJoin(parentProfiles, eq(parentProfiles.id, questionReviews.reviewerId))
    .where(eq(questionReviews.questionId, questionId))
    .orderBy(desc(questionReviews.createdAt), desc(questionReviews.id));
}

export type QuestionEvent = { id: number; action: string; createdAt: Date; actorName: string | null; metadata: Record<string, unknown> };

export async function listQuestionEvents(db: Database, questionId: string): Promise<QuestionEvent[]> {
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      createdAt: auditLogs.createdAt,
      actorName: sql<string | null>`coalesce(${parentProfiles.displayName}, ${parentProfiles.email})`,
      metadata: auditLogs.metadata,
    })
    .from(auditLogs)
    .leftJoin(parentProfiles, eq(parentProfiles.id, auditLogs.actorProfileId))
    .where(and(eq(auditLogs.entityType, "question"), eq(auditLogs.entityId, questionId)))
    .orderBy(desc(auditLogs.id));
}

/** Every approved question with its mappings, for the quality suite. */
export async function listApprovedWithMappings(db: Database) {
  const rows = await db
    .select({
      question: questions,
      familyCode: questionFamilies.code,
      familyCurriculumVersionId: questionFamilies.curriculumVersionId,
    })
    .from(questions)
    .innerJoin(questionFamilies, eq(questionFamilies.id, questions.familyId))
    .where(eq(questions.status, "approved"))
    .orderBy(asc(questionFamilies.code), asc(questions.version));
  const mappings = await db
    .select({
      questionId: questionOutcomes.questionId,
      outcomeId: questionOutcomes.outcomeId,
      role: questionOutcomes.role,
      outcomeVersionId: curriculumOutcomes.curriculumVersionId,
    })
    .from(questionOutcomes)
    .innerJoin(curriculumOutcomes, eq(curriculumOutcomes.id, questionOutcomes.outcomeId))
    .innerJoin(questions, eq(questions.id, questionOutcomes.questionId))
    .where(eq(questions.status, "approved"));
  const assets = await db
    .select({ questionId: questionAssets.questionId, bucket: questionAssets.bucket, objectKey: questionAssets.objectKey })
    .from(questionAssets)
    .innerJoin(questions, eq(questions.id, questionAssets.questionId))
    .where(eq(questions.status, "approved"));
  return { rows, mappings, assets };
}
