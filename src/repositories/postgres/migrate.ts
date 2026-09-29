import path from "node:path";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { DatabaseHandle } from "./client";
import type * as schema from "./schema";

export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "drizzle");

/** Applies every pending migration in `drizzle/` to either driver. Idempotent. */
export async function runMigrations(
  handle: Pick<DatabaseHandle, "kind" | "db">,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<void> {
  if (handle.kind === "postgres") {
    await migrateNodePg(handle.db as NodePgDatabase<typeof schema>, { migrationsFolder });
  } else {
    await migratePglite(handle.db as PgliteDatabase<typeof schema>, { migrationsFolder });
  }
}
