import { CurriculumImportError, validateCurriculumImport } from "@/domain/curriculum";
import { recordAuditEvent } from "@/lib/audit";
import type { Database } from "@/repositories/postgres/client";
import { applyCurriculumImport, type ImportSummary } from "@/repositories/postgres/curriculum-import";
import { getReadyDb } from "@/repositories/postgres/ready";

/**
 * Imports a curriculum file (M1-04, the format is documented in src/schemas/curriculum-import.ts).
 *
 *  - Invalid files fail with every problem listed, each with its JSON path and reason.
 *  - Importing the same file twice changes nothing.
 *  - Importing into a draft version updates rows by code.
 *  - Importing into a published or retired version fails: import the changes as a new version.
 */

export type ImportCurriculumContext = {
  db?: Database;
  actorProfileId?: string | null;
  requestId?: string | null;
};

export type ImportCurriculumResult = ImportSummary;

/** `input` is the parsed JSON of the file. */
export async function importCurriculum(
  input: unknown,
  context: ImportCurriculumContext = {},
): Promise<ImportCurriculumResult> {
  const validation = validateCurriculumImport(input);
  if (!validation.ok) {
    throw new CurriculumImportError(validation.issues);
  }

  const db = context.db ?? (await getReadyDb());
  return db.transaction(async (tx) => {
    const summary = await applyCurriculumImport(tx, validation.curriculum);
    if (summary.changed) {
      await recordAuditEvent(tx, {
        action: "curriculum.imported",
        entityType: "curriculum_version",
        entityId: summary.versionId,
        actorProfileId: context.actorProfileId ?? null,
        metadata: {
          versionCode: summary.versionCode,
          versionCreated: summary.versionCreated,
          outcomes: summary.outcomes,
          topics: summary.topics,
          domains: summary.domains,
          sourceLinks: summary.sourceLinks,
          verificationReset: summary.verificationReset,
        },
        requestId: context.requestId ?? null,
      });
    }
    return summary;
  });
}

/** Parses JSON text, reporting a syntax error as an import error rather than a stack trace. */
export function parseCurriculumJson(text: string, fileLabel = "the file"): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid JSON";
    throw new CurriculumImportError([{ path: "", message: `${fileLabel} is not valid JSON (${reason})` }]);
  }
}
