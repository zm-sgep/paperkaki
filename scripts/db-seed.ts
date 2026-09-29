import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseCurriculumJson } from "../src/application/commands/import-curriculum";
import { QuestionImportError, parseQuestionsJson } from "../src/application/commands/import-questions";
import { SeedRefusedError, seedDevelopmentCurriculum } from "../src/application/commands/seed-dev-curriculum";
import { seedDevelopmentQuestions } from "../src/application/commands/seed-dev-questions";
import { CurriculumImportError } from "../src/domain/curriculum";
import { createDatabase } from "../src/repositories/postgres/client";
import { runMigrations } from "../src/repositories/postgres/migrate";

// Development seed: migrate, import the P3 Mathematics curriculum, publish it with unverified
// outcomes allowed (ADR-0012), then import every question file in content/questions/ and
// AUTO-APPROVE the questions as the system reviewer so paper generation has a bank to use.
// That approval is a development fixture, not human review: each one is marked "Development
// fixture: auto-approved, needs human review before production", and a question whose answer
// fails the automatic check stays a draft. Safe to run again. Refuses to run in production.
// In production use `npm run curriculum:import` and `npm run questions:import`, then review.

const CURRICULUM_FILE = "content/curriculum/p3-maths-moe-2025-10.json";
const QUESTIONS_DIR = "content/questions";

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

    const questionFiles = readdirSync(path.resolve(QUESTIONS_DIR))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => {
        const label = `${QUESTIONS_DIR}/${name}`;
        return { label, input: parseQuestionsJson(readFileSync(path.resolve(label), "utf8"), label) };
      });
    const questions = await seedDevelopmentQuestions(questionFiles, {
      db: handle.db,
      curriculumVersionCode: (input as { curriculumVersion: { code: string } }).curriculumVersion.code,
    });
    console.log(
      `Questions: ${questions.imported.created} imported, ${questions.imported.unchanged} unchanged, ` +
        `${questions.approved} auto-approved (development fixture, needs human review before production).`,
    );
    if (questions.blocked.length > 0) {
      console.warn(`${questions.blocked.length} question(s) failed the answer check and were left as drafts:`);
      for (const line of questions.blocked) console.warn(`  - ${line}`);
    }
    return 0;
  } catch (error) {
    if (error instanceof CurriculumImportError || error instanceof SeedRefusedError || error instanceof QuestionImportError) {
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
