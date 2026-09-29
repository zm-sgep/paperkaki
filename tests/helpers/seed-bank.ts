import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { seedDevelopmentCurriculum } from "@/application/commands/seed-dev-curriculum";
import { seedDevelopmentQuestions, type QuestionSeedResult } from "@/application/commands/seed-dev-questions";
import type { Database } from "@/repositories/postgres/client";
import { silentLogger } from "./silent-logger";

const root = path.resolve(import.meta.dirname, "../../content");

export function readContentQuestionFiles(): { label: string; input: unknown }[] {
  return readdirSync(path.join(root, "questions"))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ label: name, input: JSON.parse(readFileSync(path.join(root, "questions", name), "utf8")) as unknown }));
}

/** The real P3 curriculum (unverified, published) plus the real question bank, auto-approved as in `npm run db:seed`. */
export async function seedRealBank(db: Database): Promise<QuestionSeedResult & { versionCode: string }> {
  const curriculum = JSON.parse(readFileSync(path.join(root, "curriculum/p3-maths-moe-2025-10.json"), "utf8")) as {
    curriculumVersion: { code: string };
  };
  await seedDevelopmentCurriculum(curriculum, { db, nodeEnv: "test", logger: silentLogger });
  const result = await seedDevelopmentQuestions(readContentQuestionFiles(), {
    db,
    curriculumVersionCode: curriculum.curriculumVersion.code,
    nodeEnv: "test",
  });
  return { ...result, versionCode: curriculum.curriculumVersion.code };
}
