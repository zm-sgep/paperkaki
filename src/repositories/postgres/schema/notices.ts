import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { assessments } from "./assessments";
import { children, parentProfiles } from "./identity";

// Schema files use relative imports only: drizzle-kit loads them without the @/ alias.

/**
 * Background jobs (docs/ARCHITECTURE.md section 15): queued -> running -> succeeded | failed.
 * `attempts` counts claims, so a job that was stuck in `running` can be tried once more.
 */
export const jobStatus = pgEnum("job_status", ["queued", "running", "succeeded", "failed"]);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    /** Identifiers only (for example a source id). Never file contents or child data. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: jobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_jobs_status_created").on(table.status, table.createdAt),
    check("jobs_attempts_range", sql`${table.attempts} >= 0`),
  ],
);

export const sourceStatus = pgEnum("assessment_source_status", ["queued", "running", "succeeded", "failed"]);

/**
 * A school notice a parent uploaded (Milestone 5). The file lives in private storage; this row keeps
 * its bucket and key, never a link. Owned by the parent, and through the child. Deleting the file
 * removes the object and clears `extraction`, and keeps this row as a record that it happened.
 */
export const assessmentSources = pgTable(
  "assessment_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentProfileId: uuid("parent_profile_id")
      .notNull()
      .references(() => parentProfiles.id, { onDelete: "restrict" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "restrict" }),
    /** Set when the parent confirms "Looks right" and the assessment is created from this notice. */
    assessmentId: uuid("assessment_id").references(() => assessments.id, { onDelete: "set null" }),
    bucket: text("bucket").notNull(),
    /** The first (or only) file. */
    objectKey: text("object_key").notNull(),
    /** More pages of the same notice when it was photographed in several pictures, in order. */
    extraFiles: jsonb("extra_files").$type<{ objectKey: string; mime: string }[]>().notNull().default([]),
    mime: text("mime").notNull(),
    /** SHA-256 (hex) of the uploaded bytes, in order. */
    sha256: text("sha256").notNull(),
    byteSize: integer("byte_size").notNull(),
    pageCount: integer("page_count").notNull(),
    status: sourceStatus("status").notNull().default("queued"),
    /** unreadable | no_maths | ai_unavailable | timeout | file_missing | internal */
    failureCode: text("failure_code"),
    /** { raw, review } while the file is kept; null once it is deleted or when nothing was found. */
    extraction: jsonb("extraction").$type<Record<string, unknown>>(),
    promptVersion: text("prompt_version"),
    fileDeletedAt: timestamp("file_deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_assessment_sources_parent").on(table.parentProfileId, table.createdAt),
    check("assessment_sources_sha256", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check("assessment_sources_pages", sql`${table.pageCount} BETWEEN 1 AND 10`),
  ],
);

export type Job = typeof jobs.$inferSelect;
export type AssessmentSource = typeof assessmentSources.$inferSelect;
