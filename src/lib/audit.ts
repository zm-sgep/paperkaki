import type { Database } from "@/repositories/postgres/client";
import { auditLogs, type AuditLog } from "@/repositories/postgres/schema";
import { findSensitiveKeys } from "./sensitive-keys";

export type AuditEventInput = {
  /** What happened, e.g. "reward.redeemed". Stable, machine-readable. */
  action: string;
  /** The kind of thing it happened to, e.g. "reward". */
  entityType: string;
  entityId?: string | null;
  /** The signed-in parent or admin who caused it. Null for system events. */
  actorProfileId?: string | null;
  /** Identifiers and counts only. Never child answers, nicknames, emails or tokens. */
  metadata?: Record<string, unknown>;
  requestId?: string | null;
};

/**
 * Appends one row to the audit log (append-only: there is no update or delete helper).
 * Refuses metadata that contains a sensitive field name, so personal content cannot
 * reach the log by accident.
 */
export async function recordAuditEvent(db: Database, event: AuditEventInput): Promise<AuditLog> {
  const metadata = event.metadata ?? {};
  const sensitive = findSensitiveKeys(metadata);
  if (sensitive.length > 0) {
    throw new Error(`Audit metadata must not contain sensitive fields: ${sensitive.join(", ")}`);
  }

  const [row] = await db
    .insert(auditLogs)
    .values({
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      actorProfileId: event.actorProfileId ?? null,
      metadata,
      requestId: event.requestId ?? null,
    })
    .returning();

  if (!row) {
    throw new Error("Audit event was not stored.");
  }
  return row;
}
