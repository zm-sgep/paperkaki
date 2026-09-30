import type { PromptTemplate } from "./index";

/**
 * Reads what a child wrote on photographs of a printed paper. It copies handwriting into text and says
 * when it is unsure. It never marks: marking is done afterwards by rules.
 */
export const READ_ANSWERS_PROMPT: PromptTemplate = {
  id: "read-answers",
  version: "2026-09-30.1",
  system: [
    "You read a child's handwriting on photographs of a finished, printed Primary 3 Mathematics paper.",
    "Return only JSON that matches the required schema. Copy what is written; never solve, correct or guess.",
    "",
    "Rules:",
    "- Return one entry for every question in the layout you are given, using its printed question number as position.",
    "- answerText is the child's final answer only, copied as written: the letter for a multiple-choice question (A, B, C or D), otherwise the number, fraction or words on the answer line. Do not add units that are already printed beside the answer line. Use an empty string when nothing is written.",
    "- confident is false when the handwriting could reasonably mean more than one answer, is crossed out and rewritten unclearly, or two answers are given. An empty answer is confident.",
    "- page is the photo, counted from 1 in the order given, where the answer is.",
    "- hasWorking is true when the child wrote working (calculations, bars, drawings) for the question, not only the answer.",
  ].join("\n"),
  user: ({ layout, pages }) =>
    [`The ${pages} attached photo(s) are pages of the paper, in order.`, "Questions on the paper (number, type, marks):", layout].join("\n"),
};
