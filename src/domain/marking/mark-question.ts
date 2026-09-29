import { answersEquivalent, isSimplestFraction } from "@/domain/questions/answers";
import { add, equals, tryParseRational, type Rational } from "@/domain/questions/rational";
import type { Unit } from "@/schemas/question-content";
import { parseNumberText } from "./parse-number";
import type { MarkableQuestion, MarkingDecision, MarkingResponse, NumberAnswer } from "./types";
import { convertQuantity, dimensionOf, normaliseUnit, unitSize } from "./units";

/** What a child reads when a person needs to look at an answer. Never a confidence number. */
export const CHILD_REVIEW_MESSAGE = "We need a quick check on this one.";

/** From this many marks a question is a word problem: a correct final answer earns full marks. */
export const WORD_PROBLEM_MIN_MARKS = 3;

/**
 * Unit rule (scheme method `exact_with_unit`, answer has a unit): a correct number with a missing or
 * wrong unit loses one mark, never below 0, but only when the question is worth 2 or more marks. A
 * 1-mark question has nothing to spare, so a missing unit scores 0. Method `exact` never assesses units.
 */
export function unitPenaltyScore(marks: number): number {
  return marks >= 2 ? marks - 1 : 0;
}

function decision(
  question: MarkableQuestion,
  score: number,
  reason: string,
  kind: "confident" | "review" = "confident",
): MarkingDecision {
  if (kind === "review") {
    return {
      score: 0,
      maxScore: question.marks,
      method: "needs_review",
      confidence: "low",
      reason,
      reviewRequired: true,
      childMessage: CHILD_REVIEW_MESSAGE,
    };
  }
  return { score, maxScore: question.marks, method: "deterministic", confidence: "high", reason, reviewRequired: false };
}

const full = (q: MarkableQuestion, reason: string) => decision(q, q.marks, reason);
const zero = (q: MarkableQuestion, reason: string) => decision(q, 0, reason);
const review = (q: MarkableQuestion, reason: string) => decision(q, 0, reason, "review");

function isBlank(text: string | undefined): boolean {
  return text === undefined || text.trim() === "";
}

/** A wrong final answer: 0, unless a word problem shows working, which a person or AI marker judges. */
function wrongAnswer(q: MarkableQuestion, response: MarkingResponse, reason: string): MarkingDecision {
  if (q.marks >= WORD_PROBLEM_MIN_MARKS && response.hasHandwriting) {
    return review(q, `${reason} Working is shown, so method marks may be due.`);
  }
  return zero(q, reason);
}

function markMcq(q: MarkableQuestion, response: MarkingResponse, answer: Extract<MarkableQuestion["answer"], { kind: "mcq" }>) {
  if (response.selectedOption === undefined) {
    if (!isBlank(response.typedAnswer)) return review(q, "Typed text given for a multiple-choice question.");
    return zero(q, "No option selected.");
  }
  return response.selectedOption === answer.correct
    ? full(q, "Correct option.")
    : zero(q, "Incorrect option.");
}

function markText(q: MarkableQuestion, response: MarkingResponse, answer: Extract<MarkableQuestion["answer"], { kind: "text" }>) {
  if (isBlank(response.typedAnswer)) return blank(q, response);
  if (answersEquivalent(answer, response.typedAnswer as string)) return full(q, "Matches an accepted answer.");
  return review(q, "Text answer is not in the accepted list.");
}

function blank(q: MarkableQuestion, response: MarkingResponse): MarkingDecision {
  if (q.marks >= WORD_PROBLEM_MIN_MARKS && response.hasHandwriting) {
    return review(q, "No final answer entered, but working is shown. Method marks may be due.");
  }
  return zero(q, "No answer given.");
}

const FRACTION_FORMAT = /^(?:\d+ )?\d+\/[1-9]\d*$|^\d+$/;

