import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "./client";
import { listAttemptPaperQuestions, listAttemptResponses, type AttemptPaperQuestion } from "./attempts";
import {
  assessments,
  attemptResponses,
  attemptSessions,
  children,
  curriculumOutcomes,
  curriculumTopics,
  markingDecisions,
  markingReviews,
  papers,
  questionOutcomes,
  type AttemptResponseRow,
  type AttemptSession,
  type MarkingDecisionRow,
  type MarkingReviewRow,
} from "./schema";

/**
 * Persistence for marking (M7). An answer keeps every decision made about it: the newest is the one in
 * force. A parent's second look is a row in `marking_reviews`, and the decision's `final_score` follows it.
 */

/** One question of an attempt with everything marking knows about it. */
export type MarkedQuestion = AttemptPaperQuestion & {
  /** Null when the question was never answered and the paper has not been marked yet. */
  response: AttemptResponseRow | null;
  /** The decision in force: the newest. */
  decision: MarkingDecisionRow | null;
  /** Every decision, oldest first. The first is the marking by rule. */
  history: MarkingDecisionRow[];
  /** A parent's checks, oldest first. */
  reviews: MarkingReviewRow[];
};

/** The score that counts, or null while an answer still waits for a person. */
export function finalScoreOf(question: Pick<MarkedQuestion, "decision">): number | null {
  return question.decision?.finalScore ?? null;
}

export function isWaitingForCheck(question: Pick<MarkedQuestion, "decision">): boolean {
  return question.decision !== null && question.decision.reviewRequired && question.decision.finalScore === null;
}

export async function listAttemptMarking(db: Database, attemptId: string, paperId: string): Promise<MarkedQuestion[]> {
  const [items, responses] = await Promise.all([listAttemptPaperQuestions(db, paperId), listAttemptResponses(db, attemptId)]);
  const responseByQuestion = new Map(responses.map((row) => [row.paperQuestionId, row]));
  const responseIds = responses.map((row) => row.id);
  const [decisions, reviews] =
    responseIds.length === 0
      ? [[], []]
      : await Promise.all([
          db.select().from(markingDecisions).where(inArray(markingDecisions.attemptResponseId, responseIds)).orderBy(asc(markingDecisions.seq)),
          db.select().from(markingReviews).where(inArray(markingReviews.attemptResponseId, responseIds)).orderBy(asc(markingReviews.createdAt)),
        ]);
  return items.map((item) => {
    const response = responseByQuestion.get(item.paperQuestionId) ?? null;
    const history = response ? decisions.filter((row) => row.attemptResponseId === response.id) : [];
    return {
      ...item,
      response,
      decision: history[history.length - 1] ?? null,
      history,
      reviews: response ? reviews.filter((row) => row.attemptResponseId === response.id) : [],
    };
  });
}

export type AttemptForProcessing = { attempt: AttemptSession; parentProfileId: string; paperId: string };

/** An attempt by id alone, for the marking job (no signed-in person there). */
export async function getAttemptForProcessing(db: Database, attemptId: string): Promise<AttemptForProcessing | null> {
  const [row] = await db
    .select({ attempt: attemptSessions, parentProfileId: children.parentProfileId })
    .from(attemptSessions)
    .innerJoin(children, eq(children.id, attemptSessions.childId))
    .where(eq(attemptSessions.id, attemptId))
    .limit(1);
  return row ? { attempt: row.attempt, parentProfileId: row.parentProfileId, paperId: row.attempt.paperId } : null;
}

export type NewMarkingDecision = typeof markingDecisions.$inferInsert;

export async function insertMarkingDecisions(db: Database, values: NewMarkingDecision[]): Promise<MarkingDecisionRow[]> {
  if (values.length === 0) return [];
  return db.insert(markingDecisions).values(values).returning();
}

export async function setDecisionFinalScore(db: Database, decisionId: string, finalScore: number): Promise<void> {
  await db.update(markingDecisions).set({ finalScore }).where(eq(markingDecisions.id, decisionId));
}

