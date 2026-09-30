import type { QuestionContent } from "@/schemas/question-content";

/**
 * What the mock screen needs to show a frozen paper. There is deliberately no answer, marking
 * scheme or solution in here: the pupil's device never receives them (docs/ARCHITECTURE.md
 * section 10). `input` says which answer control to show, and `working` whether the question gets
 * a handwriting area (decided upstream from the marks; see domain/papers/working-space.ts).
 */

export type MockQuestionInput =
  | { kind: "mcq" }
  | { kind: "number"; /** The unit the question states, shown beside the box. */ unit?: string }
  | { kind: "fraction" }
  | { kind: "text" };

export type MockQuestion = {
  id: string;
  marks: number;
  content: QuestionContent;
  input: MockQuestionInput;
  working: boolean;
  /** True for multiple choice: the working area is there if the child wants it, and hidden until they ask. */
  workingOptional?: boolean;
};

export type MockPaper = {
  attemptId: string;
  /** "Mathematics WA2 · Mock 1" */
  title: string;
  durationMinutes: number;
  questions: readonly MockQuestion[];
};
