/**
 * Blueprint validation (M3-06).
 *
 * `validateBlueprint` never mutates or auto-corrects: it reports hard errors (the paper cannot be
 * built) and warnings (it can, but check it), each with a plain-language message that offers a way
 * forward.
 *
 * The caller passes in a summary of the APPROVED candidate questions for each part of the format
 * and each topic; this module stays free of any persistence.
 *
 * Part checks are necessary conditions (enough questions, the exact count and marks reachable from
 * the available mark values). The selector additionally enforces one-question-per-family and can
 * still report `no_exact_combination`.
 */
import type { Blueprint } from "./blueprint";
import {
  ALLOWED_QUESTION_MARKS,
  formatQuestionCount,
  validatePaperFormat,
  type FormatSection,
  type SectionKind,
} from "./paper-format";
import { PAPER_LIMITS, isValidDuration } from "./recommend";

export type SectionInventory = {
  count: number;
  totalMarks: number;
  /** Mark value of each approved candidate (one entry per question). */
  marksMultiset: number[];
};

export type TopicInventory = {
  topicId: string;
  /** Approved questions of this topic that some part of the paper can use. */
  questionCount: number;
};

export type PaperInventory = {
  /** One entry per part of the format, in order. */
  sections: SectionInventory[];
  topics: TopicInventory[];
};

export type IssueCode =
  | "marks_out_of_range"
  | "duration_out_of_range"
  | "no_topics"
  | "format_invalid"
  | "too_many_topics"
  | "difficulty_invalid"
  | "topic_has_no_questions"
  | "insufficient_inventory"
  | "section_marks_unreachable"
  | "duration_short"
  | "duration_long";

export type Issue = { code: IssueCode; topicId?: string; sectionIndex?: number; message: string };

export type ValidationResult = { errors: Issue[]; warnings: Issue[] };

/** Can some sub-multiset of `values` (positive integers) sum to exactly `target`? */
export function canFormSum(values: readonly number[], target: number): boolean {
  if (!Number.isInteger(target) || target < 0) return false;
  if (target === 0) return true;
  const reach = new Array<boolean>(target + 1).fill(false);
  reach[0] = true;
  for (const v of values) {
    if (!Number.isInteger(v) || v <= 0) continue;
    for (let s = target; s >= v; s -= 1) {
      if (reach[s - v]) reach[s] = true;
    }
  }
  return reach[target] === true;
}

/** Can exactly `count` of `values` (positive integers) sum to exactly `target`? */
export function canFormCountAndSum(values: readonly number[], count: number, target: number): boolean {
  if (!Number.isInteger(count) || !Number.isInteger(target) || count < 0 || target < 0) return false;
  if (count === 0) return target === 0;
  const width = target + 1;
  const reach = new Uint8Array((count + 1) * width);
  reach[0] = 1;
  for (const v of values) {
    if (!Number.isInteger(v) || v <= 0) continue;
    for (let k = count; k >= 1; k -= 1) {
      for (let s = target; s >= v; s -= 1) {
        if (reach[(k - 1) * width + (s - v)] === 1) reach[k * width + s] = 1;
      }
    }
  }
  return reach[count * width + target] === 1;
}

const sumOf = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

const KIND_NOUN: Record<SectionKind, string> = {
  mcq: "multiple-choice questions",
  short: "short-answer questions",
  word_problem: "word problems",
};

const marksWord = (n: number): string => `${n}-mark`;

/** "Try 1-mark questions or add a topic." when another mark value is possible; otherwise fewer questions. */
function shortageAdvice(section: FormatSection): string {
  if (section.marksEach !== undefined) {
    const { min, max } = ALLOWED_QUESTION_MARKS[section.kind];
    const alternative = section.marksEach > min ? section.marksEach - 1 : section.marksEach < max ? section.marksEach + 1 : undefined;
    if (alternative !== undefined && section.kind !== "word_problem") {
      return `Try ${marksWord(alternative)} questions or add a topic.`;
    }
  }
  return "Try fewer questions or add a topic.";
}

