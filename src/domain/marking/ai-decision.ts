import type { MarkResponseOutput } from "@/schemas/marking-ai";
import { CHILD_REVIEW_MESSAGE } from "./mark-question";
import type { MarkableQuestion, MarkingConfidence } from "./types";

/**
 * Turns what the AI marker proposed into a decision, by rule. The AI proposes; these rules decide
 * what is settled:
 *  - a mark outside 0..marks, or one for a different total, is not trusted and goes to the parent;
 *  - low confidence, or the AI asking for a person to look, goes to the parent with the proposal shown;
 *  - only a clear, high-confidence mark is settled.
 * Never touches points or mastery.
 */

export type AiMarkingDecision = {
  /** The proposed mark, clamped to 0..marks. Provisional while `reviewRequired`. */
  score: number;
  maxScore: number;
  method: "ai_assisted";
  confidence: MarkingConfidence;
  /** One sentence for the parent. */
  reason: string;
  reviewRequired: boolean;
  errorType: MarkResponseOutput["errorType"];
  childMessage?: string;
};

export function decisionFromAiMarking(question: Pick<MarkableQuestion, "marks">, output: MarkResponseOutput): AiMarkingDecision {
  const consistent = output.maxScore === question.marks && output.proposedScore >= 0 && output.proposedScore <= question.marks;
  const score = Math.min(question.marks, Math.max(0, Math.round(output.proposedScore)));
  const settled = consistent && output.confidence === "high" && !output.reviewRequired;
  return {
    score,
    maxScore: question.marks,
    method: "ai_assisted",
    confidence: settled ? "high" : "low",
    reason: output.reason,
    reviewRequired: !settled,
    errorType: output.errorType,
    ...(settled ? {} : { childMessage: CHILD_REVIEW_MESSAGE }),
  };
}

/** Words for what went wrong, for the marked paper. Plain, kind and short; never a score or a label for the child. */
export const ERROR_TYPE_TEXT: Record<NonNullable<MarkResponseOutput["errorType"]>, string> = {
  calculation: "The method was fine, but there was a slip in the calculation.",
  method: "A different method was needed to answer this one.",
  misread: "The question asked for something a little different.",
  incomplete: "The working stopped before the answer was reached.",
  other: "Something in the working needs another look.",
};
