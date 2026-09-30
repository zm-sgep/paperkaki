import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Schema files use relative imports only: drizzle-kit loads them without the @/ alias.

/**
 * One row per model call (ADR-0002): what ran and how it went, for cost and quality tracking.
 * Deliberately holds no file contents, no prompts or answers and no child or parent data.
 */
export const aiRuns = pgTable(
  "ai_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    task: text("task").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status").notNull(),
    durationMs: integer("duration_ms").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ai_runs_created").on(table.createdAt),
    check("ai_runs_status", sql`${table.status} IN ('succeeded', 'failed')`),
    check("ai_runs_duration", sql`${table.durationMs} >= 0`),
  ],
);

export type AiRun = typeof aiRuns.$inferSelect;