function shortageMessage(section: FormatSection): string {
  const noun = KIND_NOUN[section.kind];
  const worth = section.marksEach !== undefined ? ` worth ${section.marksEach} ${section.marksEach === 1 ? "mark" : "marks"}` : "";
  return `We don't have enough ${noun}${worth} for these topics. ${shortageAdvice(section)}`;
}

function unreachableMessage(section: FormatSection): string {
  return `We can't make exactly ${section.totalMarks} marks from ${section.questionCount} ${KIND_NOUN[section.kind]} for these topics. Try changing the marks or the number of questions, or add a topic.`;
}

/**
 * The marks of every question the parts of one kind can draw on, each question once. A part with
 * no marks-each sees the whole kind; parts with a marks-each each see only questions of that value.
 */
function pooledMarks(
  sections: readonly FormatSection[],
  inventory: readonly SectionInventory[],
  kind: SectionKind,
): number[] {
  const same = sections.map((section, index) => ({ section, marks: inventory[index]?.marksMultiset ?? [] })).filter((x) => x.section.kind === kind);
  const open = same.filter((x) => x.section.marksEach === undefined);
  if (open.length > 0) return open.reduce((best, x) => (x.marks.length > best.length ? x.marks : best), [] as number[]);
  const byValue = new Map<number, number[]>();
  for (const x of same) {
    const each = x.section.marksEach ?? 0;
    const known = byValue.get(each);
    if (!known || x.marks.length > known.length) byValue.set(each, x.marks);
  }
  return [...byValue.values()].flat();
}

export function validateBlueprint(blueprint: Blueprint, inventory: PaperInventory): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const { totalMarks, durationMinutes, format } = blueprint;
  const topicCount = blueprint.scope.length;

  const marksOk = Number.isInteger(totalMarks) && totalMarks >= PAPER_LIMITS.minMarks && totalMarks <= PAPER_LIMITS.maxMarks;
  const durationOk = isValidDuration(durationMinutes);

  if (!marksOk) {
    errors.push({
      code: "marks_out_of_range",
      message: `Choose between ${PAPER_LIMITS.minMarks} and ${PAPER_LIMITS.maxMarks} marks.`,
    });
  }
  if (!durationOk) {
    errors.push({
      code: "duration_out_of_range",
      message: `Choose a time between ${PAPER_LIMITS.minMinutes} and ${PAPER_LIMITS.maxMinutes} minutes.`,
    });
  }

  const d = blueprint.difficulty;
  const mix = [d.basic, d.standard, d.challenging];
  if (mix.some((x) => !Number.isFinite(x) || x < 0) || sumOf(mix) !== 100) {
    errors.push({
      code: "difficulty_invalid",
      message: "We couldn't read the difficulty choice. Choose Easier, Balanced or Harder.",
    });
  }

  if (topicCount === 0) {
    errors.push({ code: "no_topics", message: "Choose at least one topic for the mock." });
  }

  // The layout itself: names, counts and marks that add up. Marks range and time are reported above.
  const layoutIssues = validatePaperFormat(format).filter(
    (issue) => issue.code !== "total_out_of_range" && issue.code !== "duration_out_of_range" && issue.code !== "total_mismatch",
  );
  for (const issue of layoutIssues) {
    errors.push({
      code: "format_invalid",
      message: issue.message,
      ...(issue.sectionIndex === undefined ? {} : { sectionIndex: issue.sectionIndex }),
    });
  }

  // Inventory checks need a sound layout to be meaningful.
  if (topicCount > 0 && layoutIssues.length === 0) {
    const questionTotal = formatQuestionCount(format);
    if (questionTotal < topicCount) {
      errors.push({
        code: "too_many_topics",
        message: `This paper has room for only ${questionTotal} ${questionTotal === 1 ? "question" : "questions"}, so it can't include all ${topicCount} topics. Choose fewer topics or a longer paper.`,
      });
    }

    const byTopic = new Map(inventory.topics.map((t) => [t.topicId, t]));
    for (const s of blueprint.scope) {
      if ((byTopic.get(s.topicId)?.questionCount ?? 0) === 0) {
        errors.push({
          code: "topic_has_no_questions",
          topicId: s.topicId,
          message: `We don't have questions for ${s.label} that fit this paper yet. Leave it out for now or choose another topic.`,
        });
      }
    }

    const prefix = (section: FormatSection): string => (format.sections.length > 1 ? `${section.label}: ` : "");
    const kindTotals = new Map<SectionKind, { count: number; marks: number; seen: number }>();
    format.sections.forEach((section, index) => {
      const inv = inventory.sections[index];
      const values = (inv?.marksMultiset ?? []).filter((v) => Number.isInteger(v) && v > 0);
      const enough = values.length >= section.questionCount && sumOf(values) >= section.totalMarks;
      if (!enough) {
        errors.push({ code: "insufficient_inventory", sectionIndex: index, message: `${prefix(section)}${shortageMessage(section)}` });
        return;
      }
      if (!canFormCountAndSum(values, section.questionCount, section.totalMarks)) {
        errors.push({ code: "section_marks_unreachable", sectionIndex: index, message: `${prefix(section)}${unreachableMessage(section)}` });
        return;
      }
      // Parts of the same kind draw on the same questions: together they must fit too.
      const running = kindTotals.get(section.kind) ?? { count: 0, marks: 0, seen: 0 };
      running.count += section.questionCount;
      running.marks += section.totalMarks;
      running.seen += 1;
      kindTotals.set(section.kind, running);
      if (running.seen > 1 && !canFormCountAndSum(pooledMarks(format.sections, inventory.sections, section.kind), running.count, running.marks)) {
        errors.push({ code: "insufficient_inventory", sectionIndex: index, message: `${prefix(section)}${shortageMessage(section)}` });
      }
    });
  }

  if (marksOk && durationOk) {
    if (durationMinutes < totalMarks) {
      warnings.push({
        code: "duration_short",
        message: `${durationMinutes} minutes may be tight for ${totalMarks} marks. Try ${totalMarks} minutes or more.`,
      });
    } else if (durationMinutes > 2 * totalMarks) {
      warnings.push({
        code: "duration_long",
        message: `${durationMinutes} minutes is a lot for ${totalMarks} marks. Try ${2 * totalMarks} minutes or fewer.`,
      });
    }
  }

  return { errors, warnings };
}

