import { markQuestion } from "./mark-question";
import type { AttemptMarkResult, MarkableQuestion, MarkingResponse } from "./types";

/**
 * Mark a whole attempt. `responses` is keyed by question id; a missing entry is a blank answer.
 * Totals use proposed scores, so `score` is provisional while `reviewCount` is above 0.
 */
export function markAttempt(
  questions: readonly MarkableQuestion[],
  responses: Readonly<Record<string, MarkingResponse | undefined>>,
): AttemptMarkResult {
  const seen = new Set<string>();
  const results = questions.map((question) => {
    if (seen.has(question.id)) throw new Error(`Duplicate question id "${question.id}" in attempt.`);
    seen.add(question.id);
    return { questionId: question.id, decision: markQuestion(question, responses[question.id] ?? {}) };
  });

  return {
    results,
    totals: {
      score: results.reduce((sum, r) => sum + r.decision.score, 0),
      maxScore: results.reduce((sum, r) => sum + r.decision.maxScore, 0),
      reviewCount: results.filter((r) => r.decision.reviewRequired).length,
    },
  };
}
