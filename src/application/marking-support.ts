import type { MarkableQuestion } from "@/domain/marking";
import type { AttemptPaperQuestion } from "@/repositories/postgres/attempts";
import { AnswerSchema, MarkingSchemeSchema } from "@/schemas/question-content";

/** The parts of a paper question that marking needs. The paper question id is the marking key. */
export function markableOf(item: Pick<AttemptPaperQuestion, "paperQuestionId" | "marks" | "question">): MarkableQuestion {
  const answer = AnswerSchema.safeParse(item.question.answer);
  const scheme = MarkingSchemeSchema.safeParse(item.question.markingScheme);
  if (!answer.success || !scheme.success) throw new Error("A question on this paper cannot be marked.");
  return { id: item.paperQuestionId, questionType: item.question.questionType, marks: item.marks, answer: answer.data, markingScheme: scheme.data };
}
