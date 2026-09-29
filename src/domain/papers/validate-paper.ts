/**
 * Final paper validation (M4-03).
 *
 * Runs after the selector and before anything is frozen or rendered. The selector already aims for
 * these properties; this is the independent check that nothing broken reaches a child. Any failure
 * means the paper must not be created.
 *
 * Pure: the caller loads the facts about each selected question (approval, stored marks, whether
 * its answer verifies, whether its files resolve) and passes them in. Nothing here reads a database
 * or a file.
 */
import { blueprintSections, type Blueprint, type SectionCode } from "@/domain/assessments/blueprint";
import { questionKindOf } from "@/domain/assessments/paper-format";
import type { QuestionType } from "@/schemas/question-content";
import type { SelectedQuestion } from "./select-questions";

/** What the caller found out about one selected question version. */
export type PaperQuestionFacts = {
  questionId: string;
  approved: boolean;
  /** Marks stored on the question version itself. */
  marks: number;
  /** The stored question type: with the marks it decides which kind of part the question may go in. */
  questionType: QuestionType;
  hasAnswer: boolean;
  /** Outcome of the independent answer check (src/domain/questions/verify.ts). */
  answerVerified: boolean;
  /** Developer-facing reasons when the answer check failed. */
  verificationReasons: string[];
  /** Asset keys the question needs that could not be found or drawn. Empty when all resolve. */
  missingAssets: string[];
};

export type PaperFailureCode =
  | "empty_paper"
  | "total_marks"
  | "topic_marks"
  | "section_marks"
  | "section_count"
  | "section_kind"
  | "topic_missing"
  | "numbering"
  | "section_order"
  | "duplicate_question"
  | "unknown_question"
  | "not_approved"
  | "marks_mismatch"
  | "no_answer"
  | "answer_not_verified"
  | "asset_missing";

export type PaperFailure = {
  code: PaperFailureCode;
  questionId?: string;
  /** The printed question number, when the failure is about one question. */
  number?: number;
  /** Developer-facing explanation. Not for parents. */
  detail: string;
};

export type ScopeReportTopic = {
  topicId: string;
  /** The parent-facing topic label. */
  label: string;
  targetMarks: number;
  actualMarks: number;
  questionCount: number;
};

export type ScopeReport = {
  totalMarks: number;
  topics: ScopeReportTopic[];
  sections: { code: SectionCode; label: string; marks: number; questionCount: number }[];
};

export type PaperValidation =
  | { ok: true; scope: ScopeReport }
  | { ok: false; failures: PaperFailure[]; scope: ScopeReport };

export type ValidatePaperInput = {
  blueprint: Blueprint;
  selection: readonly SelectedQuestion[];
  facts: readonly PaperQuestionFacts[];
};

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/** Marks per topic and per section actually on the paper, next to what the design asked for. */
export function buildScopeReport(blueprint: Blueprint, selection: readonly SelectedQuestion[]): ScopeReport {
  return {
    totalMarks: sum(selection.map((q) => q.marks)),
    topics: blueprint.scope.map((topic) => {
      const chosen = selection.filter((q) => q.topicId === topic.topicId);
      return {
        topicId: topic.topicId,
        label: topic.label,
        targetMarks: topic.targetMarks,
        actualMarks: sum(chosen.map((q) => q.marks)),
        questionCount: chosen.length,
      };
    }),
    sections: blueprintSections(blueprint).map((section) => {
      const chosen = selection.filter((q) => q.sectionCode === section.code);
      return { code: section.code, label: section.label, marks: sum(chosen.map((q) => q.marks)), questionCount: chosen.length };
    }),
  };
}