const BANNED_WORDING: readonly RegExp[] = [/blueprint/i, /outcome/i, /inventory/i, /preset/i, /%/, /percent/i];

/** True if the text contains wording that must not reach a parent. */
export function hasBannedParentWording(text: string): boolean {
  return BANNED_WORDING.some((re) => re.test(text));
}

const FALLBACK_MESSAGE: Record<IssueCode, string> = {
  marks_out_of_range: "Choose a different number of marks.",
  duration_out_of_range: "Choose a different time.",
  no_topics: "Choose at least one topic for the mock.",
  format_invalid: "Change the paper format so the parts add up.",
  too_many_topics: "Choose fewer topics, or a longer paper.",
  difficulty_invalid: "Choose Easier, Balanced or Harder.",
  topic_has_no_questions: "We don't have questions for one of the topics yet. Leave it out for now.",
  insufficient_inventory: "We don't have enough questions for these topics. Try a different paper format or add a topic.",
  section_marks_unreachable: "We can't make the exact marks for this paper from these topics. Try a different paper format.",
  duration_short: "The time may be tight. Try a longer time.",
  duration_long: "The time is generous. Try a shorter time.",
};

/**
 * Parent-ready lines for a list of issues, in the order given, without duplicates. A message that
 * would leak internal wording is replaced by a safe generic line for its code.
 */
export function explainForParent(issues: readonly Issue[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const issue of issues) {
    const text = hasBannedParentWording(issue.message) ? FALLBACK_MESSAGE[issue.code] : issue.message;
    if (seen.has(text)) continue;
    seen.add(text);
    lines.push(text);
  }
  return lines;
}
