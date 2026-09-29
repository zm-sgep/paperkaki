/**
 * Paper blueprint (M3-05).
 *
 * The blueprint is an internal structure: how many marks each topic and
 * section of a mock paper must carry. Parents see it as "mock setup"; the
 * word "blueprint" never appears in parent-facing copy.
 *
 * Pure and deterministic. Never throws on impossible input: it returns the
 * blueprint anyway and `validateBlueprint` reports the problem.
 */
import type { QuestionType } from "@/schemas/question-content";
import { DIFFICULTY_PRESETS, type DifficultyLevel, type DifficultyMix } from "./recommend";

export type SectionCode = "A" | "B";

export type BlueprintTopicInput = {
  topicId: string;
  /** Parent-facing label, e.g. "Fractions". */
  label: string;
  outcomeIds: string[];
};

export type BlueprintInput = {
  curriculumVersionId: string;
  level: "P3";
  subject: "Mathematics";
  /** Parent-confirmed scope, in parent order. */
  topics: BlueprintTopicInput[];
  settings: { totalMarks: number; durationMinutes: number; difficulty: DifficultyLevel };
};

export type BlueprintSection = {
  code: SectionCode;
  title: string;
  types: QuestionType[];
  marks: number;
};

export type BlueprintScopeItem = {
  topicId: string;
  label: string;
  outcomeIds: string[];
  targetMarks: number;
  sectionMarks: { A: number; B: number };
};

export type Blueprint = {
  curriculumVersionId: string;
  level: "P3";
  subject: "Mathematics";
  totalMarks: number;
  durationMinutes: number;
  sections: BlueprintSection[];
  scope: BlueprintScopeItem[];
  /** Percent of marks by difficulty; sums to 100. */
  difficulty: DifficultyMix;
  rules: { noRepeatFamily: true };
};

/** Share of marks given to multiple choice. */
export const SECTION_A_SHARE = 0.25;

export type MarksAllocation = {
  sectionA: number;
  sectionB: number;
  topics: { targetMarks: number; A: number; B: number }[];
};

/** Split `total` into `parts` whole numbers that differ by at most 1; earliest parts get the remainder. */
function splitEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * How many marks each topic and section gets. Section A = 25% of the total,
 * rounded half up (integer arithmetic: floor((total + 2) / 4)).
 */
export function allocateMarks(totalMarks: number, topicCount: number): MarksAllocation {
  const sectionA = Math.floor((totalMarks + 2) / 4);
  const sectionB = totalMarks - sectionA;
  const targets = splitEvenly(totalMarks, topicCount);
  const aShares = splitEvenly(sectionA, topicCount);
  const topics = targets.map((targetMarks, i) => {
    const A = aShares[i] ?? 0;
    return { targetMarks, A, B: targetMarks - A };
  });
  return { sectionA, sectionB, topics };
}

export function buildBlueprint(input: BlueprintInput): Blueprint {
  const { totalMarks, durationMinutes, difficulty } = input.settings;
  const alloc = allocateMarks(totalMarks, input.topics.length);
  return {
    curriculumVersionId: input.curriculumVersionId,
    level: input.level,
    subject: input.subject,
    totalMarks,
    durationMinutes,
    sections: [
      { code: "A", title: "Multiple choice", types: ["mcq"], marks: alloc.sectionA },
      { code: "B", title: "Short answer", types: ["number", "fraction", "text"], marks: alloc.sectionB },
    ],
    scope: input.topics.map((t, i) => {
      const cell = alloc.topics[i] ?? { targetMarks: 0, A: 0, B: 0 };
      return {
        topicId: t.topicId,
        label: t.label,
        outcomeIds: [...t.outcomeIds],
        targetMarks: cell.targetMarks,
        sectionMarks: { A: cell.A, B: cell.B },
      };
    }),
    difficulty: { ...DIFFICULTY_PRESETS[difficulty] },
    rules: { noRepeatFamily: true },
  };
}
