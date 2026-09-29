import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { importQuestions, parseQuestionsJson, QuestionImportError } from "../src/application/commands/import-questions";
import { createDatabase } from "../src/repositories/postgres/client";
import { runMigrations } from "../src/repositories/postgres/migrate";

// Usage: npm run questions:import -- <file.json> [--curriculum <version-code>]
// Imports the file as DRAFT questions. It never approves anything: approval is a review step in
// /admin/questions. Safe to run again: questions already in the bank are left alone.
// Without --curriculum the newest published curriculum version is used.

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const flag = args.indexOf("--curriculum");
  const curriculumVersionCode = flag >= 0 ? args[flag + 1] : undefined;
  if (flag >= 0 && !curriculumVersionCode) {
    console.error("--curriculum needs a curriculum version code.");
    return 2;
  }
  const flagValueIndex = flag >= 0 ? flag + 1 : -1;
  const file = args.find((arg, i) => !arg.startsWith("--") && i !== flagValueIndex);
  if (!file) {
    console.error("Usage: npm run questions:import -- <file.json> [--curriculum <version-code>]");
    return 2;
  }
  const resolved = path.resolve(file);
  if (!existsSync(resolved)) {
    console.error(`File not found: ${file}`);
    return 2;
  }

  const handle = createDatabase(process.env.DATABASE_URL);
  try {
    // Embedded (PGlite) databases have no separate deploy step; PostgreSQL is migrated by `npm run db:migrate`.
    if (handle.kind === "pglite") await runMigrations(handle);
    const input = parseQuestionsJson(readFileSync(resolved, "utf8"), file);
    const summary = await importQuestions(input, { db: handle.db, curriculumVersionCode });
    console.log(
      `Imported ${file} into ${summary.curriculumVersionCode}: ${summary.created} new, ${summary.revised} corrected, ` +
        `${summary.updatedDrafts} draft(s) updated, ${summary.unchanged} unchanged (${summary.total} in the file).`,
    );
    if (summary.verifierWarnings.length > 0) {
      console.warn(`${summary.verifierWarnings.length} question(s) fail the automatic answer check and cannot be approved as they are:`);
      for (const warning of summary.verifierWarnings) console.warn(`  - ${warning}`);
    }
    return 0;
  } catch (error) {
    if (error instanceof QuestionImportError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  } finally {
    await handle.close();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Import failed.");
    process.exit(1);
  });