export async function insertMarkingReview(db: Database, values: typeof markingReviews.$inferInsert): Promise<MarkingReviewRow> {
  const [row] = await db.insert(markingReviews).values(values).returning();
  if (!row) throw new Error("Review was not stored.");
  return row;
}

/** The topic and skill each question is about (its primary outcome), in the words parents and children read. */
export type QuestionTopic = { questionId: string; outcomeId: string; skillLabel: string; topicId: string; topicLabel: string };

export async function listQuestionTopics(db: Database, questionIds: readonly string[]): Promise<QuestionTopic[]> {
  if (questionIds.length === 0) return [];
  return db
    .select({
      questionId: questionOutcomes.questionId,
      outcomeId: curriculumOutcomes.id,
      skillLabel: curriculumOutcomes.childLabel,
      topicId: curriculumTopics.id,
      topicLabel: curriculumTopics.parentLabel,
    })
    .from(questionOutcomes)
    .innerJoin(curriculumOutcomes, eq(curriculumOutcomes.id, questionOutcomes.outcomeId))
    .innerJoin(curriculumTopics, eq(curriculumTopics.id, curriculumOutcomes.topicId))
    .where(and(inArray(questionOutcomes.questionId, [...questionIds]), eq(questionOutcomes.role, "primary")));
}

/** Marked attempts of one child on any paper of an assessment, oldest mark first. */
export async function listMarkedAttemptsOfAssessment(db: Database, assessmentId: string, childId: string): Promise<{ attempt: AttemptSession; mockNumber: number }[]> {
  const rows = await db
    .select({ attempt: attemptSessions, mockNumber: papers.number })
    .from(attemptSessions)
    .innerJoin(papers, eq(papers.id, attemptSessions.paperId))
    .innerJoin(assessments, eq(assessments.id, papers.assessmentId))
    .where(and(eq(assessments.id, assessmentId), eq(attemptSessions.childId, childId), eq(attemptSessions.status, "marked")))
    .orderBy(asc(attemptSessions.markedAt), asc(papers.number));
  return rows;
}

/** Sum of the marks that count, and the total available, for an attempt. Null while any answer is unsettled. */
export async function attemptTotals(db: Database, attemptId: string, paperId: string): Promise<{ score: number; maxScore: number } | null> {
  const marked = await listAttemptMarking(db, attemptId, paperId);
  let score = 0;
  let maxScore = 0;
  for (const question of marked) {
    const final = finalScoreOf(question);
    if (final === null) return null;
    score += final;
    maxScore += question.marks;
  }
  return { score, maxScore };
}

export type MarkingSummary = { waiting: number; mistakes: number };

/**
 * For each attempt: how many answers wait for the parent's check, and how many were marked below full
 * marks (the mistakes). Only the decision in force counts.
 */
export async function markingSummaries(db: Database, attemptIds: readonly string[]): Promise<Map<string, MarkingSummary>> {
  const summaries = new Map<string, MarkingSummary>();
  if (attemptIds.length === 0) return summaries;
  const rows = await db
    .select({
      attemptId: attemptResponses.attemptId,
      responseId: markingDecisions.attemptResponseId,
      seq: markingDecisions.seq,
      reviewRequired: markingDecisions.reviewRequired,
      finalScore: markingDecisions.finalScore,
      maxScore: markingDecisions.maxScore,
    })
    .from(markingDecisions)
    .innerJoin(attemptResponses, eq(attemptResponses.id, markingDecisions.attemptResponseId))
    .where(inArray(attemptResponses.attemptId, [...attemptIds]));
  const newest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const known = newest.get(row.responseId);
    if (!known || row.seq > known.seq) newest.set(row.responseId, row);
  }
  for (const row of newest.values()) {
    const summary = summaries.get(row.attemptId) ?? { waiting: 0, mistakes: 0 };
    if (row.reviewRequired && row.finalScore === null) summary.waiting += 1;
    else if (row.finalScore !== null && row.finalScore < row.maxScore) summary.mistakes += 1;
    summaries.set(row.attemptId, summary);
  }
  return summaries;
}
