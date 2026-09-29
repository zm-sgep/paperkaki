import type { Block, Inline, QuestionContent } from "@/schemas/question-content";

/**
 * Structured input for the PDF renderers (M4-04, M4-05).
 *
 * The renderer only lays out what it is given. It never selects questions,
 * decides marks or looks anything up. StudentPaper deliberately has no answer,
 * verification, solution or outcome fields: see `NoAnswerFields`.
 */

export type WorkingSpace = "none" | "small" | "medium" | "large";

/**
 * Forbidden keys, typed `never`. A question or section carrying any of these
 * (even through a variable, not just an object literal) is a compile error, so
 * answer data cannot reach the student paper by accident.
 */
export interface NoAnswerFields {
  answer?: never;
  answers?: never;
  correct?: never;
  workedSolution?: never;
  solution?: never;
  verification?: never;
  markingScheme?: never;
  primaryOutcomeCode?: never;
  secondaryOutcomeCodes?: never;
  topicLabel?: never;
}

export interface StudentQuestion extends NoAnswerFields {
  number: number;
  marks: number;
  content: QuestionContent;
  workingSpace: WorkingSpace;
}

export interface StudentSection extends NoAnswerFields {
  title: string;
  instructions?: string;
  questions: StudentQuestion[];
}

export interface StudentPaper extends NoAnswerFields {
  /** e.g. "Mathematics WA2 · Mock 1" */
  title: string;
  levelLabel: string;
  subjectLabel: string;
  durationMinutes: number;
  totalMarks: number;
  instructions: string[];
  sections: StudentSection[];
}

export interface AnswerPackQuestion {
  number: number;
  marks: number;
  answer: Inline[];
  workedSolution: Block[];
  /** Plain-words topic, e.g. "Fractions: adding like fractions". */
  topicLabel: string;
}

export interface AnswerPackSection {
  title: string;
  questions: AnswerPackQuestion[];
}

export interface AnswerPack {
  title: string;
  sections: AnswerPackSection[];
}

/** Already-resolved image bytes. The renderer never fetches. */
export interface PdfImage {
  data: Uint8Array;
  format: "png" | "jpg";
}

export interface RenderOptions {
  /** assetKey -> resolved image, or null when the asset could not be loaded (a placeholder box is drawn). */
  images?: Readonly<Record<string, PdfImage | null>>;
  /** Fixed by default so output is stable. Pass the paper's frozen date to embed it. */
  creationDate?: Date;
}
