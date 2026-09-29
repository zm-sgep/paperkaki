import type { QuestionType } from "@/schemas/question-content";

export type WorkingSpaceSize = "none" | "small" | "medium" | "large";

/** How much room to leave for working: none for multiple choice, more for more marks. */
export function workingSpaceFor(questionType: QuestionType, marks: number): WorkingSpaceSize {
  if (questionType === "mcq") return "none";
  if (marks <= 1) return "none";
  if (marks === 2) return "small";
  if (marks === 3) return "medium";
  return "large";
}
