import { checkAcrossRecords, checkRecord, type QualityRecord, type QualityViolation } from "@/domain/questions";
import type { Database } from "@/repositories/postgres/client";
import { getReadyDb } from "@/repositories/postgres/ready";
import { listApprovedWithMappings } from "@/repositories/postgres/questions";
import { isStorageBucket, type StorageService } from "@/services/storage/types";
import { rowToDraftInput } from "../question-drafts";

/**
 * Runs the question-bank consistency rules over every APPROVED question (M2-08). Returns the
 * violations; an empty list means the bank is consistent. Used by the quality test suite and
 * usable from an admin check later. `storage` only needs `exists`.
 */
export async function checkQuestionBankQuality(
  input: { db?: Database; storage: Pick<StorageService, "exists"> },
): Promise<{ checked: number; violations: QualityViolation[] }> {
  const db = input.db ?? (await getReadyDb());
  const { rows, mappings, assets } = await listApprovedWithMappings(db);

  const records: QualityRecord[] = rows.map(({ question, familyCode, familyTitle, familyCurriculumVersionId }) => {
    const own = mappings.filter((m) => m.questionId === question.id);
    const outcomes = own.map((m) => ({ outcomeId: m.outcomeId, role: m.role, curriculumVersionId: m.outcomeVersionId }));
    const questionAssets = assets.filter((a) => a.questionId === question.id);
    return {
      questionId: question.id,
      familyCode,
      version: question.version,
      familyCurriculumVersionId,
      curriculumVersionId: question.curriculumVersionId,
      marks: question.marks,
      draftInput: rowToDraftInput(
        { ...question, familyCode, familyTitle },
        own.map((o) => ({
          outcomeId: o.outcomeId,
          code: o.outcomeCode,
          role: o.role,
          statement: "",
          childLabel: "",
          topicId: "",
          topicTitle: "",
        })),
      ),
      outcomes,
      assets: questionAssets.map((a) => ({ bucket: a.bucket, objectKey: a.objectKey })),
    };
  });

  const violations: QualityViolation[] = [...checkAcrossRecords(records)];
  for (const record of records) {
    violations.push(...checkRecord(record));
    for (const asset of record.assets) {
      const present =
        isStorageBucket(asset.bucket) && (await input.storage.exists({ bucket: asset.bucket, key: asset.objectKey }));
      if (!present) {
        violations.push({
          rule: "asset_in_storage",
          familyCode: record.familyCode,
          version: record.version,
          questionId: record.questionId,
          message: `Asset ${asset.bucket}/${asset.objectKey} is not in storage.`,
        });
      }
    }
  }
  return { checked: records.length, violations };
}
