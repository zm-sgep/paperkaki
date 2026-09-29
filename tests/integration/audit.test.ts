import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Database } from "@/repositories/postgres/client";
import { auditLogs, parentProfiles } from "@/repositories/postgres/schema";
import { recordAuditEvent } from "@/lib/audit";
import { insertParentProfile } from "../factories";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

describe("recordAuditEvent", () => {
  let testDb: TestDatabase;
  let db: Database;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("stores the event with actor, entity, metadata and request ID", async () => {
    const actor = await insertParentProfile(db, "A");
    const entityId = "00000000-0000-4000-8000-0000000000e1";

    const row = await recordAuditEvent(db, {
      action: "reward.redeemed",
      entityType: "reward",
      entityId,
      actorProfileId: actor.id,
      metadata: { pointsSpent: 50 },
      requestId: "req-12345678",
    });

    expect(row).toMatchObject({
      action: "reward.redeemed",
      entityType: "reward",
      entityId,
      actorProfileId: actor.id,
      metadata: { pointsSpent: 50 },
      requestId: "req-12345678",
    });
    expect(row.createdAt).toBeInstanceOf(Date);
    const stored = await db.select().from(auditLogs).where(eq(auditLogs.id, row.id));
    expect(stored).toHaveLength(1);
  });

  it("defaults optional fields for system events", async () => {
    const row = await recordAuditEvent(db, { action: "seed.completed", entityType: "system" });
    expect(row).toMatchObject({ actorProfileId: null, entityId: null, metadata: {}, requestId: null });
  });

  it("refuses metadata that holds personal content", async () => {
    await expect(
      recordAuditEvent(db, {
        action: "profile.updated",
        entityType: "profile",
        metadata: { changes: { email: "parent-a@example.test" } },
      }),
    ).rejects.toThrow(/changes\.email/);
  });

  it("keeps the event when the actor profile is deleted", async () => {
    const actor = await insertParentProfile(db, "D");
    const row = await recordAuditEvent(db, {
      action: "profile.deleted",
      entityType: "profile",
      actorProfileId: actor.id,
    });
    await db.delete(parentProfiles).where(eq(parentProfiles.id, actor.id));
    const [after] = await db.select().from(auditLogs).where(eq(auditLogs.id, row.id));
    expect(after).toMatchObject({ id: row.id, actorProfileId: null });
  });
});
