/**
 * Paper format: how a school paper is laid out (part names, question types, how many questions,
 * how many marks, how long). Pure and deterministic.
 *
 * The parent sees this as "paper format" and the parts carry the school's own words ("Section A",
 * "Booklet B", "Paper 1"). Nothing here reads a database or a file.
 */
import type { QuestionType } from "@/schemas/question-content";
import { PAPER_LIMITS, isValidDuration } from "./recommend";

/** What a part of the paper asks for. Word problems are open-ended questions worth 3 marks or more. */
export type SectionKind = "mcq" | "short" | "word_problem";

export const SECTION_KINDS: readonly SectionKind[] = ["mcq", "short", "word_problem"];

/** The words a parent picks from. */
export const SECTION_KIND_LABEL: Record<SectionKind, string> = {
  mcq: "Multiple choice",
  short: "Short answer",
  word_problem: "Word problems",
};

export type FormatSection = {
  /** The school's own name for the part, e.g. "Section A" or "Paper 2". */
  label: string;
  /** Optional booklet the part belongs to, e.g. "Booklet A". Consecutive parts share a booklet. */
  booklet?: string | undefined;
  kind: SectionKind;
  questionCount: number;
  totalMarks: number;
  /** Set when every question in the part is worth the same. */
  marksEach?: number | undefined;
};

export type PaperFormat = {
  durationMinutes: number;
  sections: FormatSection[];
};

export const FORMAT_LIMITS = {
  maxSections: 8,
  minQuestions: 1,
  maxQuestions: 40,
  minSectionMarks: 1,
  maxSectionMarks: 100,
  maxLabelLength: 30,
} as const;

/** Marks one question of each kind may be worth. */
export const ALLOWED_QUESTION_MARKS: Record<SectionKind, { min: number; max: number }> = {
  mcq: { min: 1, max: 2 },
  short: { min: 1, max: 2 },
  word_problem: { min: 3, max: 5 },
};

/** The kind a bank question belongs to, by its type and marks. */
export function questionKindOf(question: { questionType: QuestionType; marks: number }): SectionKind {
  if (question.questionType === "mcq") return "mcq";
  return question.marks >= 3 ? "word_problem" : "short";
}

/** Can a question of this kind be worth `marks`? */
export function marksAllowedForKind(kind: SectionKind, marks: number): boolean {
  const range = ALLOWED_QUESTION_MARKS[kind];
  return Number.isInteger(marks) && marks >= range.min && marks <= range.max;
}

export function formatTotalMarks(format: PaperFormat): number {
  return format.sections.reduce((total, section) => total + section.totalMarks, 0);
}

export function formatQuestionCount(format: PaperFormat): number {
  return format.sections.reduce((total, section) => total + section.questionCount, 0);
}

