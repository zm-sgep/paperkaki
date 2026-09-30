import type { MarkingScheme } from "@/schemas/question-content";
import { ERROR_TYPE_TEXT } from "./ai-decision";
import type { MarkingErrorType } from "@/schemas/marking-ai";

/**
 * The plain words on the quick check and the marked paper. Pure, so every sentence is tested and none is
 * assembled inside a component. They never show confidence, model or score internals.
 */

/** The marking scheme as a parent reads it: what earns full marks and what earns part marks. */
export function markingSchemeWords(scheme: MarkingScheme, marks: number): string[] {
  const full =
    scheme.method === "exact_with_unit"
      ? `${marksWord(marks)} for the right answer with its unit.`
      : `${marksWord(marks)} for the right answer.`;
  const partial = (scheme.partialMarks ?? []).map((part) => `${marksWord(part.marks)} for: ${part.criterion}`);
  return [full, ...partial];
}

export function marksWord(marks: number): string {
  return marks === 1 ? "1 mark" : `${marks} marks`;
}

/** What the child wrote, as one short line: "B", "45 cm", "3/4", or "No answer". */
export function childAnswerText(saved: { selectedOption?: string | null; typedAnswer?: string | null; typedUnit?: string | null }): string {
  if (saved.selectedOption) return saved.selectedOption;
  const typed = saved.typedAnswer?.trim();
  if (!typed) return "No answer";
  return saved.typedUnit && /^-?[\d.,]+$/.test(typed) ? (saved.typedUnit === "$" ? `$${typed}` : `${typed} ${saved.typedUnit}`) : typed;
}

/** "✓" for full marks and "✗" otherwise, always beside the marks so colour is never the only signal. */
export function markSymbol(score: number, marks: number): "✓" | "✗" {
  return score >= marks ? "✓" : "✗";
}

export function markText(score: number, marks: number): string {
  return `${markSymbol(score, marks)} ${score}/${marks}`;
}

export type Audience = "parent" | "child";

/** One or two sentences on what happened with this answer. */
export function whatHappenedText(input: {
  audience: Audience;
  score: number;
  marks: number;
  childAnswer: string;
  correctAnswer: string;
  answered: boolean;
}): string {
  const you = input.audience === "child" ? "You" : "They";
  if (input.score >= input.marks) return input.audience === "child" ? "You got this one right." : "Right answer.";
  if (!input.answered) return `${you} didn't answer this one. The answer is ${input.correctAnswer}.`;
  const wrote = input.audience === "child" ? "You wrote" : "They wrote";
  if (input.score > 0) return `${wrote} ${input.childAnswer}. The answer is ${input.correctAnswer}, and ${input.audience === "child" ? "your" : "their"} working earned ${marksWord(input.score)}.`;
  return `${wrote} ${input.childAnswer}. The answer is ${input.correctAnswer}.`;
}

/** A short explanation of the kind of slip, when a marker saw one. Null when there is nothing kind and true to say. */
export function explanationFor(errorType: MarkingErrorType | null | undefined): string | null {
  return errorType ? ERROR_TYPE_TEXT[errorType] : null;
}
