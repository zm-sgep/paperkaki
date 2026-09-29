import { createDatabase, type Database } from "@/repositories/postgres/client";
import { runMigrations } from "@/repositories/postgres/migrate";

export type TestDatabase = {
  db: Database;
  /** Releases the in-memory database. Call it from `afterAll`. */
  close: () => Promise<void>;
};

/**
 * A fresh, fully migrated in-memory PGlite database. Call once per test file (in
 * `beforeAll`) so files never share rows. No server, no files, no real data.
 */
export async function createTestDb(): Promise<TestDatabase> {
  const handle = createDatabase("pglite://memory");
  await runMigrations(handle);
  return { db: handle.db, close: handle.close };
}
