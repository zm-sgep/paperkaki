import { defineConfig } from "drizzle-kit";

// Used by `npm run db:generate` only. Generating a migration reads the schema files and
// never connects to a database. Applying migrations is done by scripts/db-migrate.ts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/repositories/postgres/schema/index.ts",
  out: "./drizzle",
});
