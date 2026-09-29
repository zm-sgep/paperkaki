import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { curriculumOutcomes, curriculumTopics, curriculumVersions } from "./curriculum";
import { children } from "./identity";

// Schema files use relative imports only: drizzle-kit loads them without the @/ alias.

/**
 * Assessment setup tables (docs/DATA_MODEL.md sections 4 and 6, M3).
 *
 * An assessment belongs to one child, so every read and write is scoped to the parent through
 * `children.parent_profile_id`. Scope (what the school tests) is stored apart from requirements
 * (marks, time, difficulty: the parent's own paper settings). Blueprints are versioned copies of
 * the internal paper design; the parent never sees the word.
 */

export const assessmentType = pgEnum("assessment_type", [
  "wa1",
  "wa2",
  "wa3",
  "end_of_year",
  "class_test",
  "other",
]);

export const assessmentStatus = pgEnum("assessment_status", ["draft", "scope_confirmed"]);

export const difficultyPreset = pgEnum("assessment_difficulty", ["easier", "balanced", "harder"]);

export const requirementsSource = pgEnum("assessment_requirements_source", ["recommended", "parent"]);

export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "restrict" }),
    curriculumVersionId: uuid("curriculum_version_id")
      .notNull()
      .references(() => curriculumVersions.id, { onDelete: "restrict" }),
    subject: text("subject").notNull(),
    level: text("level").notNull(),
    assessmentType: assessmentType("assessment_type").notNull(),
    /** Derived label such as "WA2", or the parent's own text for type `other`. */
    name: text("name").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    status: assessmentStatus("status").notNull().default("draft"),
    scopeConfirmedAt: timestamp("scope_confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_assessments_child_date").on(table.childId, table.date),
    check("assessments_name_length", sql`char_length(${table.name}) BETWEEN 1 AND 40`),
    check(
      "assessments_confirmed_has_time",
      sql`(${table.status} = 'scope_confirmed') = (${table.scopeConfirmedAt} IS NOT NULL)`,
    ),
  ],
);

export const assessmentScopeItems = pgTable(
  "assessment_scope_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => curriculumTopics.id, { onDelete: "restrict" }),
    outcomeId: uuid("outcome_id")
      .notNull()
      .references(() => curriculumOutcomes.id, { onDelete: "restrict" }),
  },
  (table) => [
    unique("assessment_scope_items_outcome_key").on(table.assessmentId, table.outcomeId),
    index("idx_assessment_scope_items_topic").on(table.assessmentId, table.topicId),
  ],
);

export const assessmentRequirements = pgTable(
  "assessment_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    totalMarks: integer("total_marks").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    difficulty: difficultyPreset("difficulty").notNull(),
    source: requirementsSource("source").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("assessment_requirements_assessment_key").on(table.assessmentId),
    check("assessment_requirements_marks_range", sql`${table.totalMarks} BETWEEN 10 AND 60`),
    check("assessment_requirements_minutes_range", sql`${table.durationMinutes} BETWEEN 15 AND 120`),
  ],
);

export const assessmentBlueprints = pgTable(
  "assessment_blueprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** The full Blueprint (src/domain/assessments/blueprint.ts) as it was when this version was made. */
    spec: jsonb("spec").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("assessment_blueprints_version_key").on(table.assessmentId, table.version),
    check("assessment_blueprints_version_positive", sql`${table.version} >= 1`),
  ],
);

export const blueprintScopeItems = pgTable(
  "blueprint_scope_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blueprintId: uuid("blueprint_id")
      .notNull()
      .references(() => assessmentBlueprints.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => curriculumTopics.id, { onDelete: "restrict" }),
    targetMarks: integer("target_marks").notNull(),
    sectionAMarks: integer("section_a_marks").notNull(),
    sectionBMarks: integer("section_b_marks").notNull(),
  },
  (table) => [
    unique("blueprint_scope_items_topic_key").on(table.blueprintId, table.topicId),
    check(
      "blueprint_scope_items_marks_add_up",
      sql`${table.sectionAMarks} + ${table.sectionBMarks} = ${table.targetMarks}`,
    ),
  ],
);

export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;
export type AssessmentScopeItem = typeof assessmentScopeItems.$inferSelect;
export type AssessmentRequirements = typeof assessmentRequirements.$inferSelect;
export type AssessmentBlueprint = typeof assessmentBlueprints.$inferSelect;
