import { getDatabase, type Database } from "./client";
import { runMigrations } from "./migrate";

const globalForReady = globalThis as unknown as { __paperkakiDbReady?: Promise<void> };

/**
 * The shared database, with migrations applied first when it is an embedded PGlite database
 * (local development and browser tests have no separate migration step). PostgreSQL is
 * migrated by the deploy step (`npm run db:migrate`), never by a web request.
 */
export async function getReadyDb(): Promise<Database> {
  const handle = getDatabase();
  if (handle.kind === "pglite") {
    globalForReady.__paperkakiDbReady ??= runMigrations(handle).catch((error: unknown) => {
      delete globalForReady.__paperkakiDbReady;
      throw error;
    });
    await globalForReady.__paperkakiDbReady;
  }
  return handle.db;
}
