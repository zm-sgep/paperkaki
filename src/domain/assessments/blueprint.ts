/**
 * Paper blueprint (M3-05).
 *
 * The blueprint is an internal structure: the paper format (its parts, question types, counts and
 * marks) and how many marks each topic should carry. Parents see it as "mock setup"; the word
 * "blueprint" never appears in parent-facing copy.
 *
 * The format is exact (every part gets exactly its questions and marks). Topic marks are targets:
 * the selector balances them as well as the bank allows.
 *
 * Pure and deterministic. Never throws on impossible input: it returns the blueprint anyway and
 * `validateBlueprint` reports the problem.
 */
import { DIFFICULTY_PRESETS, type DifficultyLevel, type DifficultyMix } from "./recommend";
import { formatTotalMarks, sectionCodeAt, type FormatSection, type PaperFormat } from "./paper-format";
import { standardFormat } from "./paper-format-presets";

/** "A", "B", "C" ...: the part's position in the paper, used internally. */
export type SectionCode = string;

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
  /**
   * Marks, time and difficulty. When no `format` is given, the standard format is built from the
   * marks and time. When a format is given, it decides the marks and time.
   */
  settings: { totalMarks: number; durationMinutes: number; difficulty: DifficultyLevel };
  format?: PaperFormat | undefined;
};

/** One part of the paper with its internal code. */
export type BlueprintSection = FormatSection & { code: SectionCode };

export type BlueprintScopeItem = {
  topicId: string;
  label: string;
  outcomeIds: string[];
  /** Marks this topic should carry on the whole paper. A balanced target, not a hard rule. */
  targetMarks: number;
};

export type Blueprint = {
  curriculumVersionId: string;
  level: "P3";
  subject: "Mathematics";
  totalMarks: number;
  durationMinutes: number;
  /** The paper's parts in order. */
  format: PaperFormat;
  scope: BlueprintScopeItem[];
  /** Percent of marks by difficulty; sums to 100. */
  difficulty: DifficultyMix;
  rules: { noRepeatFamily: true };
};

/** The parts of a blueprint in order, each with its code. */
export function blueprintSections(blueprint: Pick<Blueprint, "format">): BlueprintSection[] {
  return blueprint.format.sections.map((section, index) => ({ ...section, code: sectionCodeAt(index) }));
}

/** Split `total` into `parts` whole numbers that differ by at most 1; earliest parts get the remainder. */
export function splitEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

function copyFormat(format: PaperFormat): PaperFormat {
  return { durationMinutes: format.durationMinutes, sections: format.sections.map((section) => ({ ...section })) };
}

export function buildBlueprint(input: BlueprintInput): Blueprint {
  const { difficulty } = input.settings;
  const format = input.format
    ? copyFormat(input.format)
    : standardFormat({ totalMarks: input.settings.totalMarks, durationMinutes: input.settings.durationMinutes });
  const totalMarks = input.format ? formatTotalMarks(format) : input.settings.totalMarks;
  const targets = splitEvenly(totalMarks, input.topics.length);
  return {
    curriculumVersionId: input.curriculumVersionId,
    level: input.level,
    subject: input.subject,
    totalMarks,
    durationMinutes: format.durationMinutes,
    format,
    scope: input.topics.map((t, i) => ({
      topicId: t.topicId,
      label: t.label,
      outcomeIds: [...t.outcomeIds],
      targetMarks: targets[i] ?? 0,
    })),
    difficulty: { ...DIFFICULTY_PRESETS[difficulty] },
    rules: { noRepeatFamily: true },
  };
}
