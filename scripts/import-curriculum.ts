import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { importCurriculum, parseCurriculumJson } from "../src/application/commands/import-curriculum";
import { CurriculumImportError, CurriculumVersionLockedError } from "../src/domain/curriculum";
import { createDatabase } from "../src/repositories/postgres/client";

// Usage: npm run curriculum:import -- content/curriculum/p3-maths-moe-2025-10.json
// Imports the file into a DRAFT curriculum version (creating it if needed). It never publishes.

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main(): Promise<number> {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npm run curriculum:import -- <file.json>");
    return 2;
  }
  const resolved = path.resolve(file);
  if (!existsSync(resolved)) {
    console.error(`File not found: ${file}`);
    return 2;
  }

  const input = parseCurriculumJson(readFileSync(resolved, "utf8"), file);
  const handle = createDatabase(process.env.DATABASE_URL);
  try {
    const summary = await importCurriculum(input, { db: handle.db });
    const counts = (label: string, value: { created: number; updated: number; removed: number }) =>
      `${label}: ${value.created} created, ${value.updated} updated, ${value.removed} removed`;
    console.log(
      summary.changed
        ? `Imported ${summary.versionCode} (${summary.versionCreated ? "new draft" : "existing draft"}).`
        : `${summary.versionCode} already matches the file. Nothing changed.`,
    );
    if (summary.changed) {
      console.log(
        [
          counts("  domains", summary.domains),
          counts("  topics", summary.topics),
          counts("  outcomes", summary.outcomes),
          counts("  source links", summary.sourceLinks),
          counts("  sources", summary.sources),
        ].join("\n"),
      );
      if (summary.verificationReset > 0) {
        console.log(`  ${summary.verificationReset} outcome(s) changed wording and need to be verified again.`);
      }
    }
    return 0;
  } catch (error) {
    if (error instanceof CurriculumImportError || error instanceof CurriculumVersionLockedError) {
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
