import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { curriculumOutcomes, curriculumVersions } from "./curriculum";
import { parentProfiles } from "./identity";

// Schema files use relative imports only: drizzle-kit loads them without the @/ alias.

/**
 * Question bank tables (docs/DATA_MODEL.md section 5, ADR-0004).
 *
 * A question family is the underlying concept; each row of `questions` is one immutable
 * version of a usable item. Every foreign key is ON DELETE RESTRICT: nothing here cascades
 * away history. A database trigger (drizzle/0004_question_immutability.sql) rejects edits to
 * an approved or retired version, and changes to its outcome mappings.
 *
 * Content, answer, verification, solution and marking scheme are structured JSON validated by
 * src/schemas/question-content.ts before they are stored. Marks, type, difficulty and the
 * outcome mappings are real columns, never hidden in JSON.
 */

export const questionStatus = pgEnum("question_status", ["draft", "in_review", "approved", "retired"]);

export const questionRole = pgEnum("question_role", ["primary", "secondary", "prerequisite"]);

export const questionProvenance = pgEnum("question_provenance", [
  "original_human",
  "original_ai",
  "licensed",
  "public_domain",
  "organisation_owned",
]);

export const questionKind = pgEnum("question_kind", ["mcq", "number", "fraction", "text"]);

export const questionDifficulty = pgEnum("question_difficulty", ["basic", "standard", "challenging"]);

export const questionCognitiveDemand = pgEnum("question_cognitive_demand", ["recall", "application", "reasoning"]);

export const questionReviewDecision = pgEnum("question_review_decision", [
  "approved",
  "changes_requested",
  "retired",
]);

export const questionFamilies = pgTable(
  "question_families",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    curriculumVersionId: uuid("curriculum_version_id")
      .notNull()
      .references(() => curriculumVersions.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("question_families_version_code_key").on(table.curriculumVersionId, table.code),
  ],
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => questionFamilies.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    status: questionStatus("status").notNull().default("draft"),
    level: text("level").notNull(),
    subject: text("subject").notNull(),
    /** Denormalised from the family so generation queries need no join. Never differs from it. */
    curriculumVersionId: uuid("curriculum_version_id")
      .notNull()
      .references(() => curriculumVersions.id, { onDelete: "restrict" }),
    questionType: questionKind("question_type").notNull(),
    difficulty: questionDifficulty("difficulty").notNull(),
    cognitiveDemand: questionCognitiveDemand("cognitive_demand").notNull(),
    marks: integer("marks").notNull(),
    estimatedSeconds: integer("estimated_seconds").notNull(),
    content: jsonb("content").$type<unknown>().notNull(),
    answer: jsonb("answer").$type<unknown>().notNull(),
    verification: jsonb("verification").$type<unknown>().notNull(),
    workedSolution: jsonb("worked_solution").$type<unknown>().notNull(),
    markingScheme: jsonb("marking_scheme").$type<unknown>().notNull(),
    provenance: questionProvenance("provenance").notNull(),
    /** The version this one corrects. Approving this version retires that one. Null for a first version. */
    supersedesQuestionId: uuid("supersedes_question_id").references((): AnyPgColumn => questions.id, {
      onDelete: "restrict",
    }),
    createdBy: uuid("created_by").references(() => parentProfiles.id, { onDelete: "restrict" }),
    approvedBy: uuid("approved_by").references(() => parentProfiles.id, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("questions_family_version_key").on(table.familyId, table.version),
    // Paper generation: approved questions of one subject and level in one curriculum version.
    index("idx_questions_generation").on(table.status, table.subject, table.level, table.curriculumVersionId),
    // Approved-only path: a small partial index, so candidate queries never scan drafts or retired items.
    index("idx_questions_approved")
      .on(table.curriculumVersionId, table.subject, table.level)
      .where(sql`${table.status} = 'approved'`),
    // Admin list filters by type and difficulty within a version.
    index("idx_questions_kind_difficulty").on(table.curriculumVersionId, table.questionType, table.difficulty),
    index("idx_questions_family").on(table.familyId),
    check("questions_version_positive", sql`${table.version} >= 1`),
    check("questions_marks_positive", sql`${table.marks} > 0`),
    check("questions_estimated_seconds_positive", sql`${table.estimatedSeconds} > 0`),
    check("questions_approved_has_time", sql`${table.status} <> 'approved' OR ${table.approvedAt} IS NOT NULL`),
  ],
);

export const questionOutcomes = pgTable(
  "question_outcomes",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    outcomeId: uuid("outcome_id")
      .notNull()
      .references(() => curriculumOutcomes.id, { onDelete: "restrict" }),
    role: questionRole("role").notNull(),
  },
  (table) => [
    unique("question_outcomes_pkey_key").on(table.questionId, table.outcomeId),
    // Exactly one primary outcome per question (the "at least one" half is checked at approval).
    uniqueIndex("uq_question_outcomes_one_primary").on(table.questionId).where(sql`${table.role} = 'primary'`),
    index("idx_question_outcomes_outcome").on(table.outcomeId, table.questionId),
  ],
);

/** Files a question needs to render. Keys only: a URL is created on request and never stored. */
export const questionAssets = pgTable(
  "question_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    bucket: text("bucket").notNull().default("question-assets"),
    objectKey: text("object_key").notNull(),
    alt: text("alt").notNull(),
    contentType: text("content_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("question_assets_object_key").on(table.questionId, table.bucket, table.objectKey),
    check("question_assets_not_url", sql`${table.objectKey} !~* '^[a-z][a-z0-9+.-]*://'`),
  ],
);

/**
 * The review audit trail. `reviewer_id` is null for the development seed's system reviewer.
 * `checklist` is { curriculum, answer, clarity, ageAppropriate }.
 */
export const questionReviews = pgTable(
  "question_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    reviewerId: uuid("reviewer_id").references(() => parentProfiles.id, { onDelete: "restrict" }),
    decision: questionReviewDecision("decision").notNull(),
    checklist: jsonb("checklist").$type<Record<string, boolean>>().notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_question_reviews_question").on(table.questionId, table.createdAt)],
);

export type QuestionFamily = typeof questionFamilies.$inferSelect;
export type QuestionRow = typeof questions.$inferSelect;
export type NewQuestionRow = typeof questions.$inferInsert;
export type QuestionOutcomeRow = typeof questionOutcomes.$inferSelect;
export type QuestionAssetRow = typeof questionAssets.$inferSelect;
export type QuestionReviewRow = typeof questionReviews.$inferSelect;
