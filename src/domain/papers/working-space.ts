import { questionKindOf } from "@/domain/assessments/paper-format";
import type { QuestionType } from "@/schemas/question-content";

export type WorkingSpaceSize = "none" | "small" | "medium" | "large";

/**
 * How much room to leave for working: none for multiple choice, a little for short answers (more
 * for two marks), plenty for word problems.
 */
export function workingSpaceFor(questionType: QuestionType, marks: number): WorkingSpaceSize {
  switch (questionKindOf({ questionType, marks })) {
    case "mcq":
      return "none";
    case "short":
      return marks <= 1 ? "small" : "medium";
    case "word_problem":
      return "large";
  }
}
