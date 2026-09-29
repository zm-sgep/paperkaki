import { referencedAssetKeys } from "./lifecycle";
import { verifyQuestionAnswer } from "./verify";
import { QuestionDraftSchema } from "@/schemas/question-content";

/**
 * Consistency rules every APPROVED question must satisfy (M2-08). Pure: the caller loads the
 * records (and checks that files exist in storage); this module only judges them.
 */

export type QualityRule =
  | "one_primary_outcome"
  | "outcome_in_curriculum_version"
  | "marks_positive"
  | "answer_schema_valid"
  | "answer_verified"
  | "asset_registered"
  | "asset_in_storage"
  | "duplicate_family_version"
  | "duplicate_family_code";

export type QualityViolation = { rule: QualityRule; familyCode: string; version: number; questionId: string; message: string };

export type QualityRecord = {
  questionId: string;
  familyCode: string;
  version: number;
  familyCurriculumVersionId: string;
  curriculumVersionId: string;
  marks: number;
  /** The stored row shaped like a QuestionDraft; validated here. */
  draftInput: unknown;
  outcomes: { outcomeId: string; role: string; curriculumVersionId: string }[];
  /** Assets registered in question_assets. */
  assets: { bucket: string; objectKey: string }[];
};

function violation(record: QualityRecord, rule: QualityRule, message: string): QualityViolation {
  return { rule, familyCode: record.familyCode, version: record.version, questionId: record.questionId, message };
}

/** Rules that need only the record itself. */
export function checkRecord(record: QualityRecord): QualityViolation[] {
  const found: QualityViolation[] = [];
  const primaries = record.outcomes.filter((o) => o.role === "primary");
  if (primaries.length !== 1) {
    found.push(violation(record, "one_primary_outcome", `Expected exactly one primary outcome, found ${primaries.length}.`));
  }
  if (record.outcomes.some((o) => o.curriculumVersionId !== record.curriculumVersionId)) {
    found.push(violation(record, "outcome_in_curriculum_version", "An outcome belongs to a different curriculum version."));
  }
  if (record.curriculumVersionId !== record.familyCurriculumVersionId) {
    found.push(violation(record, "outcome_in_curriculum_version", "The question and its family are in different curriculum versions."));
  }
  if (!Number.isInteger(record.marks) || record.marks <= 0) {
    found.push(violation(record, "marks_positive", `Marks must be a positive whole number, found ${record.marks}.`));
  }

  const parsed = QuestionDraftSchema.safeParse(record.draftInput);
  if (!parsed.success) {
    found.push(
      violation(
        record,
        "answer_schema_valid",
        `Stored question fails the schema: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      ),
    );
    return found;
  }
  const verdict = verifyQuestionAnswer(parsed.data);
  if (!verdict.ok) {
    found.push(violation(record, "answer_verified", `Answer check failed: ${verdict.reasons.join("; ")}`));
  }
  const registered = new Set(record.assets.map((a) => a.objectKey));
  for (const key of referencedAssetKeys(parsed.data)) {
    if (!registered.has(key)) found.push(violation(record, "asset_registered", `Image ${key} is used in the question but has no asset record.`));
  }
  return found;
}

/** Rules that compare records with each other. */
export function checkAcrossRecords(records: readonly QualityRecord[]): QualityViolation[] {
  const found: QualityViolation[] = [];
  const versionKeys = new Map<string, QualityRecord>();
  const codeOwners = new Map<string, Set<string>>();
  for (const record of records) {
    const key = `${record.curriculumVersionId}|${record.familyCode}|${record.version}`;
    if (versionKeys.has(key)) {
      found.push(violation(record, "duplicate_family_version", `${record.familyCode} version ${record.version} appears more than once.`));
    }
    versionKeys.set(key, record);
    const codeKey = `${record.curriculumVersionId}|${record.familyCode}`;
    const owners = codeOwners.get(codeKey) ?? new Set<string>();
    owners.add(record.familyCurriculumVersionId);
    codeOwners.set(codeKey, owners);
  }
  return found;
}
