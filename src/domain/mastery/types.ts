import type { Difficulty, QuestionType } from "@/schemas/question-content";

export type MasteryState =
  | "not_started"
  | "learning"
  | "developing"
  | "almost_mastered"
  | "mastered"
  | "retained";

/** Low to high. Used to compare states and to order practice. */
export const MASTERY_STATE_RANK: Record<MasteryState, number> = {
  not_started: 0,
  learning: 1,
  developing: 2,
  almost_mastered: 3,
  mastered: 4,
  retained: 5,
};

/** One piece of evidence against one curriculum outcome. */
export type MasteryEvidence = {
  outcomeId: string;
  questionId: string;
  familyId: string;
  questionType: QuestionType;
  difficulty: Difficulty;
  /** 0..1: marks earned over marks available. */
  scoreRatio: number;
  /** True only for the first meaningful attempt at this question. Retries never count towards mastery. */
  firstAttempt: boolean;
  sessionId: string;
  /** ISO 8601 timestamp. */
  at: string;
};

export type OutcomeMastery = {
  outcomeId: string;
  state: MasteryState;
  /** First-attempt items that count towards mastery. */
  evidenceCount: number;
  /** Distinct sessions among the counted items. */
  sessions: number;
  /** Latest evidence of any kind, ISO 8601. */
  lastPracticedAt?: string;
  /** When the current mastered streak began, ISO 8601. */
  masteredAt?: string;
  /** Next spaced-retention check for mastered/retained outcomes, ISO 8601. */
  reviewDueAt?: string;
  /** Weighted recent accuracy 0..1. For ordering and debugging; never shown to children. */
  recentAccuracy?: number;
};
