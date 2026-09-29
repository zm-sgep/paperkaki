import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseCurriculumJson } from "../src/application/commands/import-curriculum";
import { SeedRefusedError, seedDevelopmentCurriculum } from "../src/application/commands/seed-dev-curriculum";
import { CurriculumImportError } from "../src/domain/curriculum";
import { createDatabase } from "../src/repositories/postgres/client";
import { runMigrations } from "../src/repositories/postgres/migrate";

// Development seed: migrate, import the P3 Mathematics curriculum, publish it with unverified
// outcomes allowed (ADR-0012). Safe to run again. Refuses to run in production.

const CURRICULUM_FILE = "content/curriculum/p3-maths-moe-2025-10.json";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main(): Promise<number> {
  if (process.env.NODE_ENV === "production") {
    console.error(new SeedRefusedError().message);
    return 1;
  }

  const handle = createDatabase(process.env.DATABASE_URL);
  try {
    await runMigrations(handle);
    const input = parseCurriculumJson(readFileSync(path.resolve(CURRICULUM_FILE), "utf8"), CURRICULUM_FILE);
    const result = await seedDevelopmentCurriculum(input, { db: handle.db });
    if (result.status === "already-published") {
      console.log(
        `${result.versionCode} is already published; nothing to do. ` +
          "Published versions never change: delete the development database to start over.",
      );
    } else {
      console.log(
        `Seeded ${result.versionCode}: ${result.outcomeCount} outcomes published ` +
          `(${result.unverifiedCount} unverified, development only).`,
      );
    }
    return 0;
  } catch (error) {
    if (error instanceof CurriculumImportError || error instanceof SeedRefusedError) {
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
    console.error(error instanceof Error ? error.message : "Seed failed.");
    process.exit(1);
  });
