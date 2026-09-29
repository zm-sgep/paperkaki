import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { parentProfiles } from "./identity";

// Schema files use relative imports only: drizzle-kit loads them without the @/ alias.

/**
 * Curriculum tables (docs/DATA_MODEL.md section 3, ADR-0003, ADR-0012).
 *
 * Published versions are historical records: every foreign key between these tables is
 * ON DELETE RESTRICT, and a database trigger (drizzle/0002_curriculum_immutability.sql)
 * rejects changes to the contents of a published or retired version.
 */

export const curriculumVersionStatus = pgEnum("curriculum_version_status", [
  "draft",
  "published",
  "retired",
]);

export const sourceProvenance = pgEnum("source_provenance", [
  "official_moe",
  "official_seab",
  "official_school",
  "parent_provided",
  "historical_observation",
  "system_inference",
]);

export const verificationState = pgEnum("verification_state", ["unverified", "verified"]);

export const outcomeRelationshipKind = pgEnum("outcome_relationship_kind", [
  "prerequisite",
  "progression",
]);

export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    unique("subjects_code_key").on(table.code),
    unique("subjects_name_key").on(table.name),
  ],
);

export const curriculumVersions = pgTable(
  "curriculum_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    levels: text("levels").array().notNull(),
    status: curriculumVersionStatus("status").notNull().default("draft"),
    effectiveFrom: date("effective_from", { mode: "string" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => parentProfiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("curriculum_versions_code_key").on(table.code),
    index("idx_curriculum_versions_subject_status").on(table.subjectId, table.status),
  ],
);

/**
 * Where curriculum facts come from. Shared by every version; never versioned itself.
 * `code` is the stable key the import file uses to refer to the source.
 * `url` is an external reference only: the document itself is not stored here.
 */
export const sourceDocuments = pgTable("source_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique("source_documents_code_key"),
  title: text("title").notNull(),
  publisher: text("publisher").notNull(),
  url: text("url"),
  provenance: sourceProvenance("provenance").notNull(),
  verification: verificationState("verification").notNull().default("unverified"),
  accessedOn: date("accessed_on", { mode: "string" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const curriculumDomains = pgTable(
  "curriculum_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    curriculumVersionId: uuid("curriculum_version_id")
      .notNull()
      .references(() => curriculumVersions.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    title: text("title").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [unique("curriculum_domains_version_code_key").on(table.curriculumVersionId, table.code)],
);

export const curriculumTopics = pgTable(
  "curriculum_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    curriculumVersionId: uuid("curriculum_version_id")
      .notNull()
      .references(() => curriculumVersions.id, { onDelete: "restrict" }),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => curriculumDomains.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    title: text("title").notNull(),
    /** The wording a parent sees. Parent screens use this, never the title or the code. */
    parentLabel: text("parent_label").notNull(),
    level: text("level").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Quoted source wording that limits the scope of this topic. Shown to admins. */
    scopeNotes: text("scope_notes").array().notNull().default(sql`'{}'::text[]`),
  },
  (table) => [
    unique("curriculum_topics_version_code_key").on(table.curriculumVersionId, table.code),
    index("idx_curriculum_topics_version_level").on(table.curriculumVersionId, table.level),
    index("idx_curriculum_topics_domain_sort").on(table.domainId, table.sortOrder),
  ],
);

export const curriculumOutcomes = pgTable(
  "curriculum_outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    curriculumVersionId: uuid("curriculum_version_id")
      .notNull()
      .references(() => curriculumVersions.id, { onDelete: "restrict" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => curriculumTopics.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    /** The source's own wording. */
    statement: text("statement").notNull(),
    /** The wording a child sees. */
    childLabel: text("child_label").notNull(),
    level: text("level").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    verification: verificationState("verification").notNull().default("unverified"),
    verifiedBy: uuid("verified_by").references(() => parentProfiles.id, { onDelete: "restrict" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (table) => [
    unique("curriculum_outcomes_version_code_key").on(table.curriculumVersionId, table.code),
    index("idx_curriculum_outcomes_version_level").on(table.curriculumVersionId, table.level),
    index("idx_curriculum_outcomes_topic_sort").on(table.topicId, table.sortOrder),
    index("idx_curriculum_outcomes_code").on(table.code),
    check(
      "curriculum_outcomes_verified_by_person",
      sql`${table.verification} = 'unverified' OR (${table.verifiedBy} IS NOT NULL AND ${table.verifiedAt} IS NOT NULL)`,
    ),
  ],
);

export const curriculumOutcomeSources = pgTable(
  "curriculum_outcome_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outcomeId: uuid("outcome_id")
      .notNull()
      .references(() => curriculumOutcomes.id, { onDelete: "restrict" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sourceDocuments.id, { onDelete: "restrict" }),
    pageOrSection: text("page_or_section"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // NULLS NOT DISTINCT so a link without a page cannot be stored twice either.
    unique("curriculum_outcome_sources_link_key")
      .on(table.outcomeId, table.sourceId, table.pageOrSection)
      .nullsNotDistinct(),
    index("idx_curriculum_outcome_sources_source").on(table.sourceId),
  ],
);

export const outcomeRelationships = pgTable(
  "outcome_relationships",
  {
    fromOutcomeId: uuid("from_outcome_id")
      .notNull()
      .references(() => curriculumOutcomes.id, { onDelete: "restrict" }),
    toOutcomeId: uuid("to_outcome_id")
      .notNull()
      .references(() => curriculumOutcomes.id, { onDelete: "restrict" }),
    kind: outcomeRelationshipKind("kind").notNull(),
  },
  (table) => [
    primaryKey({ name: "outcome_relationships_pkey", columns: [table.fromOutcomeId, table.toOutcomeId, table.kind] }),
    check("outcome_relationships_not_self", sql`${table.fromOutcomeId} <> ${table.toOutcomeId}`),
    index("idx_outcome_relationships_to").on(table.toOutcomeId),
  ],
);

export type Subject = typeof subjects.$inferSelect;
export type CurriculumVersion = typeof curriculumVersions.$inferSelect;
export type SourceDocument = typeof sourceDocuments.$inferSelect;
export type CurriculumDomain = typeof curriculumDomains.$inferSelect;
export type CurriculumTopic = typeof curriculumTopics.$inferSelect;
export type CurriculumOutcome = typeof curriculumOutcomes.$inferSelect;
export type CurriculumOutcomeSource = typeof curriculumOutcomeSources.$inferSelect;
export type OutcomeRelationship = typeof outcomeRelationships.$inferSelect;
