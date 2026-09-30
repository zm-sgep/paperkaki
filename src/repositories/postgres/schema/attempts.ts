import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { children, parentProfiles } from "./identity";
import { paperQuestions, papers } from "./papers";

// Schema files use relative imports only: drizzle-kit loads them without the @/ alias.

/**
 * A child's attempt at a frozen paper (docs/DATA_MODEL.md section 8, docs/ARCHITECTURE.md section 10).
 *
 * Papers stay immutable: an attempt points at the paper, and each answer points at the paper's own
 * question row (and through it the exact question version). Nothing here is ever written back to
 * the paper. Handwriting is kept twice: the stroke data (versioned JSON, so it can be redrawn) and a
 * PNG snapshot written to the private `attempt-handwriting` bucket when the paper is handed in;
 * only the bucket and key are stored, never a link.
 */

export const attemptMode = pgEnum("attempt_mode", ["ipad", "print_upload"]);
export const attemptStatus = pgEnum("attempt_status", ["assigned", "in_progress", "submitted", "marked"]);

export const attemptSessions = pgTable(
  "attempt_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paperId: uuid("paper_id")
      .notNull()
      .references(() => papers.id, { onDelete: "restrict" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "restrict" }),
    mode: attemptMode("mode").notNull(),
    status: attemptStatus("status").notNull().default("assigned"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    /** The moment the child pressed Start. The mock clock is measured from here, on the server. */
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    timeLimitSeconds: integer("time_limit_seconds").notNull(),
    /** Set when the paper is handed in: submitted_at - started_at. */
    elapsedSeconds: integer("elapsed_seconds").notNull().default(0),
    /** Seconds past the limit at hand-in. Recorded for the parent; never a penalty. */
    overTimeSeconds: integer("over_time_seconds").notNull().default(0),
    /** The question the child was on (1 = the first), so Today can say "Question 8 of 26". */
    currentPosition: integer("current_position").notNull().default(1),
    /**
     * Where marking is once the paper is handed in: none (not handed in), reading (a photographed
     * paper is being read), marking, preparing, done, or failed (the pages are safe; try again).
     * "done" does not mean every answer has a final mark: a few may wait for the parent's quick check.
     */
    markingStage: text("marking_stage").notNull().default("none"),
    /** When the last answer got its final mark. Set exactly when the status is "marked". */
    markedAt: timestamp("marked_at", { withTimezone: true }),
    /** The parent opened the results; Home stops asking them to. */
    parentResultSeenAt: timestamp("parent_result_seen_at", { withTimezone: true }),
    childResultSeenAt: timestamp("child_result_seen_at", { withTimezone: true }),
    /** The mistakes were gone through on the marked paper. */
    mistakesReviewedAt: timestamp("mistakes_reviewed_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => parentProfiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One open attempt per paper and child, so "Do it on iPad instead" twice gives the same attempt.
    uniqueIndex("attempt_sessions_open_key")
      .on(table.paperId, table.childId)
      .where(sql`${table.status} in ('assigned', 'in_progress')`),
    index("idx_attempt_sessions_child").on(table.childId, table.status),
    index("idx_attempt_sessions_paper").on(table.paperId),
    check("attempt_sessions_limit_positive", sql`${table.timeLimitSeconds} > 0`),
    check("attempt_sessions_seconds", sql`${table.elapsedSeconds} >= 0 AND ${table.overTimeSeconds} >= 0`),
    check("attempt_sessions_position", sql`${table.currentPosition} >= 1`),
    check("attempt_sessions_marking_stage", sql`${table.markingStage} IN ('none', 'reading', 'marking', 'preparing', 'done', 'failed')`),
    check("attempt_sessions_marked_matches_status", sql`(${table.status} = 'marked') = (${table.markedAt} IS NOT NULL)`),
    check("attempt_sessions_started_matches_status", sql`(${table.status} = 'assigned') = (${table.startedAt} IS NULL)`),
    check(
      "attempt_sessions_submitted_matches_status",
      sql`(${table.status} IN ('submitted', 'marked')) = (${table.submittedAt} IS NOT NULL)`,
    ),
  ],
);

export const attemptResponses = pgTable(
  "attempt_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attemptSessions.id, { onDelete: "restrict" }),
    paperQuestionId: uuid("paper_question_id")
      .notNull()
      .references(() => paperQuestions.id, { onDelete: "restrict" }),
    selectedOption: text("selected_option"),
    typedAnswer: text("typed_answer"),
    /** The unit that stood beside the answer box, when the question states one. */
    typedUnit: text("typed_unit"),
    /** The stroke-model serialisation (src/components/mock/stroke-model.ts), versioned. */
    strokes: jsonb("strokes").$type<Record<string, unknown>>(),
    flagged: boolean("flagged").notNull().default(false),
    /** When the child's device made this version of the answer. The newest write wins. */
    lastSavedAt: timestamp("last_saved_at", { withTimezone: true }).notNull().defaultNow(),
    handwritingBucket: text("handwriting_bucket"),
    handwritingKey: text("handwriting_key"),
  },
  (table) => [
    unique("attempt_responses_question_key").on(table.attemptId, table.paperQuestionId),
    index("idx_attempt_responses_question").on(table.paperQuestionId),
    check("attempt_responses_option", sql`${table.selectedOption} IS NULL OR ${table.selectedOption} IN ('A', 'B', 'C', 'D')`),
    check("attempt_responses_typed_length", sql`${table.typedAnswer} IS NULL OR char_length(${table.typedAnswer}) <= 500`),
    check(
      "attempt_responses_handwriting_key_not_url",
      sql`${table.handwritingKey} IS NULL OR ${table.handwritingKey} !~* '^[a-z][a-z0-9+.-]*://'`,
    ),
  ],
);

