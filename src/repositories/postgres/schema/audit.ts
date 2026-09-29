import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { parentProfiles } from "./identity";

/**
 * Append-only record of admin and domain events (docs/ARCHITECTURE.md section 18).
 * `metadata` must never hold child answers, nicknames, tokens or other personal content.
 * The actor link is nullable and cleared, not cascaded, when a profile is deleted, so the
 * event history survives.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorProfileId: uuid("actor_profile_id").references(() => parentProfiles.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_entity").on(table.entityType, table.entityId),
    index("idx_audit_actor_time").on(table.actorProfileId, table.createdAt.desc()),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
