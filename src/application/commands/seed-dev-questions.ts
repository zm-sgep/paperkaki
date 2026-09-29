import { QuestionError } from "@/domain/questions";
import type { Database } from "@/repositories/postgres/client";
import { findVersionByCode } from "@/repositories/postgres/curriculum";
import { listDraftIdsInFamilies } from "@/repositories/postgres/questions";
import type { ReviewChecklist } from "@/domain/questions";
import { SeedRefusedError } from "./seed-dev-curriculum";
import { importQuestions, QuestionImportError, type ImportQuestionsSummary } from "./import-questions";
import { reviewQuestion, submitForReview } from "./questions";

/**
 * Development seed for the question bank (M2-07). Development and test only: it refuses when
 * NODE_ENV=production, exactly like the curriculum seed.
 *
 * It imports the question files as drafts and then AUTO-APPROVES them as the system reviewer so
 * that paper generation has a bank to draw from on a fresh development database. That approval is
 * not human review: every approval carries the note below, and the answer check still has to pass
 * (a question whose answer does not verify stays a draft). In production, import with
 * `npm run questions:import` and have named admins approve each question in /admin/questions.
 */

export const DEV_FIXTURE_NOTE = "Development fixture: auto-approved, needs human review before production";

const ALL_TICKED: ReviewChecklist = { curriculum: true, answer: true, clarity: true, ageAppropriate: true };

export type QuestionSeedResult = {
  curriculumVersionCode: string;
  files: number;
  imported: Pick<ImportQuestionsSummary, "total" | "created" | "revised" | "updatedDrafts" | "unchanged" | "familiesCreated">;
  approved: number;
  /** Questions left as drafts because the automatic answer check refused them. */
  blocked: string[];
};

export async function seedDevelopmentQuestions(
  files: { label: string; input: unknown }[],
  options: { db: Database; curriculumVersionCode: string; nodeEnv?: string | undefined },
): Promise<QuestionSeedResult> {
  const nodeEnv = "nodeEnv" in options ? options.nodeEnv : process.env.NODE_ENV;
  if (nodeEnv === "production") {
    throw new SeedRefusedError();
  }
  const version = await findVersionByCode(options.db, options.curriculumVersionCode);
  if (!version) {
    throw new QuestionImportError([`Curriculum version ${options.curriculumVersionCode} was not found. Seed the curriculum first.`]);
  }

  const imported = { total: 0, created: 0, revised: 0, updatedDrafts: 0, unchanged: 0, familiesCreated: 0 };
  const familyCodes = new Set<string>();
  for (const file of files) {
    let summary: ImportQuestionsSummary;
    try {
      summary = await importQuestions(file.input, { db: options.db, curriculumVersionCode: version.code });
    } catch (error) {
      if (error instanceof QuestionImportError) {
        throw new QuestionImportError([`${file.label}:`, ...error.issues]);
      }
      throw error;
    }
    for (const key of Object.keys(imported) as (keyof typeof imported)[]) imported[key] += summary[key];
    for (const entry of file.input as { familyCode: string }[]) familyCodes.add(entry.familyCode);
  }

  let approved = 0;
  const blocked: string[] = [];
  const systemContext = { db: options.db, nodeEnv };
  for (const questionId of await listDraftIdsInFamilies(options.db, version.id, [...familyCodes])) {
    await submitForReview({ questionId }, { system: true }, systemContext);
    try {
      await reviewQuestion({ questionId, decision: "approved", checklist: ALL_TICKED, notes: DEV_FIXTURE_NOTE }, { system: true }, systemContext);
      approved += 1;
    } catch (error) {
      if (!(error instanceof QuestionError) || error.code !== "review_blocked") throw error;
      blocked.push(`${questionId}: ${error.issues.join("; ")}`);
    }
  }
  return { curriculumVersionCode: version.code, files: files.length, imported, approved, blocked };
}
