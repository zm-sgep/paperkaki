import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { Database } from "@/repositories/postgres/client";
import { parentProfiles } from "@/repositories/postgres/schema";
import { buildParentProfile, insertParentProfile } from "../factories";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

describe("initial migration", () => {
  let testDb: TestDatabase;
  let db: Database;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("creates parent_profiles and audit_logs", async () => {
    // Both drivers return `{ rows }`; the shared Database type leaves the result untyped.
    const result = (await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    )) as unknown as { rows: { table_name: string }[] };
    const names = result.rows.map((row) => row.table_name);
    expect(names).toEqual(expect.arrayContaining(["audit_logs", "parent_profiles"]));
  });

  it("applies defaults: generated id, parent role and timestamps", async () => {
    const row = await insertParentProfile(db, "A", { id: undefined, role: undefined });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.role).toBe("parent");
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.email).toBe("parent-a@example.test");
  });

  it("rejects a second profile for the same sign-in identity", async () => {
    await insertParentProfile(db, "B");
    await expect(
      db.insert(parentProfiles).values(buildParentProfile("C", { authSubject: "test-subject-b" })),
    ).rejects.toThrow();
  });

  it("gives each test database its own rows", async () => {
    const other = await createTestDb();
    try {
      const rows = await other.db.select().from(parentProfiles);
      expect(rows).toHaveLength(0);
    } finally {
      await other.close();
    }
  });
});
