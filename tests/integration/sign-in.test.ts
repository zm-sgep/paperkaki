import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { signIn } from "@/application/commands/sign-in";
import type { Database } from "@/repositories/postgres/client";
import { auditLogs, parentProfiles } from "@/repositories/postgres/schema";
import { createDevAuthService } from "@/services/auth/dev-adapter";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

const secret = "integration-test-secret-at-least-32-chars";

describe("dev sign-in", () => {
  let testDb: TestDatabase;
  let db: Database;
  const auth = createDevAuthService({ secret, adminEmails: "Admin@example.test" });

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("upserts one profile for repeated sign-ins with different email casing", async () => {
    const first = await signIn({ db, auth }, { email: "Repeat.Parent@Example.test" });
    const second = await signIn({ db, auth }, { email: "  repeat.parent@example.TEST " });
    const third = await signIn({ db, auth }, { email: "REPEAT.PARENT@EXAMPLE.TEST" });
    expect(first.ok && second.ok && third.ok).toBe(true);
    if (!first.ok || !second.ok || !third.ok) return;

    expect(second.profile.id).toBe(first.profile.id);
    expect(third.profile.id).toBe(first.profile.id);

    const rows = await db.select().from(parentProfiles).where(eq(parentProfiles.authSubject, "repeat.parent@example.test"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ authProvider: "dev", email: "repeat.parent@example.test", role: "parent" });
  });

  it("returns a session that names the profile", async () => {
    const result = await signIn({ db, auth }, { email: "session.parent@example.test" });
    if (!result.ok) throw new Error("expected sign-in to succeed");
    expect((await auth.readSession(result.sessionToken))?.parentProfileId).toBe(result.profile.id);
  });

  it("gives listed emails the admin role, any casing", async () => {
    const result = await signIn({ db, auth }, { email: "ADMIN@example.test" });
    expect(result.ok && result.profile.role).toBe("admin");
  });

  it("records an audit event with ids only, no email", async () => {
    const result = await signIn({ db, auth }, { email: "audited.parent@example.test", requestId: "req-audit-0001" });
    if (!result.ok) throw new Error("expected sign-in to succeed");
    const events = await db.select().from(auditLogs).where(eq(auditLogs.entityId, result.profile.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "auth.signed_in",
      actorProfileId: result.profile.id,
      requestId: "req-audit-0001",
      metadata: { provider: "dev", role: "parent" },
    });
    expect(JSON.stringify(events[0]?.metadata)).not.toContain("audited.parent");
  });

  it("rejects text that is not an email and stores nothing", async () => {
    const before = await db.select().from(parentProfiles);
    expect(await signIn({ db, auth }, { email: "not an email" })).toEqual({ ok: false, reason: "invalid_email" });
    expect(await db.select().from(parentProfiles)).toHaveLength(before.length);
  });
});