/** A stable letter for each part, used internally as its code: A, B, C ... */
export function sectionCodeAt(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Whole-paper marks limits for any format. */
export const FORMAT_TOTAL_MARKS = { min: PAPER_LIMITS.minMarks, max: PAPER_LIMITS.maxMarks } as const;

export type FormatIssueCode =
  | "no_sections"
  | "too_many_sections"
  | "duration_out_of_range"
  | "total_out_of_range"
  | "total_mismatch"
  | "label_missing"
  | "label_too_long"
  | "label_duplicate"
  | "booklet_too_long"
  | "booklet_split"
  | "question_count"
  | "section_marks"
  | "marks_unreachable"
  | "marks_each";

export type FormatIssue = {
  code: FormatIssueCode;
  /** Which part the problem belongs to, when it belongs to one. */
  sectionIndex?: number;
  /** Plain words for a parent, with the way forward. */
  message: string;
};

const KIND_PLURAL: Record<SectionKind, string> = {
  mcq: "Multiple choice questions",
  short: "Short questions",
  word_problem: "Word problems",
};

function marksRangeText(kind: SectionKind): string {
  const { min, max } = ALLOWED_QUESTION_MARKS[kind];
  if (max - min === 1) return `${min} or ${max} marks`;
  const middle: number[] = [];
  for (let m = min; m < max; m += 1) middle.push(m);
  return `${middle.join(", ")} or ${max} marks`;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Checks a paper format and says what to change, in a parent's words. Never throws and never
 * corrects anything. `expectedTotalMarks` is the paper's total when the caller already has one.
 */
export function validatePaperFormat(format: PaperFormat, options: { expectedTotalMarks?: number } = {}): FormatIssue[] {
  const issues: FormatIssue[] = [];
  const add = (issue: FormatIssue): void => {
    issues.push(issue);
  };

  if (format.sections.length === 0) {
    add({ code: "no_sections", message: "Add at least one part to the paper." });
    return issues;
  }
  if (format.sections.length > FORMAT_LIMITS.maxSections) {
    add({ code: "too_many_sections", message: `Use ${FORMAT_LIMITS.maxSections} parts or fewer.` });
  }
  if (!isValidDuration(format.durationMinutes)) {
    add({
      code: "duration_out_of_range",
      message: `Choose a time between ${PAPER_LIMITS.minMinutes} and ${PAPER_LIMITS.maxMinutes} minutes.`,
    });
  }

  const labelCounts = new Map<string, number>();
  for (const section of format.sections) {
    const key = section.label.trim().toLowerCase();
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  }

  format.sections.forEach((section, sectionIndex) => {
    const label = section.label.trim();
    const name = label === "" ? `Part ${sectionIndex + 1}` : label;
    const here = (code: FormatIssueCode, message: string): void => add({ code, sectionIndex, message });

    if (label === "") here("label_missing", `${name}: give this part a name, like “Section A”.`);
    else if (label.length > FORMAT_LIMITS.maxLabelLength) {
      here("label_too_long", `${name}: use ${FORMAT_LIMITS.maxLabelLength} letters or fewer for the name.`);
    } else if ((labelCounts.get(label.toLowerCase()) ?? 0) > 1) {
      here("label_duplicate", `${name}: another part has the same name. Give each part its own name.`);
    }
    if ((section.booklet ?? "").trim().length > FORMAT_LIMITS.maxLabelLength) {
      here("booklet_too_long", `${name}: use ${FORMAT_LIMITS.maxLabelLength} letters or fewer for the booklet name.`);
    }

    const countOk =
      Number.isInteger(section.questionCount) &&
      section.questionCount >= FORMAT_LIMITS.minQuestions &&
      section.questionCount <= FORMAT_LIMITS.maxQuestions;
    if (!countOk) {
      here("question_count", `${name}: choose between ${FORMAT_LIMITS.minQuestions} and ${FORMAT_LIMITS.maxQuestions} questions.`);
    }
    const marksOk =
      Number.isInteger(section.totalMarks) &&
      section.totalMarks >= FORMAT_LIMITS.minSectionMarks &&
      section.totalMarks <= FORMAT_LIMITS.maxSectionMarks;
    if (!marksOk) {
      here("section_marks", `${name}: choose between ${FORMAT_LIMITS.minSectionMarks} and ${FORMAT_LIMITS.maxSectionMarks} marks.`);
    }
    if (!countOk || !marksOk) return;

    const range = ALLOWED_QUESTION_MARKS[section.kind];
    const lowest = section.questionCount * range.min;
    const highest = section.questionCount * range.max;
    if (section.totalMarks < lowest || section.totalMarks > highest) {
      here(
        "marks_unreachable",
        `${name}: ${plural(section.questionCount, "question")} can't add up to ${section.totalMarks} marks. ${KIND_PLURAL[section.kind]} are worth ${marksRangeText(section.kind)}, so use ${lowest} to ${highest} marks.`,
      );
      return;
    }
    if (section.marksEach !== undefined) {
      if (!marksAllowedForKind(section.kind, section.marksEach) || section.questionCount * section.marksEach !== section.totalMarks) {
        here(
          "marks_each",
          `${name}: ${plural(section.questionCount, "question")} worth ${section.marksEach} ${section.marksEach === 1 ? "mark" : "marks"} each make ${section.questionCount * section.marksEach} marks, not ${section.totalMarks}.`,
        );
      }
    }
  });

  // A booklet is a run of neighbouring parts: it may not come back after another one.
  const seenBooklets = new Set<string>();
  let currentBooklet: string | undefined;
  format.sections.forEach((section, sectionIndex) => {
    const booklet = (section.booklet ?? "").trim();
    const key = booklet === "" ? undefined : booklet.toLowerCase();
    if (key !== currentBooklet) {
      if (key !== undefined && seenBooklets.has(key)) {
        add({
          code: "booklet_split",
          sectionIndex,
          message: `${booklet} has parts that are not next to each other. Keep the parts of each booklet together.`,
        });
      }
      if (key !== undefined) seenBooklets.add(key);
      currentBooklet = key;
    }
  });

  const total = formatTotalMarks(format);
  if (total < FORMAT_TOTAL_MARKS.min || total > FORMAT_TOTAL_MARKS.max) {
    add({
      code: "total_out_of_range",
      message: `The whole paper must be between ${FORMAT_TOTAL_MARKS.min} and ${FORMAT_TOTAL_MARKS.max} marks. This one is ${total} marks.`,
    });
  }
  if (options.expectedTotalMarks !== undefined && options.expectedTotalMarks !== total) {
    add({
      code: "total_mismatch",
      message: `The parts add up to ${total} marks, but the paper is ${options.expectedTotalMarks} marks. Change a part so they match.`,
    });
  }
  return issues;
}

/** The booklet a part belongs to, or undefined. Blank names count as none. */
export function bookletOf(section: FormatSection): string | undefined {
  const booklet = (section.booklet ?? "").trim();
  return booklet === "" ? undefined : booklet;
}

/**
 * The booklet a part is printed in. A part named like a booklet ("Booklet B", "Paper 2") is printed
 * as its own booklet even when no separate booklet name was given, because parents type the school's
 * own names into the part name and expect each booklet to start on a new page.
 */
export function printedBookletOf(section: FormatSection): string | undefined {
  const booklet = bookletOf(section);
  if (booklet !== undefined) return booklet;
  const label = section.label.trim();
  return /^(booklet|paper)\b/i.test(label) ? label : undefined;
}

/**
 * Tidies a format the parent typed: trims names, drops blank booklet names, and keeps `marksEach`
 * only while it still explains the part's marks. Does not change what the parent chose.
 */
export function normalisePaperFormat(format: PaperFormat): PaperFormat {
  return {
    durationMinutes: format.durationMinutes,
    sections: format.sections.map((section) => {
      const booklet = bookletOf(section);
      const keepEach =
        section.marksEach !== undefined && section.questionCount * section.marksEach === section.totalMarks;
      return {
        label: section.label.replace(/\s+/g, " ").trim(),
        ...(booklet === undefined ? {} : { booklet: booklet.replace(/\s+/g, " ") }),
        kind: section.kind,
        questionCount: section.questionCount,
        totalMarks: section.totalMarks,
        ...(keepEach ? { marksEach: section.marksEach } : {}),
      };
    }),
  };
}

/** Do two formats describe the same paper? */
export function sameFormat(a: PaperFormat, b: PaperFormat): boolean {
  const x = normalisePaperFormat(a);
  const y = normalisePaperFormat(b);
  return JSON.stringify(x) === JSON.stringify(y);
}
