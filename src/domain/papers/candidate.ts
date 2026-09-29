import type { BlueprintScopeItem, BlueprintSection, SectionCode } from "@/domain/assessments/blueprint";
import type { SectionInventory, TopicInventory } from "@/domain/assessments/validate-blueprint";
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

/** The section a question type belongs to, per the blueprint (multiple choice -> A, others -> B). */
export function sectionCodeForType(
  sections: readonly BlueprintSection[],
  type: QuestionType,
): SectionCode | undefined {
  return sections.find((s) => s.types.includes(type))?.code;
}

/** Candidates that can fill a topic's cell: right topic, right outcome, right section, usable marks. */
export function isEligible(
  scope: BlueprintScopeItem,
  sections: readonly BlueprintSection[],
  sectionCode: SectionCode,
  c: Candidate,
): boolean {
  return (
    c.topicId === scope.topicId &&
    scope.outcomeIds.includes(c.primaryOutcomeId) &&
    sectionCodeForType(sections, c.questionType) === sectionCode &&
    Number.isInteger(c.marks) &&
    c.marks > 0
  );
}

function summarise(marks: number[]): SectionInventory {
  const sorted = [...marks].sort((a, b) => a - b);
  return { count: sorted.length, totalMarks: sorted.reduce((a, b) => a + b, 0), marksMultiset: sorted };
}

/**
 * Summarise approved candidates per topic and section for `validateBlueprint`.
 * Uses the same eligibility rules as the selector, and counts each question once.
 */
export function summariseInventory(
  scope: readonly BlueprintScopeItem[],
  sections: readonly BlueprintSection[],
  candidates: readonly Candidate[],
): TopicInventory[] {
  const seen = new Set<string>();
  const unique = candidates.filter((c) => (seen.has(c.questionId) ? false : (seen.add(c.questionId), true)));
  return scope.map((s) => ({
    topicId: s.topicId,
    sectionA: summarise(unique.filter((c) => isEligible(s, sections, "A", c)).map((c) => c.marks)),
    sectionB: summarise(unique.filter((c) => isEligible(s, sections, "B", c)).map((c) => c.marks)),
  }));
}
