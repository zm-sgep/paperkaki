/**
 * Parent-facing wording for the mock screens and the mock generation command. Pure, so the
 * sentences are unit-tested and never assembled inside components. No internal terms and no
 * percentages (UX rule 9), and every problem says what was (not) saved and what to do next.
 */

export const MOCK_GENERATION_MESSAGES = {
  notConfirmed: "Choose your topics first, then we can create a mock.",
  noFit: "We couldn't fit questions to those exact marks. Try a different number of marks or add another topic.",
  noDifferentPaper:
    "We can't make a different mock from these topics yet, because we would have to repeat an earlier one. Add another topic or change the marks, then try again.",
  couldNotRender: "We couldn't create the PDF this time. Nothing was saved. Please try again.",
  couldNotSave: "We couldn't save the mock this time. Nothing was saved. Please try again.",
  changedMeanwhile: "Your topics or settings changed while we were creating the mock. Nothing was saved. Please try again.",
  busy: "Another mock is being created for this assessment. Wait a moment, then try again.",
} as const;

/** True when two lists hold the same questions, whatever their order. */
export function sameQuestionSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const inB = new Set(b);
  return a.every((id) => inB.has(id));
}

/** True when the chosen questions are exactly the questions of an earlier paper. */
export function repeatsEarlierPaper(chosen: readonly string[], earlier: readonly { questionIds: readonly string[] }[]): boolean {
  return earlier.some((paper) => sameQuestionSet(chosen, paper.questionIds));
}

/** "40 marks · 45 minutes · Fractions, Whole numbers" */
export function mockSummaryLine(input: { totalMarks: number; durationMinutes: number; topicLabels: readonly string[] }): string {
  return [`${input.totalMarks} marks`, `${input.durationMinutes} minutes`, input.topicLabels.join(", ")]
    .filter((part) => part !== "")
    .join(" · ");
}

export function mockReadyHeading(number: number): string {
  return `Mock ${number} is ready`;
}

/** "Print on A4. Give Darius 45 minutes." */
export function printTip(childNickname: string, durationMinutes: number): string {
  return `Print on A4. Give ${childNickname} ${durationMinutes} minutes.`;
}

export const ANSWER_PACK_NOTE = "Keep this for yourself. It has the answers.";
