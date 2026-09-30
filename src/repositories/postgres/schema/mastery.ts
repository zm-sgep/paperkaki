import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { attemptResponses, attemptSessions } from "./attempts";
import { curriculumOutcomes } from "./curriculum";
import { children } from "./identity";
import { practiceResponses, practiceSessions } from "./practice";
import { questionDifficulty, questionFamilies, questionKind, questions } from "./questions";

// Schema files use relative imports only: drizzle-kit loads them without the @/ alias.

/**
 * Mastery (docs/DATA_MODEL.md section 10, docs/ARCHITECTURE.md section 16). Mastery is never a single
 * mutable score: it is derived from evidence, one row per marked answer.
 *
 * `mastery_evidence` is append-only history and idempotent on its source: a marked mock answer
 * (`attempt_response_id`) or a practice answer (`practice_response_id`) is written once. The rows point
 * at the exact question version answered and at the question's primary outcome.
 *
 * `mastery_profiles` is a cache of what `deriveMastery` says about one child and one outcome. It can be
 * thrown away and rebuilt from the evidence at any time.
 */

export const masteryEvidence = pgTable(
  "mastery_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "restrict" }),
    outcomeId: uuid("outcome_id")
      .notNull()
      .references(() => curriculumOutcomes.id, { onDelete: "restrict" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    familyId: uuid("family_id")
      .notNull()
      .references(() => questionFamilies.id, { onDelete: "restrict" }),
    questionType: questionKind("question_type").notNull(),
    difficulty: questionDifficulty("difficulty").notNull(),
    /** Marks earned over marks available, 0 to 1. */
    scoreRatio: doublePrecision("score_ratio").notNull(),
    /** True only for the first meaningful attempt at this question by this child. Retries never count towards mastery. */
    firstAttempt: boolean("first_attempt").notNull(),
    sourceKind: text("source_kind").notNull(),
    /** The mock the answer belongs to, for evidence from a marked mock. */
    attemptId: uuid("attempt_id").references(() => attemptSessions.id, { onDelete: "restrict" }),
    attemptResponseId: uuid("attempt_response_id").references(() => attemptResponses.id, { onDelete: "restrict" }),
    /** The practice set and answer, for evidence from practice. */
    practiceSessionId: uuid("practice_session_id").references(() => practiceSessions.id, { onDelete: "restrict" }),
    practiceResponseId: uuid("practice_response_id").references(() => practiceResponses.id, { onDelete: "restrict" }),
    /** When the child answered. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One piece of evidence per source answer: writing it twice does nothing.
    uniqueIndex("mastery_evidence_attempt_response_key")
      .on(table.attemptResponseId)
      .where(sql`${table.attemptResponseId} IS NOT NULL`),
    uniqueIndex("mastery_evidence_practice_response_key")
      .on(table.practiceResponseId)
      .where(sql`${table.practiceResponseId} IS NOT NULL`),
    index("idx_mastery_evidence_child_outcome").on(table.childId, table.outcomeId, table.occurredAt),
    index("idx_mastery_evidence_child_question").on(table.childId, table.questionId),
    index("idx_mastery_evidence_attempt").on(table.attemptId),
    check("mastery_evidence_ratio", sql`${table.scoreRatio} BETWEEN 0 AND 1`),
    check("mastery_evidence_source_kind", sql`${table.sourceKind} IN ('mock', 'practice')`),
    check(
      "mastery_evidence_one_source",
      sql`(${table.sourceKind} = 'mock' AND ${table.attemptId} IS NOT NULL AND ${table.attemptResponseId} IS NOT NULL AND ${table.practiceSessionId} IS NULL AND ${table.practiceResponseId} IS NULL)
        OR (${table.sourceKind} = 'practice' AND ${table.practiceSessionId} IS NOT NULL AND ${table.practiceResponseId} IS NOT NULL AND ${table.attemptId} IS NULL AND ${table.attemptResponseId} IS NULL)`,
    ),
  ],
);

export const masteryProfiles = pgTable(
  "mastery_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "restrict" }),
    outcomeId: uuid("outcome_id")
      .notNull()
      .references(() => curriculumOutcomes.id, { onDelete: "restrict" }),
    state: text("state").notNull(),
    /** First-attempt items that count towards mastery. */
    evidenceCount: integer("evidence_count").notNull(),
    sessions: integer("sessions").notNull(),
    lastPracticedAt: timestamp("last_practiced_at", { withTimezone: true }),
    masteredAt: timestamp("mastered_at", { withTimezone: true }),
    reviewDueAt: timestamp("review_due_at", { withTimezone: true }),
    recentAccuracy: doublePrecision("recent_accuracy"),
    /** The mastery policy the state was worked out with. */
    policyVersion: text("policy_version").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("mastery_profiles_child_outcome_key").on(table.childId, table.outcomeId),
    check(
      "mastery_profiles_state",
      sql`${table.state} IN ('not_started', 'learning', 'developing', 'almost_mastered', 'mastered', 'retained')`,
    ),
    check("mastery_profiles_counts", sql`${table.evidenceCount} >= 0 AND ${table.sessions} >= 0`),
  ],
);

export type MasteryEvidenceRow = typeof masteryEvidence.$inferSelect;
export type NewMasteryEvidenceRow = typeof masteryEvidence.$inferInsert;
export type MasteryProfileRow = typeof masteryProfiles.$inferSelect;
