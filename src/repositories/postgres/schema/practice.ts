import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { curriculumOutcomes, curriculumTopics } from "./curriculum";
import { children, parentProfiles } from "./identity";
import { questions } from "./questions";

// Schema files use relative imports only: drizzle-kit loads them without the @/ alias.

/**
 * Targeted practice (M9). A practice session is a short set (about 15 minutes, 6 to 10 questions) chosen
 * by rule for one topic or one skill. The questions are chosen when the session starts and kept as
 * `practice_responses` rows, so a set can be left and picked up again, and "Try one like this" adds one more
 * question to the same set. Each answer is marked by rule and becomes mastery evidence.
 *
 * A parent can suggest a topic to practise (`practice_suggestions`); it becomes the child's next mission
 * until they start it.
 */

export const practiceSessions = pgTable(
  "practice_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "restrict" }),
    /** What the set is about: a whole topic, or one skill (outcome) inside it. */
    focusKind: text("focus_kind").notNull(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => curriculumTopics.id, { onDelete: "restrict" }),
    outcomeId: uuid("outcome_id").references(() => curriculumOutcomes.id, { onDelete: "restrict" }),
    /** The topic or skill in the child's words, kept so the end screen and Today can name it. */
    focusLabel: text("focus_label").notNull(),
    /** How it began: recommended by rule, suggested by a parent, chosen by the child, or "one like this" from a mistake. */
    origin: text("origin").notNull(),
    seed: text("seed").notNull(),
    status: text("status").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** The last time the child did something in the set; the next gap is measured from here. */
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    /** Seconds the child was really working: each gap between actions counts, but never more than a few minutes. */
    activeSeconds: integer("active_seconds").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Whole minutes practised, set when the set is finished. */
    minutes: integer("minutes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One unfinished set per child: starting again resumes it.
    uniqueIndex("practice_sessions_open_key")
      .on(table.childId)
      .where(sql`${table.status} = 'in_progress'`),
    index("idx_practice_sessions_child").on(table.childId, table.startedAt),
    check("practice_sessions_focus_kind", sql`${table.focusKind} IN ('topic', 'outcome')`),
    check("practice_sessions_focus_outcome", sql`(${table.focusKind} = 'outcome') = (${table.outcomeId} IS NOT NULL)`),
    check("practice_sessions_origin", sql`${table.origin} IN ('recommended', 'suggested', 'chosen', 'similar')`),
    check("practice_sessions_status", sql`${table.status} IN ('in_progress', 'completed')`),
    check("practice_sessions_completed_matches_status", sql`(${table.status} = 'completed') = (${table.completedAt} IS NOT NULL)`),
    check("practice_sessions_seconds", sql`${table.activeSeconds} >= 0`),
    check("practice_sessions_minutes", sql`${table.minutes} IS NULL OR ${table.minutes} >= 0`),
  ],
);

export const practiceResponses = pgTable(
  "practice_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => practiceSessions.id, { onDelete: "restrict" }),
    /** The place in the set, 1 upward. */
    position: integer("position").notNull(),
    /** The exact question version. */
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    outcomeId: uuid("outcome_id")
      .notNull()
      .references(() => curriculumOutcomes.id, { onDelete: "restrict" }),
    /** Chosen when the set was made ("planned"), or added by "Try one like this" ("similar"). */
    addedAs: text("added_as").notNull().default("planned"),
    selectedOption: text("selected_option"),
    typedAnswer: text("typed_answer"),
    typedUnit: text("typed_unit"),
    /** Null until the child checks their answer. */
    score: integer("score"),
    maxScore: integer("max_score").notNull(),
    /** "right", "wrong", or "unclear" when a person would need to look (no evidence is written for that). */
    result: text("result"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("practice_responses_position_key").on(table.sessionId, table.position),
    uniqueIndex("practice_responses_question_key").on(table.sessionId, table.questionId),
    index("idx_practice_responses_question").on(table.questionId),
    check("practice_responses_added_as", sql`${table.addedAs} IN ('planned', 'similar')`),
    check("practice_responses_option", sql`${table.selectedOption} IS NULL OR ${table.selectedOption} IN ('A', 'B', 'C', 'D')`),
    check("practice_responses_typed_length", sql`${table.typedAnswer} IS NULL OR char_length(${table.typedAnswer}) <= 500`),
    check("practice_responses_result", sql`${table.result} IS NULL OR ${table.result} IN ('right', 'wrong', 'unclear')`),
    check("practice_responses_score_range", sql`${table.score} IS NULL OR ${table.score} BETWEEN 0 AND ${table.maxScore}`),
    check("practice_responses_answered_matches_result", sql`(${table.answeredAt} IS NULL) = (${table.result} IS NULL)`),
  ],
);

/** A parent's "Suggest to Darius": a topic to practise, waiting on the child's Today until they start it. */
export const practiceSuggestions = pgTable(
  "practice_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "restrict" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => curriculumTopics.id, { onDelete: "restrict" }),
    suggestedBy: uuid("suggested_by")
      .notNull()
      .references(() => parentProfiles.id, { onDelete: "restrict" }),
    /** "pending" until the child starts it, then "started"; a newer suggestion makes an older pending one "replaced". */
    status: text("status").notNull().default("pending"),
    sessionId: uuid("session_id").references(() => practiceSessions.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("practice_suggestions_pending_key")
      .on(table.childId)
      .where(sql`${table.status} = 'pending'`),
    index("idx_practice_suggestions_child").on(table.childId, table.createdAt),
    check("practice_suggestions_status", sql`${table.status} IN ('pending', 'started', 'replaced')`),
  ],
);

export type PracticeSessionRow = typeof practiceSessions.$inferSelect;
export type PracticeResponseRow = typeof practiceResponses.$inferSelect;
export type PracticeSuggestionRow = typeof practiceSuggestions.$inferSelect;