export const markingDecisions = pgTable(
  "marking_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptResponseId: uuid("attempt_response_id")
      .notNull()
      .references(() => attemptResponses.id, { onDelete: "restrict" }),
    /** The proposed score. For a decision that needs review this is provisional. */
    score: integer("score").notNull(),
    maxScore: integer("max_score").notNull(),
    method: text("method").notNull(),
    confidence: text("confidence").notNull(),
    /** Internal wording for reviewers and audit. Never shown to the child. */
    reason: text("reason").notNull(),
    reviewRequired: boolean("review_required").notNull(),
    /** The score that counts. Null until a person decides, when review is required. */
    finalScore: integer("final_score"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    /** Order of writing. An answer keeps every decision made about it; the newest is the one in force. */
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    /** The wording that produced an AI-assisted decision. Null for a decision made by rule. */
    promptVersion: text("prompt_version"),
    /** What kind of slip an AI-assisted decision saw, when it saw one. */
    errorType: text("error_type"),
  },
  (table) => [
    index("idx_marking_decisions_response").on(table.attemptResponseId, table.seq),
    check("marking_decisions_method", sql`${table.method} IN ('deterministic', 'needs_review', 'ai_assisted')`),
    check(
      "marking_decisions_error_type",
      sql`${table.errorType} IS NULL OR ${table.errorType} IN ('calculation', 'method', 'misread', 'incomplete', 'other')`,
    ),
    check("marking_decisions_confidence", sql`${table.confidence} IN ('high', 'low')`),
    check("marking_decisions_score_range", sql`${table.score} BETWEEN 0 AND ${table.maxScore}`),
    check(
      "marking_decisions_final_range",
      sql`${table.finalScore} IS NULL OR ${table.finalScore} BETWEEN 0 AND ${table.maxScore}`,
    ),
    check("marking_decisions_final_when_settled", sql`${table.reviewRequired} OR ${table.finalScore} IS NOT NULL`),
  ],
);

/**
 * A parent's decision on an answer that needed a quick check. Append-only (a database trigger refuses
 * changes): a second look adds a row, and the newest is what counts. The decision's `final_score`
 * follows the newest review.
 */
export const markingReviews = pgTable(
  "marking_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptResponseId: uuid("attempt_response_id")
      .notNull()
      .references(() => attemptResponses.id, { onDelete: "restrict" }),
    markingDecisionId: uuid("marking_decision_id")
      .notNull()
      .references(() => markingDecisions.id, { onDelete: "restrict" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => parentProfiles.id, { onDelete: "restrict" }),
    score: integer("score").notNull(),
    maxScore: integer("max_score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_marking_reviews_response").on(table.attemptResponseId, table.createdAt),
    check("marking_reviews_score_range", sql`${table.score} BETWEEN 0 AND ${table.maxScore}`),
  ],
);

/**
 * The pages of a finished paper that was printed, photographed and uploaded. They are kept in the
 * private `submission-uploads` bucket by key only. Until the parent presses "Submit for marking" they
 * belong to the parent and the paper (attempt_id is null) and can be re-ordered or removed; then
 * they are attached to the attempt and frozen.
 */
export const printUploadPages = pgTable(
  "print_upload_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paperId: uuid("paper_id")
      .notNull()
      .references(() => papers.id, { onDelete: "restrict" }),
    parentProfileId: uuid("parent_profile_id")
      .notNull()
      .references(() => parentProfiles.id, { onDelete: "restrict" }),
    attemptId: uuid("attempt_id").references(() => attemptSessions.id, { onDelete: "restrict" }),
    /** Order on the grid, 1 upward. */
    position: integer("position").notNull(),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    mime: text("mime").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    /** A problem found by rule when the page was added: blurry, rotated or too small. Null when it looks fine. */
    problem: text("problem"),
    /** The page number read from the footer, when it could be read. */
    detectedPage: integer("detected_page"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("print_upload_pages_key").on(table.bucket, table.objectKey),
    index("idx_print_upload_pages_draft").on(table.paperId, table.parentProfileId, table.position),
    index("idx_print_upload_pages_attempt").on(table.attemptId, table.position),
    check("print_upload_pages_problem", sql`${table.problem} IS NULL OR ${table.problem} IN ('blurry', 'rotated', 'small')`),
    check("print_upload_pages_position", sql`${table.position} >= 1`),
    check("print_upload_pages_key_not_url", sql`${table.objectKey} !~* '^[a-z][a-z0-9+.-]*://'`),
  ],
);

export type AttemptSession = typeof attemptSessions.$inferSelect;
export type AttemptResponseRow = typeof attemptResponses.$inferSelect;
export type MarkingDecisionRow = typeof markingDecisions.$inferSelect;
export type MarkingReviewRow = typeof markingReviews.$inferSelect;
export type PrintUploadPageRow = typeof printUploadPages.$inferSelect;
