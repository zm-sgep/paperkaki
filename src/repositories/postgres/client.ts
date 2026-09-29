import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Database access. The driver is chosen from DATABASE_URL:
 *
 *   postgres:// or postgresql://  -> PostgreSQL through node-postgres (Pool)
 *   pglite://memory               -> in-memory PGlite (tests, throwaway runs)
 *   pglite://<dir>                -> file-backed PGlite (local development, no server needed)
 *
 * Both drivers expose the same Drizzle query API, so callers depend on `Database` only.
 * Error messages name DATABASE_URL and never print its value (it may hold credentials).
 */

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DatabaseKind = "postgres" | "pglite";

export type DatabaseHandle = {
  kind: DatabaseKind;
  db: Database;
  /** Releases the connection pool or the embedded database. */
  close: () => Promise<void>;
};

export function createDatabase(url: string | undefined): DatabaseHandle {
  if (!url) {
    throw new Error("DATABASE_URL is required.");
  }

  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const pool = new Pool({ connectionString: url });
    return {
      kind: "postgres",
      db: drizzleNodePg(pool, { schema }),
      close: () => pool.end(),
    };
  }

  if (url.startsWith("pglite://")) {
    const location = url.slice("pglite://".length);
    if (location === "") {
      throw new Error("DATABASE_URL must be pglite://memory or pglite://<directory>.");
    }
    if (location !== "memory") {
      // PGlite creates only the last folder of the path. On a fresh clone `.data/` does not
      // exist yet, so create the parent folders first.
      mkdirSync(dirname(resolve(location)), { recursive: true });
    }
    const client = new PGlite(location === "memory" ? undefined : location);
    return {
      kind: "pglite",
      db: drizzlePglite(client, { schema }),
      close: () => client.close(),
    };
  }

  throw new Error("DATABASE_URL must start with postgres://, postgresql:// or pglite://.");
}

const globalForDb = globalThis as unknown as { __paperkakiDb?: DatabaseHandle };

/**
 * The shared handle for the running app. Cached on `globalThis` so hot reloads in development
 * and separately bundled routes in production all use one pool or one embedded database.
 */
export function getDatabase(): DatabaseHandle {
  if (globalForDb.__paperkakiDb) {
    return globalForDb.__paperkakiDb;
  }
  const handle = createDatabase(process.env.DATABASE_URL);
  globalForDb.__paperkakiDb = handle;
  return handle;
}

export function getDb(): Database {
  return getDatabase().db;
}
