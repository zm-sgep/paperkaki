import type { Difficulty, QuestionType } from "@/schemas/question-content";
import type { MasteryEvidence } from "./types";

/**
 * How a marked answer becomes mastery evidence (M8). Pure: the application layer gathers the facts,
 * this decides what counts.
 *
 *  - Every marked answer is one piece of evidence against the question's primary outcome, in the order
 *    the child answered. An unanswered question was marked 0 and counts as 0 (the child had the paper
 *    and handed it in).
 *  - The score is marks earned over marks available, 0 to 1, from the mark that counts (the final score
 *    after any quick check), never from a proposal that is still waiting for a person.
 *  - Only the first meaningful attempt at a question counts towards mastery. Trying the same question
 *    again is practice, not evidence of understanding; a different question on the same outcome is new.
 */

export type MarkedAnswerFacts = {
  outcomeId: string;
  questionId: string;
  familyId: string;
  questionType: QuestionType;
  difficulty: Difficulty;
  /** The mark that counts. */
  score: number;
  /** Marks available. */
  maxScore: number;
  /** The mock or practice set the answer belongs to. */
  sessionId: string;
  /** ISO 8601: when the child answered. */
  answeredAt: string;
};

/** Marks earned over marks available, always within 0 to 1. A question worth no marks counts as 0. */
export function scoreRatioOf(score: number, maxScore: number): number {
  if (!(maxScore > 0) || !Number.isFinite(score)) return 0;
  return Math.min(1, Math.max(0, score / maxScore));
}

/**
 * One piece of evidence per answer, in the given order. `alreadyAnswered` holds the ids of questions this
 * child has answered before (from earlier evidence); a question is a first attempt when it is not there,
 * and not repeated earlier in this same list.
 */
export function evidenceFromAnswers(
  answers: readonly MarkedAnswerFacts[],
  alreadyAnswered: ReadonlySet<string> = new Set(),
): (MasteryEvidence & { firstAttempt: boolean })[] {
  const seen = new Set(alreadyAnswered);
  return answers.map((answer) => {
    const firstAttempt = !seen.has(answer.questionId);
    seen.add(answer.questionId);
    return {
      outcomeId: answer.outcomeId,
      questionId: answer.questionId,
      familyId: answer.familyId,
      questionType: answer.questionType,
      difficulty: answer.difficulty,
      scoreRatio: scoreRatioOf(answer.score, answer.maxScore),
      firstAttempt,
      sessionId: answer.sessionId,
      at: answer.answeredAt,
    };
  });
}
