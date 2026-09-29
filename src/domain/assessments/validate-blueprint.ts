/**
 * Blueprint validation (M3-06).
 *
 * `validateBlueprint` never mutates or auto-corrects: it reports hard errors
 * (the paper cannot be built) and warnings (it can, but check it), each with
 * a plain-language message that offers a way forward.
 *
 * The caller passes in a summary of the APPROVED candidate questions per
 * topic and section; this module stays free of any persistence.
 *
 * Section checks are necessary conditions (enough marks, exact sum reachable
 * from the available mark values). The selector additionally enforces
 * one-question-per-family and can still report `no_exact_combination`.
 */
import { allocateMarks, type Blueprint } from "./blueprint";
import { PAPER_LIMITS, isValidDuration, isValidTotalMarks } from "./recommend";

export type SectionInventory = {
  count: number;
  totalMarks: number;
  /** Mark value of each approved candidate (one entry per question). */
  marksMultiset: number[];
};

export type TopicInventory = {
  topicId: string;
  sectionA: SectionInventory;
  sectionB: SectionInventory;
};

export type IssueCode =
  | "marks_out_of_range"
  | "duration_out_of_range"
  | "no_topics"
  | "too_few_marks_for_topics"
  | "difficulty_invalid"
  | "topic_has_no_questions"
  | "insufficient_inventory"
  | "section_marks_unreachable"
  | "duration_short"
  | "duration_long";

export type Issue = { code: IssueCode; topicId?: string; message: string };

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

const sumOf = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

type CellProblem = "none" | "short" | "unreachable";

function cellProblem(need: number, inv: SectionInventory | undefined): CellProblem {
  if (need <= 0) return "none";
  const values = (inv?.marksMultiset ?? []).filter((v) => Number.isInteger(v) && v > 0);
  if (sumOf(values) < need) return "short";
  return canFormSum(values, need) ? "none" : "unreachable";
}

/** Worst problem across both sections of one topic, given the marks it would be asked for. */
function topicProblem(alloc: { A: number; B: number }, inv: TopicInventory | undefined): CellProblem {
  const a = cellProblem(alloc.A, inv?.sectionA);
  const b = cellProblem(alloc.B, inv?.sectionB);
  if (a === "short" || b === "short") return "short";
  if (a === "unreachable" || b === "unreachable") return "unreachable";
  return "none";
}

function nextValidTotalAtLeast(n: number): number {
  const step = PAPER_LIMITS.marksStep;
  return Math.max(PAPER_LIMITS.minMarks, Math.ceil(n / step) * step);
}

/**
 * The nearest allowed total (lower first, then higher) for which every topic
 * in the current scope has questions to fill its marks. `undefined` if none.
 */
function suggestTotal(blueprint: Blueprint, inventory: readonly TopicInventory[]): number | undefined {
  const n = blueprint.scope.length;
  const byTopic = new Map(inventory.map((t) => [t.topicId, t]));
  const works = (total: number): boolean => {
    if (total < n) return false;
    const alloc = allocateMarks(total, n);
    return blueprint.scope.every(
      (s, i) => topicProblem(alloc.topics[i] ?? { A: 0, B: 0 }, byTopic.get(s.topicId)) === "none",
    );
  };
  const all: number[] = [];
  for (let m = PAPER_LIMITS.minMarks; m <= PAPER_LIMITS.maxMarks; m += PAPER_LIMITS.marksStep) all.push(m);
  const lower = all.filter((m) => m < blueprint.totalMarks).reverse();
  const higher = all.filter((m) => m > blueprint.totalMarks);
  return [...lower, ...higher].find(works);
}

export function validateBlueprint(
  blueprint: Blueprint,
  inventory: readonly TopicInventory[],
): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const { totalMarks, durationMinutes } = blueprint;
  const topicCount = blueprint.scope.length;

  const marksOk = isValidTotalMarks(totalMarks);
  const durationOk = isValidDuration(durationMinutes);

  if (!marksOk) {
    errors.push({
      code: "marks_out_of_range",
      message: `Choose between ${PAPER_LIMITS.minMarks} and ${PAPER_LIMITS.maxMarks} marks, in steps of ${PAPER_LIMITS.marksStep}.`,
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

  const enoughMarks = Number.isFinite(totalMarks) && totalMarks >= topicCount;
  if (topicCount > 0 && !enoughMarks) {
    errors.push({
      code: "too_few_marks_for_topics",
      message: `Choose at least ${nextValidTotalAtLeast(topicCount)} marks so every topic gets a question.`,
    });
  }

  // Inventory checks need a sensible mark split to be meaningful.
  if (topicCount > 0 && enoughMarks) {
    const byTopic = new Map(inventory.map((t) => [t.topicId, t]));
    let suggestion: number | undefined;
    let suggestionComputed = false;
    const suggestionText = (): string => {
      if (!suggestionComputed) {
        suggestion = suggestTotal(blueprint, inventory);
        suggestionComputed = true;
      }
      return suggestion === undefined
        ? "Try adding another topic."
        : `Try ${suggestion} marks in total, or add another topic.`;
    };

    for (const s of blueprint.scope) {
      const inv = byTopic.get(s.topicId);
      const available =
        sumOf((inv?.sectionA.marksMultiset ?? []).filter((v) => v > 0)) +
        sumOf((inv?.sectionB.marksMultiset ?? []).filter((v) => v > 0));
      if (!inv || available === 0) {
        errors.push({
          code: "topic_has_no_questions",
          topicId: s.topicId,
          message: `We don't have questions for ${s.label} yet. Leave it out for now or choose another topic.`,
        });
        continue;
      }
      if (s.targetMarks <= 0) continue;
      const problem = topicProblem({ A: s.sectionMarks.A, B: s.sectionMarks.B }, inv);
      if (problem === "short") {
        errors.push({
          code: "insufficient_inventory",
          topicId: s.topicId,
          message: `We don't have enough ${s.label} questions for ${s.targetMarks} marks. ${suggestionText()}`,
        });
      } else if (problem === "unreachable") {
        errors.push({
          code: "section_marks_unreachable",
          topicId: s.topicId,
          message: `We can't make exactly ${s.targetMarks} marks of ${s.label} questions. ${suggestionText()}`,
        });
      }
    }
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

const BANNED_WORDING: readonly RegExp[] = [
  /blueprint/i,
  /outcome/i,
  /inventory/i,
  /\bsections?\b/i,
  /%/,
  /percent/i,
  /(^|[^A-Za-z0-9'])[AB]([^A-Za-z0-9']|$)/,
];

/** True if the text contains wording that must not reach a parent. */
export function hasBannedParentWording(text: string): boolean {
  return BANNED_WORDING.some((re) => re.test(text));
}

const FALLBACK_MESSAGE: Record<IssueCode, string> = {
  marks_out_of_range: "Choose a different number of marks.",
  duration_out_of_range: "Choose a different time.",
  no_topics: "Choose at least one topic for the mock.",
  too_few_marks_for_topics: "Choose more marks, or fewer topics.",
  difficulty_invalid: "Choose Easier, Balanced or Harder.",
  topic_has_no_questions: "We don't have questions for one of the topics yet. Leave it out for now.",
  insufficient_inventory: "We don't have enough questions for one of the topics. Try fewer marks or add another topic.",
  section_marks_unreachable: "We can't make the exact marks for one of the topics. Try a different total.",
  duration_short: "The time may be tight. Try a longer time.",
  duration_long: "The time is generous. Try a shorter time.",
};

/**
 * Parent-ready lines for a list of issues, in the order given, without
 * duplicates. A message that would leak internal wording is replaced by a
 * safe generic line for its code.
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
