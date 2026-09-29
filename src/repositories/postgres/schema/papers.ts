import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { assessmentBlueprints, assessments } from "./assessments";
import { parentProfiles } from "./identity";
import { questions } from "./questions";

// Schema files use relative imports only: drizzle-kit loads them without the @/ alias.

/**
 * Frozen mock papers (docs/ARCHITECTURE.md section 9, ADR-0004, ADR-0005).
 *
 * A paper is created once, complete: its question list, its PDFs and its report are all written in
 * the same transaction, so a paper row never exists half-made. `paper_questions` points at exact
 * question version ids. Every foreign key is ON DELETE RESTRICT: papers are never deleted and the
 * questions they use can never be deleted. A database trigger (drizzle/0007_paper_immutability.sql)
 * makes the question list append-only inside the creating transaction and read-only afterwards.
 *
 * PDFs are private files: only the bucket and object key are stored, never a link.
 */

export const paperStatus = pgEnum("paper_status", ["generated", "retired"]);

export const papers = pgTable(
  "papers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "restrict" }),
    /** The exact blueprint version this paper was built from. */
    blueprintId: uuid("blueprint_id")
      .notNull()
      .references(() => assessmentBlueprints.id, { onDelete: "restrict" }),
    /** Mock 1, 2, 3 ... within one assessment. */
    number: integer("number").notNull(),
    status: paperStatus("status").notNull().default("generated"),
    /** The seed the selector used: the same seed, blueprint and bank give the same paper. */
    seed: text("seed").notNull(),
    /** One key per generation request, so a repeated request returns this paper instead of another one. */
    requestKey: text("request_key").notNull(),
    /** Marks by section and topic, difficulty mix and the scope report. Internal, not shown to parents. */
    selectionReport: jsonb("selection_report").$type<Record<string, unknown>>().notNull(),
    studentPdfBucket: text("student_pdf_bucket").notNull(),
    studentPdfKey: text("student_pdf_key").notNull(),
    answerPdfBucket: text("answer_pdf_bucket").notNull(),
    answerPdfKey: text("answer_pdf_key").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => parentProfiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("papers_assessment_number_key").on(table.assessmentId, table.number),
    unique("papers_request_key_key").on(table.requestKey),
    index("idx_papers_assessment").on(table.assessmentId, table.number),
    check("papers_number_positive", sql`${table.number} >= 1`),
    check(
      "papers_keys_not_urls",
      sql`${table.studentPdfKey} !~* '^[a-z][a-z0-9+.-]*://' AND ${table.answerPdfKey} !~* '^[a-z][a-z0-9+.-]*://'`,
    ),
  ],
);

export const paperQuestions = pgTable(
  "paper_questions",
  {
    paperId: uuid("paper_id")
      .notNull()
      .references(() => papers.id, { onDelete: "restrict" }),
    /** The printed question number, 1 upward. */
    position: integer("position").notNull(),
    /** "A" (multiple choice) or "B" (short answer). */
    sectionCode: text("section_code").notNull(),
    /** The exact question version. A correction is a new version, never an edit of this row. */
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    marks: integer("marks").notNull(),
  },
  (table) => [
    primaryKey({ name: "paper_questions_pkey", columns: [table.paperId, table.position] }),
    unique("paper_questions_question_key").on(table.paperId, table.questionId),
    index("idx_paper_questions_question").on(table.questionId),
    check("paper_questions_position_positive", sql`${table.position} >= 1`),
    check("paper_questions_marks_positive", sql`${table.marks} > 0`),
    check("paper_questions_section", sql`${table.sectionCode} IN ('A', 'B')`),
  ],
);

export type Paper = typeof papers.$inferSelect;
export type NewPaper = typeof papers.$inferInsert;
export type PaperQuestionRow = typeof paperQuestions.$inferSelect;
