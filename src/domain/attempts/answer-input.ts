import { workingSpaceFor } from "@/domain/papers/working-space";
import type { Answer, QuestionType, Unit } from "@/schemas/question-content";

/**
 * Which answer control a question gets on the child's screen, and whether it has a working area.
 * Decided here from the question's own type and marks (deterministic, no UI code), so the paper on
 * the iPad matches the printed one. The answer itself never leaves the server.
 */

export type AnswerInputKind =
  | { kind: "mcq" }
  | { kind: "number"; unit?: Unit }
  | { kind: "fraction" }
  | { kind: "text" };

export type WorkingArea = "none" | "optional" | "required";

export type QuestionInputPlan = {
  input: AnswerInputKind;
  /** Working is a large area for word problems and a smaller one for short answers; multiple choice may use it if the child wants. */
  working: WorkingArea;
};

export function planQuestionInput(question: { questionType: QuestionType; marks: number; answer: Answer }): QuestionInputPlan {
  const { answer } = question;
  const input: AnswerInputKind =
    answer.kind === "number"
      ? answer.unit
        ? { kind: "number", unit: answer.unit }
        : { kind: "number" }
      : answer.kind === "mcq"
        ? { kind: "mcq" }
        : { kind: answer.kind };
  // A working area for every question that is not multiple choice; multiple choice gets one only on request.
  const working: WorkingArea = workingSpaceFor(question.questionType, question.marks) === "none" ? "optional" : "required";
  return { input, working };
}

/** The unit shown beside the answer box, when the question states one. */
export function shownUnitOf(answer: Answer): Unit | undefined {
  return answer.kind === "number" ? answer.unit : undefined;
}
