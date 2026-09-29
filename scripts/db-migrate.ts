import { existsSync } from "node:fs";
import { createDatabase } from "../src/repositories/postgres/client";
import { runMigrations } from "../src/repositories/postgres/migrate";

// Load .env.local for local runs. Existing environment variables (CI, shell) win.
if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main(): Promise<void> {
  const handle = createDatabase(process.env.DATABASE_URL);
  try {
    await runMigrations(handle);
    console.log(`Migrations applied (${handle.kind}).`);
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exit(1);
});
