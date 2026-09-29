import {
  QuestionError,
  fieldIssues,
  formatFieldIssues,
  referencedAssetKeys,
  type FieldIssue,
} from "@/domain/questions";
import type { AssetAssignment, DraftColumns, OutcomeMapping, QuestionWithFamily } from "@/repositories/postgres/questions";
import { QuestionDraftSchema, type QuestionDraft } from "@/schemas/question-content";

/**
 * Translation between the stored question rows and the QuestionDraft the domain works with.
 * Everything that comes out of storage is validated again before it is trusted.
 */

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export function parseDraft(input: unknown): QuestionDraft {
  const parsed = QuestionDraftSchema.safeParse(input);
  if (!parsed.success) {
    const issues = formatFieldIssues(fieldIssues(parsed.error));
    throw new QuestionError("invalid_draft", "This question is not valid yet.", issues);
  }
  return parsed.data;
}

export function safeParseDraft(input: unknown): { ok: true; draft: QuestionDraft } | { ok: false; issues: FieldIssue[] } {
  const parsed = QuestionDraftSchema.safeParse(input);
  return parsed.success ? { ok: true, draft: parsed.data } : { ok: false, issues: fieldIssues(parsed.error) };
}

export function draftColumns(draft: QuestionDraft, placement: { level: string; subject: string }): DraftColumns {
  return {
    level: placement.level,
    subject: placement.subject,
    questionType: draft.questionType,
    difficulty: draft.difficulty,
    cognitiveDemand: draft.cognitiveDemand,
    marks: draft.marks,
    estimatedSeconds: draft.estimatedSeconds,
    content: draft.content,
    answer: draft.answer,
    verification: draft.verification,
    workedSolution: draft.workedSolution,
    markingScheme: draft.markingScheme,
    provenance: draft.provenance,
  };
}

export function assetAssignments(draft: QuestionDraft): AssetAssignment[] {
  const alts = new Map<string, string>();
  for (const block of [...draft.content.stem, ...draft.workedSolution]) {
    if (block.t === "image" && !alts.has(block.assetKey)) alts.set(block.assetKey, block.alt);
  }
  return referencedAssetKeys(draft).map((objectKey) => ({
    objectKey,
    alt: alts.get(objectKey) ?? "",
    contentType: CONTENT_TYPES[objectKey.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream",
  }));
}

/** The stored row as a draft. `null` issues mean the stored data no longer passes the schema. */
export function rowToDraftInput(row: QuestionWithFamily, outcomes: readonly OutcomeMapping[]): unknown {
  return {
    familyCode: row.familyCode,
    familyTitle: row.familyTitle,
    primaryOutcomeCode: outcomes.find((o) => o.role === "primary")?.code ?? "",
    secondaryOutcomeCodes: outcomes.filter((o) => o.role === "secondary").map((o) => o.code),
    questionType: row.questionType,
    difficulty: row.difficulty,
    cognitiveDemand: row.cognitiveDemand,
    marks: row.marks,
    estimatedSeconds: row.estimatedSeconds,
    content: row.content,
    answer: row.answer,
    verification: row.verification,
    workedSolution: row.workedSolution,
    markingScheme: row.markingScheme,
    provenance: row.provenance,
  };
}
