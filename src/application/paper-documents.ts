/**
 * Turns a validated selection and its questions into the structured input of the two PDF
 * renderers (M4-04, M4-05). Pure and deterministic: the same paper always gives the same data,
 * and both documents are built from ONE list, so numbering and marks always agree.
 *
 * The student paper carries no answer data at all: this module builds it from question content
 * only, and the renderer refuses anything else.
 */
import { blueprintSections, type Blueprint, type SectionCode } from "@/domain/assessments/blueprint";
import { printedBookletOf, type SectionKind } from "@/domain/assessments/paper-format";
import { workingSpaceFor } from "@/domain/papers/working-space";
import type { Answer, Block, Inline, QuestionContent, QuestionType } from "@/schemas/question-content";
import type { AnswerPack, AnswerPackSection, StudentPaper, StudentQuestion, StudentSection } from "@/services/pdf/types";

/** One question of the frozen paper, with everything either document needs. */
export type PaperContentQuestion = {
  number: number;
  sectionCode: SectionCode;
  marks: number;
  questionType: QuestionType;
  content: QuestionContent;
  answer: Answer;
  workedSolution: Block[];
  /** The parent-facing topic label, never a curriculum code. */
  topicLabel: string;
};

export type PaperContentInput = {
  /** "WA2" */
  assessmentName: string;
  mockNumber: number;
  blueprint: Blueprint;
  questions: readonly PaperContentQuestion[];
};

export const STUDENT_INSTRUCTIONS: readonly string[] = [
  "Answer all questions.",
  "Write your answers in the spaces provided.",
  "Calculators are not allowed.",
];

/** Default wording for each kind of part. */
export const SECTION_INSTRUCTIONS: Record<SectionKind, string> = {
  mcq: "For each question, four options are given. One of them is the correct answer. Write its number (1, 2, 3 or 4) in the brackets provided.",
  short: "Write your answers in the spaces provided. Give your answers in the units stated.",
  word_problem: "Show your working clearly in the space below each question. Write your answers in the spaces provided.",
};

export function paperTitle(assessmentName: string, mockNumber: number): string {
  return `Mathematics ${assessmentName} · Mock ${mockNumber}`;
}

const text = (v: string): Inline => ({ t: "text", v });

function fractionInline(value: string): Inline {
  const [head, tail] = value.includes(" ") ? (value.split(" ") as [string, string]) : [undefined, value];
  const [n, d] = tail.split("/").map(Number) as [number, number];
  return head === undefined ? { t: "frac", n, d } : { t: "frac", n, d, whole: Number(head) };
}

/** The answer as the parent reads it. Multiple choice uses the same (1) to (4) labels the child sees. */
export function answerInlines(answer: Answer, content: QuestionContent): Inline[] {
  switch (answer.kind) {
    case "mcq": {
      const index = content.options?.findIndex((option) => option.id === answer.correct) ?? -1;
      const option = index >= 0 ? content.options?.[index] : undefined;
      return option ? [text(`(${index + 1}) `), ...option.c] : [text(answer.correct)];
    }
    case "number": {
      const shown = answer.unit === "$" ? `$${answer.value}` : `${answer.value}${answer.unit ? ` ${answer.unit}` : ""}`;
      return answer.display && answer.display.length > 0 ? [text(`${shown}, or `), ...answer.display] : [text(shown)];
    }
    case "fraction":
      return [fractionInline(answer.value)];
    case "text":
      return [text(answer.accepted.join(" or "))];
  }
}

function inSectionOrder(blueprint: Blueprint, questions: readonly PaperContentQuestion[]) {
  const sorted = [...questions].sort((a, b) => a.number - b.number);
  return blueprintSections(blueprint)
    .map((section) => ({ section, questions: sorted.filter((q) => q.sectionCode === section.code) }))
    .filter((group) => group.questions.length > 0);
}

/** "Section A (12 marks)": the school's own name for the part, with its marks. */
export const sectionTitle = (label: string, marks: number): string => `${label} (${marks} ${marks === 1 ? "mark" : "marks"})`;

const marksOf = (questions: readonly PaperContentQuestion[]): number => questions.reduce((total, q) => total + q.marks, 0);

export function buildStudentPaper(input: PaperContentInput): StudentPaper {
  const { blueprint } = input;
  const sections: StudentSection[] = inSectionOrder(blueprint, input.questions).map(({ section, questions }) => {
    const booklet = printedBookletOf(section);
    return {
      title: sectionTitle(section.label, marksOf(questions)),
      ...(booklet === undefined ? {} : { booklet }),
      instructions: SECTION_INSTRUCTIONS[section.kind],
      questions: questions.map(
        (q): StudentQuestion => ({
          number: q.number,
          marks: q.marks,
          content: q.content,
          workingSpace: workingSpaceFor(q.questionType, q.marks),
        }),
      ),
    };
  });
  return {
    title: paperTitle(input.assessmentName, input.mockNumber),
    levelLabel: "Primary 3",
    subjectLabel: "Mathematics",
    durationMinutes: blueprint.durationMinutes,
    totalMarks: marksOf(input.questions),
    instructions: [...STUDENT_INSTRUCTIONS],
    sections,
  };
}

export function buildAnswerPack(input: PaperContentInput): AnswerPack {
  const sections: AnswerPackSection[] = inSectionOrder(input.blueprint, input.questions).map(({ section, questions }) => {
    const booklet = printedBookletOf(section);
    return {
      title: sectionTitle(section.label, marksOf(questions)),
      ...(booklet === undefined ? {} : { booklet }),
      questions: questions.map((q) => ({
        number: q.number,
        marks: q.marks,
        answer: answerInlines(q.answer, q.content),
        workedSolution: q.workedSolution,
        topicLabel: q.topicLabel,
      })),
    };
  });
  return { title: paperTitle(input.assessmentName, input.mockNumber), sections };
}