export function validatePaper(input: ValidatePaperInput): PaperValidation {
  const { blueprint, selection } = input;
  const failures: PaperFailure[] = [];
  const fail = (failure: PaperFailure): void => {
    failures.push(failure);
  };
  const scope = buildScopeReport(blueprint, selection);

  if (selection.length === 0) {
    fail({ code: "empty_paper", detail: "The paper has no questions." });
    return { ok: false, failures, scope };
  }

  // Total marks: exact, on the paper and against the design.
  if (scope.totalMarks !== blueprint.totalMarks) {
    fail({ code: "total_marks", detail: `The questions add up to ${scope.totalMarks} marks, not ${blueprint.totalMarks}.` });
  }

  // Numbering: 1..n, in order, no gaps or repeats, sections never interleaved.
  const numbers = selection.map((q) => q.number);
  if (numbers.some((n, index) => n !== index + 1)) {
    fail({ code: "numbering", detail: `Question numbers are ${numbers.join(", ")}; they must run 1 to ${selection.length} in order.` });
  }
  const sections = blueprintSections(blueprint);
  const sectionRank = new Map(sections.map((section, index) => [section.code, index]));
  let lastRank = -1;
  for (const q of selection) {
    const rank = sectionRank.get(q.sectionCode);
    if (rank === undefined) {
      fail({ code: "section_order", questionId: q.questionId, number: q.number, detail: `Question ${q.number} is in section ${q.sectionCode}, which the design does not have.` });
    } else if (rank < lastRank) {
      fail({ code: "section_order", questionId: q.questionId, number: q.number, detail: `Question ${q.number} comes after a later section.` });
    } else {
      lastRank = rank;
    }
  }

  // No question twice.
  const seen = new Set<string>();
  for (const q of selection) {
    if (seen.has(q.questionId)) {
      fail({ code: "duplicate_question", questionId: q.questionId, number: q.number, detail: `Question ${q.number} is already on the paper.` });
    }
    seen.add(q.questionId);
  }

  // Every topic of the scope is on the paper, and nothing from outside it. (Topic marks are balanced
  // as well as the bank allows, so they are a goal, not a rule.)
  for (const topic of scope.topics) {
    if (topic.questionCount === 0) {
      fail({ code: "topic_missing", detail: `Topic ${topic.topicId} has no question on the paper.` });
    }
  }
  const knownTopics = new Set(blueprint.scope.map((topic) => topic.topicId));
  for (const q of selection) {
    if (!knownTopics.has(q.topicId)) {
      fail({ code: "topic_marks", questionId: q.questionId, number: q.number, detail: `Question ${q.number} is outside the confirmed scope.` });
    }
  }
  // Every part carries exactly the questions and marks the format asked for.
  for (const section of sections) {
    const found = scope.sections.find((s) => s.code === section.code);
    if ((found?.questionCount ?? 0) !== section.questionCount) {
      fail({ code: "section_count", detail: `${section.label} has ${found?.questionCount ?? 0} questions, expected ${section.questionCount}.` });
    }
    if ((found?.marks ?? 0) !== section.totalMarks) {
      fail({ code: "section_marks", detail: `${section.label} has ${found?.marks ?? 0} marks, expected ${section.totalMarks}.` });
    }
    if (section.marksEach !== undefined) {
      for (const q of selection.filter((item) => item.sectionCode === section.code && item.marks !== section.marksEach)) {
        fail({ code: "section_marks", questionId: q.questionId, number: q.number, detail: `Question ${q.number} is worth ${q.marks} marks, but every question in ${section.label} is worth ${section.marksEach}.` });
      }
    }
  }

  // Each question: approved, marks as stored, answer present and verified, files resolvable.
  const factsById = new Map(input.facts.map((f) => [f.questionId, f]));
  for (const q of selection) {
    const facts = factsById.get(q.questionId);
    const at = { questionId: q.questionId, number: q.number };
    if (!facts) {
      fail({ code: "unknown_question", ...at, detail: `Question ${q.number} could not be loaded.` });
      continue;
    }
    if (!facts.approved) fail({ code: "not_approved", ...at, detail: `Question ${q.number} is not approved.` });
    if (facts.marks !== q.marks) {
      fail({ code: "marks_mismatch", ...at, detail: `Question ${q.number} is worth ${facts.marks} marks, not ${q.marks}.` });
    }
    const part = sections.find((section) => section.code === q.sectionCode);
    if (part && questionKindOf({ questionType: facts.questionType, marks: facts.marks }) !== part.kind) {
      fail({ code: "section_kind", ...at, detail: `Question ${q.number} is a ${facts.questionType} question worth ${facts.marks} marks and does not belong in ${part.label}.` });
    }
    if (!facts.hasAnswer) fail({ code: "no_answer", ...at, detail: `Question ${q.number} has no answer.` });
    else if (!facts.answerVerified) {
      fail({ code: "answer_not_verified", ...at, detail: `Question ${q.number} answer check failed: ${facts.verificationReasons.join("; ") || "unknown reason"}.` });
    }
    if (facts.missingAssets.length > 0) {
      fail({ code: "asset_missing", ...at, detail: `Question ${q.number} needs files that are missing: ${facts.missingAssets.join(", ")}.` });
    }
  }

  return failures.length === 0 ? { ok: true, scope } : { ok: false, failures, scope };
}

const CONTENT_PROBLEMS: ReadonlySet<PaperFailureCode> = new Set([
  "unknown_question",
  "not_approved",
  "marks_mismatch",
  "no_answer",
  "answer_not_verified",
  "asset_missing",
]);

/**
 * What the parent is told when validation stops a mock: calm, in their words, and always with a
 * way forward. Never lists internal codes, question ids or counts.
 */
export function explainPaperFailures(failures: readonly PaperFailure[]): string[] {
  if (failures.length === 0) return [];
  if (failures.some((f) => CONTENT_PROBLEMS.has(f.code))) {
    return [
      "We found a problem with one of the questions, so we didn't create this mock. Nothing was saved.",
      "Please try again in a little while. If it keeps happening, choose a different topic.",
    ];
  }
  return [
    "We couldn't fit the questions to your settings exactly, so we didn't create this mock. Nothing was saved.",
    "Try a different number of marks or add another topic.",
  ];
}
