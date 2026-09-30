import { eq } from "drizzle-orm";
import { MASTERY_POLICY_V1, deriveMastery, evidenceFromAnswers, type MarkedAnswerFacts, type MasteryEvidence } from "@/domain/mastery";
import type { Database } from "@/repositories/postgres/client";
import { listAttemptResponses } from "@/repositories/postgres/attempts";
import {
  finalScoreOf,
  listAttemptMarking,
  listQuestionTopics,
} from "@/repositories/postgres/marking";
import {
  insertMasteryEvidence,
  listAnsweredQuestionIds,
  listEvidenceForChild,
  listMarkedAttemptsWithoutEvidence,
  upsertMasteryProfiles,
} from "@/repositories/postgres/mastery";
import { attemptSessions, type MasteryEvidenceRow } from "@/repositories/postgres/schema";

/**
 * Mastery evidence and the profiles cache (M8). Shared by the marking path (a mock is marked), the
 * practice answers and the progress screens. Everything here is safe to run again: evidence is written
 * once per source answer, and profiles are always recomputed from all of a child's evidence.
 */

const iso = (value: Date): string => value.toISOString();

export function evidenceRowToDomain(row: MasteryEvidenceRow): MasteryEvidence {
  return {
    outcomeId: row.outcomeId,
    questionId: row.questionId,
    familyId: row.familyId,
    questionType: row.questionType,
    difficulty: row.difficulty,
    scoreRatio: row.scoreRatio,
    firstAttempt: row.firstAttempt,
    sessionId: row.attemptId ?? row.practiceSessionId ?? row.id,
    at: iso(row.occurredAt),
  };
}

/**
 * Recomputes the cached profile of these outcomes for one child from all of the child's evidence.
 * `now` must not be earlier than the evidence (evidence dated after `now` is ignored by the rules).
 */
export async function recomputeMasteryProfiles(db: Database, childId: string, outcomeIds: readonly string[], now: Date): Promise<void> {
  const unique = [...new Set(outcomeIds)];
  if (unique.length === 0) return;
  const evidence = (await listEvidenceForChild(db, childId, unique)).map(evidenceRowToDomain);
  const derived = deriveMastery(evidence, now, unique);
  await upsertMasteryProfiles(
    db,
    derived.map((outcome) => ({
      childId,
      outcomeId: outcome.outcomeId,
      state: outcome.state,
      evidenceCount: outcome.evidenceCount,
      sessions: outcome.sessions,
      lastPracticedAt: outcome.lastPracticedAt ? new Date(outcome.lastPracticedAt) : null,
      masteredAt: outcome.masteredAt ? new Date(outcome.masteredAt) : null,
      reviewDueAt: outcome.reviewDueAt ? new Date(outcome.reviewDueAt) : null,
      recentAccuracy: outcome.recentAccuracy ?? null,
      policyVersion: MASTERY_POLICY_V1.version,
      computedAt: now,
    })),
  );
}

/** Throws the cache away and rebuilds it for every outcome the child has evidence on. */
export async function rebuildMasteryProfiles(db: Database, childId: string, now: Date): Promise<void> {
  const outcomeIds = [...new Set((await listEvidenceForChild(db, childId)).map((row) => row.outcomeId))];
  await recomputeMasteryProfiles(db, childId, outcomeIds, now);
}

/**
 * Writes the evidence of a marked mock: one row per answer, against the question's primary outcome, from
 * the mark that counts. Does nothing until the mock is marked, and nothing for answers already recorded.
 * Returns how many rows were new.
 */
export async function recordAttemptEvidence(db: Database, attemptId: string, now: Date): Promise<number> {
  const [attempt] = await db.select().from(attemptSessions).where(eq(attemptSessions.id, attemptId)).limit(1);
  if (!attempt || attempt.status !== "marked") return 0;

  const marking = await listAttemptMarking(db, attemptId, attempt.paperId);
  const topics = await listQuestionTopics(db, marking.map((item) => item.question.id));
  const outcomeOf = new Map(topics.map((topic) => [topic.questionId, topic.outcomeId]));
  const responses = new Map((await listAttemptResponses(db, attemptId)).map((response) => [response.paperQuestionId, response]));
  const answeredAt = iso(attempt.submittedAt ?? attempt.markedAt ?? now);

  const answered = await listAnsweredQuestionIds(db, attempt.childId);
  const facts: (MarkedAnswerFacts & { responseId: string })[] = [];
  for (const item of marking) {
    const outcomeId = outcomeOf.get(item.question.id);
    const response = responses.get(item.paperQuestionId);
    const score = finalScoreOf(item);
    // A question with no outcome cannot be evidence, and an answer with no mark that counts yet cannot either.
    if (!outcomeId || !response || score === null) continue;
    facts.push({
      responseId: response.id,
      outcomeId,
      questionId: item.question.id,
      familyId: item.question.familyId,
      questionType: item.question.questionType,
      difficulty: item.question.difficulty,
      score,
      maxScore: item.marks,
      sessionId: attemptId,
      answeredAt,
    });
  }
  const evidence = evidenceFromAnswers(facts, answered);
  const written = await insertMasteryEvidence(
    db,
    evidence.map((entry, index) => ({
      childId: attempt.childId,
      outcomeId: entry.outcomeId,
      questionId: entry.questionId,
      familyId: entry.familyId,
      questionType: entry.questionType,
      difficulty: entry.difficulty,
      scoreRatio: entry.scoreRatio,
      firstAttempt: entry.firstAttempt,
      sourceKind: "mock",
      attemptId,
      attemptResponseId: (facts[index] as { responseId: string }).responseId,
      occurredAt: new Date(entry.at),
    })),
  );
  if (written.length > 0) {
    const at = new Date(Math.max(now.getTime(), ...written.map((row) => row.occurredAt.getTime())));
    await recomputeMasteryProfiles(db, attempt.childId, written.map((row) => row.outcomeId), at);
  }
  return written.length;
}

/**
 * Catches up marked mocks that have no evidence yet (marked before evidence existed, or when a job was
 * interrupted). Cheap when there is nothing to do. Returns the number of mocks it wrote evidence for.
 */
export async function ensureEvidenceForChild(db: Database, childId: string, now: Date): Promise<number> {
  const missing = await listMarkedAttemptsWithoutEvidence(db, childId);
  let count = 0;
  for (const attemptId of missing) {
    if ((await recordAttemptEvidence(db, attemptId, now)) > 0) count += 1;
  }
  return count;
}
