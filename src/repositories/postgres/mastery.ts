import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  attemptSessions,
  masteryEvidence,
  masteryProfiles,
  type MasteryEvidenceRow,
  type MasteryProfileRow,
  type NewMasteryEvidenceRow,
} from "./schema";

/**
 * Persistence for mastery (M8). Evidence is append-only and idempotent on its source answer; profiles are
 * a cache that can be rebuilt from the evidence.
 */

/** Adds evidence. An answer that already has evidence is skipped. Returns the rows that were new. */
export async function insertMasteryEvidence(db: Database, rows: NewMasteryEvidenceRow[]): Promise<MasteryEvidenceRow[]> {
  if (rows.length === 0) return [];
  return db.insert(masteryEvidence).values(rows).onConflictDoNothing().returning();
}

/** All of a child's evidence, oldest first; narrowed to some outcomes when given. */
export async function listEvidenceForChild(db: Database, childId: string, outcomeIds?: readonly string[]): Promise<MasteryEvidenceRow[]> {
  if (outcomeIds && outcomeIds.length === 0) return [];
  return db
    .select()
    .from(masteryEvidence)
    .where(
      outcomeIds
        ? and(eq(masteryEvidence.childId, childId), inArray(masteryEvidence.outcomeId, [...outcomeIds]))
        : eq(masteryEvidence.childId, childId),
    )
    .orderBy(asc(masteryEvidence.occurredAt), asc(masteryEvidence.createdAt), asc(masteryEvidence.id));
}

/** The ids of every question this child has answered, in a mock or in practice. */
export async function listAnsweredQuestionIds(db: Database, childId: string): Promise<Set<string>> {
  const rows = await db.selectDistinct({ questionId: masteryEvidence.questionId }).from(masteryEvidence).where(eq(masteryEvidence.childId, childId));
  return new Set(rows.map((row) => row.questionId));
}

export type NewMasteryProfile = Omit<typeof masteryProfiles.$inferInsert, "id">;

export async function upsertMasteryProfiles(db: Database, rows: NewMasteryProfile[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(masteryProfiles)
    .values(rows)
    .onConflictDoUpdate({
      target: [masteryProfiles.childId, masteryProfiles.outcomeId],
      set: {
        state: sql`excluded.state`,
        evidenceCount: sql`excluded.evidence_count`,
        sessions: sql`excluded.sessions`,
        lastPracticedAt: sql`excluded.last_practiced_at`,
        masteredAt: sql`excluded.mastered_at`,
        reviewDueAt: sql`excluded.review_due_at`,
        recentAccuracy: sql`excluded.recent_accuracy`,
        policyVersion: sql`excluded.policy_version`,
        computedAt: sql`excluded.computed_at`,
      },
    });
}

export async function listMasteryProfiles(db: Database, childId: string): Promise<MasteryProfileRow[]> {
  return db.select().from(masteryProfiles).where(eq(masteryProfiles.childId, childId)).orderBy(asc(masteryProfiles.outcomeId));
}

/** Marked mocks of a child that have no evidence yet (marked before evidence existed, or by an interrupted job). */
export async function listMarkedAttemptsWithoutEvidence(db: Database, childId: string): Promise<string[]> {
  const rows = await db
    .select({ id: attemptSessions.id })
    .from(attemptSessions)
    .where(
      and(
        eq(attemptSessions.childId, childId),
        eq(attemptSessions.status, "marked"),
        sql`NOT EXISTS (SELECT 1 FROM ${masteryEvidence} WHERE ${masteryEvidence.attemptId} = ${attemptSessions.id})`,
      ),
    )
    .orderBy(asc(attemptSessions.markedAt));
  return rows.map((row) => row.id);
}
