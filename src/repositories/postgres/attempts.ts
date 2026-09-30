import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  assessments,
  attemptResponses,
  attemptSessions,
  children,
  paperQuestions,
  papers,
  questions,
  type AttemptResponseRow,
  type AttemptSession,
  type QuestionRow,
} from "./schema";

/**
 * Persistence for attempts (M6). Every read that starts from an attempt id takes who is asking:
 * a child (only their own attempts) or a parent (only their own children's). A mismatch simply
 * returns nothing, so a wrong id and someone else's id look the same.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

export type AttemptScope = { childId: string } | { parentProfileId: string };

export type AttemptHeader = {
  attempt: AttemptSession;
  paperId: string;
  paperNumber: number;
  assessmentId: string;
  assessmentName: string;
  assessmentSubject: string;
  childNickname: string;
  parentProfileId: string;
  questionCount: number;
  totalMarks: number;
};

async function paperTotals(db: Database, paperId: string): Promise<{ questionCount: number; totalMarks: number }> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int`, marks: sql<number>`coalesce(sum(${paperQuestions.marks}), 0)::int` })
    .from(paperQuestions)
    .where(eq(paperQuestions.paperId, paperId));
  return { questionCount: row?.count ?? 0, totalMarks: row?.marks ?? 0 };
}

function scopeCondition(scope: AttemptScope) {
  return "childId" in scope ? eq(attemptSessions.childId, scope.childId) : eq(children.parentProfileId, scope.parentProfileId);
}

function headerSelect(db: Database) {
  return db
    .select({
      attempt: attemptSessions,
      paperNumber: papers.number,
      assessmentId: assessments.id,
      assessmentName: assessments.name,
      assessmentSubject: assessments.subject,
      childNickname: children.nickname,
      parentProfileId: children.parentProfileId,
      archivedAt: children.archivedAt,
    })
    .from(attemptSessions)
    .innerJoin(papers, eq(papers.id, attemptSessions.paperId))
    .innerJoin(assessments, eq(assessments.id, papers.assessmentId))
    .innerJoin(children, eq(children.id, attemptSessions.childId));
}

/** One attempt with what its screens need, only if it belongs to whoever is asking. */
export async function getAttemptHeader(db: Database, attemptId: string, scope: AttemptScope): Promise<AttemptHeader | null> {
  if (!isUuid(attemptId)) return null;
  const [row] = await headerSelect(db)
    .where(and(eq(attemptSessions.id, attemptId), scopeCondition(scope)))
    .limit(1);
  if (!row || row.archivedAt) return null;
  const totals = await paperTotals(db, row.attempt.paperId);
  return { ...row, paperId: row.attempt.paperId, ...totals };
}

/** A child's attempts that still need something from them (assigned or in progress), newest first. */
export async function listOpenAttemptHeaders(db: Database, childId: string): Promise<AttemptHeader[]> {
  const rows = await headerSelect(db)
    .where(and(eq(attemptSessions.childId, childId), inArray(attemptSessions.status, ["assigned", "in_progress"])))
    .orderBy(desc(attemptSessions.assignedAt));
  return Promise.all(
    rows
      .filter((row) => !row.archivedAt)
      .map(async (row) => ({ ...row, paperId: row.attempt.paperId, ...(await paperTotals(db, row.attempt.paperId)) })),
  );
}

/** Every attempt of these children, for a parent's Home. Newest first. */
export async function listAttemptHeadersForParent(db: Database, parentProfileId: string): Promise<AttemptHeader[]> {
  const rows = await headerSelect(db)
    .where(eq(children.parentProfileId, parentProfileId))
    .orderBy(desc(attemptSessions.assignedAt));
  return rows
    .filter((row) => !row.archivedAt)
    .map((row) => ({ ...row, paperId: row.attempt.paperId, questionCount: 0, totalMarks: 0 }));
}

/** Attempts of one paper, newest first. The paper is already known to be the parent's. */
export async function listAttemptsForPaper(db: Database, paperId: string): Promise<AttemptSession[]> {
  return db.select().from(attemptSessions).where(eq(attemptSessions.paperId, paperId)).orderBy(desc(attemptSessions.assignedAt));
}

export async function findOpenAttempt(db: Database, paperId: string, childId: string): Promise<AttemptSession | null> {
  const [row] = await db
    .select()
    .from(attemptSessions)
    .where(and(eq(attemptSessions.paperId, paperId), eq(attemptSessions.childId, childId), inArray(attemptSessions.status, ["assigned", "in_progress"])))
    .limit(1);
  return row ?? null;
}

export type AttemptPaperQuestion = {
  paperQuestionId: string;
  position: number;
  sectionCode: string;
  marks: number;
  question: QuestionRow;
};

/** The frozen paper's questions in order, with the exact question versions. */
export async function listAttemptPaperQuestions(db: Database, paperId: string): Promise<AttemptPaperQuestion[]> {
  const rows = await db
    .select({
      paperQuestionId: paperQuestions.id,
      position: paperQuestions.position,
      sectionCode: paperQuestions.sectionCode,
      marks: paperQuestions.marks,
      question: questions,
    })
    .from(paperQuestions)
    .innerJoin(questions, eq(questions.id, paperQuestions.questionId))
    .where(eq(paperQuestions.paperId, paperId))
    .orderBy(asc(paperQuestions.position));
  return rows;
}

export async function listAttemptResponses(db: Database, attemptId: string): Promise<AttemptResponseRow[]> {
  return db.select().from(attemptResponses).where(eq(attemptResponses.attemptId, attemptId));
}