function markFraction(q: MarkableQuestion, response: MarkingResponse, answer: Extract<MarkableQuestion["answer"], { kind: "fraction" }>) {
  if (isBlank(response.typedAnswer)) return blank(q, response);
  const given = (response.typedAnswer as string).trim().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ");
  if (!FRACTION_FORMAT.test(given)) {
    return review(q, "Typed answer is not written as a fraction or mixed number.");
  }
  if (answersEquivalent(answer, given)) return full(q, "Correct fraction.");

  const expectedValue = tryParseRational(answer.value);
  const givenValue = tryParseRational(given);
  if (expectedValue && givenValue && equals(expectedValue, givenValue)) {
    if (answer.acceptEquivalent && answer.requireSimplest && !isSimplestFraction(given)) {
      return wrongAnswer(q, response, "Right value, but not in simplest form.");
    }
    return wrongAnswer(q, response, "Right value, but not in the required form.");
  }
  return wrongAnswer(q, response, "Incorrect fraction.");
}

type Resolved =
  | { ok: true; value: Rational; unit: Unit | undefined }
  | { ok: false; reason: string };

/** Turn the typed text plus any separate unit field into one value and at most one unit. */
function resolveTyped(response: MarkingResponse, answer: NumberAnswer): Resolved {
  const parsed = parseNumberText(response.typedAnswer as string);
  if (!parsed.ok) return parsed;

  const fieldText = response.typedUnit?.trim() ?? "";
  let fieldUnit: Unit | undefined;
  if (fieldText !== "") {
    const known = normaliseUnit(fieldText);
    if (!known) return { ok: false, reason: `Unrecognised unit "${fieldText}".` };
    fieldUnit = known;
  }

  if (parsed.segments.length > 1) {
    if (fieldUnit) return { ok: false, reason: "Compound answer together with a separate unit." };
    if (!answer.unit) return { ok: false, reason: "Compound answer, but no unit is expected." };
    const target = answer.unit;
    let previousSize: bigint | undefined;
    const seen = new Set<Unit>();
    let total: Rational = { n: 0n, d: 1n };
    for (const segment of parsed.segments) {
      const unit = segment.unit as Unit;
      if (dimensionOf(unit) !== dimensionOf(target)) {
        return { ok: false, reason: "Compound answer uses units that do not fit this question." };
      }
      const size = unitSize(unit);
      if (seen.has(unit) || (previousSize !== undefined && size >= previousSize)) {
        return { ok: false, reason: "Compound answer is not written from larger to smaller unit." };
      }
      seen.add(unit);
      previousSize = size;
      total = add(total, convertQuantity(segment.value, unit, target));
    }
    return { ok: true, value: total, unit: target };
  }

  const only = parsed.segments[0]!;
  if (only.unit && fieldUnit && only.unit !== fieldUnit) {
    return { ok: false, reason: "The unit typed with the number and the unit field disagree." };
  }
  return { ok: true, value: only.value, unit: only.unit ?? fieldUnit };
}

function markNumber(q: MarkableQuestion, response: MarkingResponse, answer: NumberAnswer) {
  if (isBlank(response.typedAnswer)) return blank(q, response);
  const expected = tryParseRational(answer.value);
  if (!expected) return review(q, "The answer key is not a valid number.");

  const resolved = resolveTyped(response, answer);
  if (!resolved.ok) return review(q, resolved.reason);
  const { value, unit } = resolved;

  if (equals(value, expected)) {
    const assessed = q.markingScheme.method === "exact_with_unit" && answer.unit !== undefined;
    if (!assessed || unit === answer.unit) return full(q, "Correct answer.");
    const penalised = unitPenaltyScore(q.marks);
    return decision(
      q,
      penalised,
      unit === undefined ? "Correct number, unit missing." : "Correct number, wrong unit.",
    );
  }

  // The same quantity in another unit (1250 g for 1.25 kg): a person decides whether that is acceptable.
  if (answer.unit && unit && unit !== answer.unit && dimensionOf(unit) === dimensionOf(answer.unit)) {
    if (equals(convertQuantity(value, unit, answer.unit), expected)) {
      return review(q, "Same quantity written in a different unit.");
    }
  }
  return wrongAnswer(q, response, "Incorrect number.");
}

/**
 * Mark one question deterministically. Never guesses: input that cannot be read confidently
 * becomes `needs_review` (proposed score 0, `reviewRequired`, child-safe message).
 */
export function markQuestion(question: MarkableQuestion, response: MarkingResponse = {}): MarkingDecision {
  const { answer } = question;
  switch (answer.kind) {
    case "mcq":
      return markMcq(question, response, answer);
    case "number":
      return markNumber(question, response, answer);
    case "fraction":
      return markFraction(question, response, answer);
    case "text":
      return markText(question, response, answer);
  }
}
