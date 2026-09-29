import type { Answer, MarkingScheme, OptionId, QuestionType } from "@/schemas/question-content";

export type NumberAnswer = Extract<Answer, { kind: "number" }>;

/** The parts of a question that marking needs. Nothing about content or curriculum. */
export type MarkableQuestion = {
  id: string;
  questionType: QuestionType;
  marks: number;
  answer: Answer;
  markingScheme: MarkingScheme;
};

/** What the child (or a scanned/typed transcription) gave for one question. */
export type MarkingResponse = {
  selectedOption?: OptionId | undefined;
  typedAnswer?: string | undefined;
  /** Unit picked or typed in a separate unit field, e.g. "cm". */
  typedUnit?: string | undefined;
  /** True when the child wrote working on the paper or the iPad canvas. */
  hasHandwriting?: boolean | undefined;
};

export type MarkingMethod = "deterministic" | "needs_review";
export type MarkingConfidence = "high" | "low";

export type MarkingDecision = {
  /** Proposed score. For `needs_review` this is provisional (0) until a person or the AI marker decides. */
  score: number;
  maxScore: number;
  method: MarkingMethod;
  confidence: MarkingConfidence;
  /** Short internal text for reviewers and audit. Never shown to the child. */
  reason: string;
  reviewRequired: boolean;
  /** Set only when review is required. Never contains confidence numbers. */
  childMessage?: string;
};

export type QuestionMarkResult = { questionId: string; decision: MarkingDecision };

export type AttemptMarkResult = {
  /** In question order. */
  results: QuestionMarkResult[];
  totals: {
    /** Sum of proposed scores. Provisional while `reviewCount` > 0. */
    score: number;
    maxScore: number;
    reviewCount: number;
  };
};
