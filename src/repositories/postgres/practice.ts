import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  children,
  masteryEvidence,
  practiceResponses,
  practiceSessions,
  practiceSuggestions,
  questions,
  type PracticeResponseRow,
  type PracticeSessionRow,
  type PracticeSuggestionRow,
  type QuestionRow,
} from "./schema";

/**
 * Persistence for practice (M9). Every read that starts from a session id also takes the child, so a wrong
 * id and someone else's id look the same: nothing.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

export async function getOpenPracticeSession(db: Database, childId: string): Promise<PracticeSessionRow | null> {
  const [row] = await db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.childId, childId), eq(practiceSessions.status, "in_progress")))
    .limit(1);
  return row ?? null;
}

export async function getPracticeSessionOfChild(db: Database, childId: string, sessionId: string): Promise<PracticeSessionRow | null> {
  if (!isUuid(sessionId)) return null;
  const [row] = await db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.childId, childId)))
    .limit(1);
  return row ?? null;
}

export async function countPracticeSessions(db: Database, childId: string): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(practiceSessions).where(eq(practiceSessions.childId, childId));
  return row?.count ?? 0;
}

export type NewPracticeSession = typeof practiceSessions.$inferInsert;
export type NewPracticeResponse = typeof practiceResponses.$inferInsert;

export async function insertPracticeSession(db: Database, values: NewPracticeSession): Promise<PracticeSessionRow> {
  const [row] = await db.insert(practiceSessions).values(values).returning();
  if (!row) throw new Error("Practice session was not stored.");
  return row;
}

export async function insertPracticeResponses(db: Database, values: NewPracticeResponse[]): Promise<PracticeResponseRow[]> {
  if (values.length === 0) return [];
  return db.insert(practiceResponses).values(values).returning();
}

export type PracticeItem = { response: PracticeResponseRow; question: QuestionRow };

/** The set's questions in order, with the exact question versions. */
export async function listPracticeItems(db: Database, sessionId: string): Promise<PracticeItem[]> {
  return db
    .select({ response: practiceResponses, question: questions })
    .from(practiceResponses)
    .innerJoin(questions, eq(questions.id, practiceResponses.questionId))
    .where(eq(practiceResponses.sessionId, sessionId))
    .orderBy(asc(practiceResponses.position));
}

/** Makes room for one question straight after `position` by moving the later ones down the list. */
export async function openPracticePositionAfter(db: Database, sessionId: string, position: number): Promise<number> {
  const later = and(eq(practiceResponses.sessionId, sessionId), sql`${practiceResponses.position} > ${position}`);
  // Two steps, because the position is unique: park the later ones out of the way, then bring them back one lower.
  await db.update(practiceResponses).set({ position: sql`${practiceResponses.position} + 1000` }).where(later);
  await db
    .update(practiceResponses)
    .set({ position: sql`${practiceResponses.position} - 999` })
    .where(and(eq(practiceResponses.sessionId, sessionId), sql`${practiceResponses.position} >= 1000`));
  return position + 1;
}

export async function saveAnswer(
  db: Database,
  responseId: string,
  values: Pick<PracticeResponseRow, "selectedOption" | "typedAnswer" | "typedUnit" | "score" | "result" | "answeredAt">,
): Promise<PracticeResponseRow | null> {
  // Only an unanswered question takes an answer: a second press does nothing.
  const [row] = await db
    .update(practiceResponses)
    .set(values)
    .where(and(eq(practiceResponses.id, responseId), sql`${practiceResponses.answeredAt} IS NULL`))
    .returning();
  return row ?? null;
}

export async function touchPracticeSession(db: Database, sessionId: string, values: { lastActiveAt: Date; activeSeconds: number }): Promise<void> {
  await db.update(practiceSessions).set(values).where(eq(practiceSessions.id, sessionId));
}

export async function completePracticeSession(
  db: Database,
  sessionId: string,
  values: { completedAt: Date; minutes: number },
): Promise<PracticeSessionRow | null> {
  const [row] = await db
    .update(practiceSessions)
    .set({ status: "completed", ...values })
    .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.status, "in_progress")))
    .returning();
  return row ?? null;
}

/** Sets a child finished since `since`, newest first. */
export async function listPracticeSessionsCompletedSince(db: Database, childId: string, since: Date): Promise<PracticeSessionRow[]> {
  return db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.childId, childId), eq(practiceSessions.status, "completed"), gte(practiceSessions.completedAt, since)))
    .orderBy(desc(practiceSessions.completedAt));
}

export async function listRecentPracticeSessions(db: Database, childId: string, limit: number): Promise<PracticeSessionRow[]> {
  return db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.childId, childId), eq(practiceSessions.status, "completed")))
    .orderBy(desc(practiceSessions.completedAt))
    .limit(limit);
}

/** The newest answer to each of these questions by this child (a mock or practice), for choosing what to ask next. */
export async function listQuestionHistory(db: Database, childId: string, questionIds: readonly string[]): Promise<{ questionId: string; lastAnsweredAt: Date; lastScoreRatio: number }[]> {
  if (questionIds.length === 0) return [];
  const rows = await db
    .select({ questionId: masteryEvidence.questionId, at: masteryEvidence.occurredAt, ratio: masteryEvidence.scoreRatio })
    .from(masteryEvidence)
    .where(and(eq(masteryEvidence.childId, childId), inArray(masteryEvidence.questionId, [...questionIds])))
    .orderBy(asc(masteryEvidence.occurredAt), asc(masteryEvidence.createdAt));
  const newest = new Map<string, { questionId: string; lastAnsweredAt: Date; lastScoreRatio: number }>();
  for (const row of rows) newest.set(row.questionId, { questionId: row.questionId, lastAnsweredAt: row.at, lastScoreRatio: row.ratio });
  return [...newest.values()];
}

export async function getPendingSuggestion(db: Database, childId: string): Promise<PracticeSuggestionRow | null> {
  const [row] = await db
    .select()
    .from(practiceSuggestions)
    .where(and(eq(practiceSuggestions.childId, childId), eq(practiceSuggestions.status, "pending")))
    .limit(1);
  return row ?? null;
}

/** A new suggestion replaces one still waiting. Returns the new row, or the waiting one when it says the same thing. */
export async function replacePendingSuggestion(
  db: Database,
  values: { childId: string; topicId: string; suggestedBy: string },
): Promise<{ suggestion: PracticeSuggestionRow; created: boolean }> {
  const pending = await getPendingSuggestion(db, values.childId);
  if (pending && pending.topicId === values.topicId) return { suggestion: pending, created: false };
  if (pending) await db.update(practiceSuggestions).set({ status: "replaced" }).where(eq(practiceSuggestions.id, pending.id));
  const [row] = await db.insert(practiceSuggestions).values(values).returning();
  if (!row) throw new Error("Suggestion was not stored.");
  return { suggestion: row, created: true };
}

export async function markSuggestionStarted(db: Database, suggestionId: string, sessionId: string): Promise<void> {
  await db
    .update(practiceSuggestions)
    .set({ status: "started", sessionId })
    .where(and(eq(practiceSuggestions.id, suggestionId), eq(practiceSuggestions.status, "pending")));
}

/** Is this child archived or missing? Practice never runs for an archived child. */
export async function isChildActive(db: Database, childId: string): Promise<boolean> {
  const [row] = await db.select({ archivedAt: children.archivedAt }).from(children).where(eq(children.id, childId)).limit(1);
  return Boolean(row) && row?.archivedAt === null;
}
