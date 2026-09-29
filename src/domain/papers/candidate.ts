import type { BlueprintScopeItem } from "@/domain/assessments/blueprint";
import { marksAllowedForKind, questionKindOf, type FormatSection, type PaperFormat } from "@/domain/assessments/paper-format";
import type { PaperInventory, SectionInventory } from "@/domain/assessments/validate-blueprint";
import type { Difficulty, QuestionType } from "@/schemas/question-content";

/** An approved question that may be placed on a paper. */
export type Candidate = {
  questionId: string;
  familyId: string;
  topicId: string;
  primaryOutcomeId: string;
  questionType: QuestionType;
  difficulty: Difficulty;
  marks: number;
};

/** The scope a candidate must belong to: its topic and one of that topic's chosen outcomes. */
export function inScope(scope: readonly BlueprintScopeItem[], c: Candidate): boolean {
  return scope.some((s) => s.topicId === c.topicId && s.outcomeIds.includes(c.primaryOutcomeId));
}

/**
 * Can this question fill a place in this part? It must be in scope, be the part's kind, be worth a
 * mark value that kind allows, and match the part's marks-each when it has one.
 */
export function fitsSection(section: FormatSection, c: Candidate): boolean {
  if (!Number.isInteger(c.marks) || c.marks <= 0) return false;
  const kind = questionKindOf(c);
  if (kind !== section.kind || !marksAllowedForKind(kind, c.marks)) return false;
  return section.marksEach === undefined || section.marksEach === c.marks;
}

/** Candidates of the confirmed scope that can fill a part, each counted once. */
export function candidatesForSection(
  scope: readonly BlueprintScopeItem[],
  section: FormatSection,
  candidates: readonly Candidate[],
): Candidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.questionId) || !inScope(scope, c) || !fitsSection(section, c)) return false;
    seen.add(c.questionId);
    return true;
  });
}

function summarise(marks: number[]): SectionInventory {
  const sorted = [...marks].sort((a, b) => a - b);
  return { count: sorted.length, totalMarks: sorted.reduce((a, b) => a + b, 0), marksMultiset: sorted };
}

/**
 * Summarise approved candidates per part of the format and per topic, for `validateBlueprint`.
 * Uses the same eligibility rules as the selector and counts each question once. A topic counts a
 * question only if some part of the format can use it.
 */
export function summariseInventory(
  scope: readonly BlueprintScopeItem[],
  format: PaperFormat,
  candidates: readonly Candidate[],
): PaperInventory {
  const perSection = format.sections.map((section) => candidatesForSection(scope, section, candidates));
  const usable = new Set(perSection.flat().map((c) => c.questionId));
  const seen = new Set<string>();
  const unique = candidates.filter((c) => (seen.has(c.questionId) ? false : (seen.add(c.questionId), true)));
  return {
    sections: perSection.map((cs) => summarise(cs.map((c) => c.marks))),
    topics: scope.map((s) => ({
      topicId: s.topicId,
      questionCount: unique.filter((c) => c.topicId === s.topicId && usable.has(c.questionId)).length,
    })),
  };
}
