import { z } from "zod";
import { FORMAT_LIMITS, type PaperFormat } from "@/domain/assessments/paper-format";
import { PAPER_LIMITS } from "@/domain/assessments/recommend";

/**
 * Shape check for a paper format read from a form or from storage. It only checks types and
 * ranges; `validatePaperFormat` (domain) checks that the marks add up and says what to change.
 */
const NameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim());

export const FormatSectionSchema = z
  .object({
    label: NameSchema.pipe(z.string().min(1).max(FORMAT_LIMITS.maxLabelLength)),
    booklet: NameSchema.pipe(z.string().max(FORMAT_LIMITS.maxLabelLength))
      .optional()
      .transform((value) => (value === undefined || value === "" ? undefined : value)),
    kind: z.enum(["mcq", "short", "word_problem"]),
    questionCount: z.number().int().min(FORMAT_LIMITS.minQuestions).max(FORMAT_LIMITS.maxQuestions),
    totalMarks: z.number().int().min(FORMAT_LIMITS.minSectionMarks).max(FORMAT_LIMITS.maxSectionMarks),
    marksEach: z.number().int().min(1).max(5).optional(),
  })
  .strict();

export const PaperFormatSchema = z
  .object({
    durationMinutes: z.number().int().min(PAPER_LIMITS.minMinutes).max(PAPER_LIMITS.maxMinutes),
    sections: z.array(FormatSectionSchema).min(1).max(FORMAT_LIMITS.maxSections),
  })
  .strict();

/** Parses unknown input into a PaperFormat, or returns undefined when it is not one. */
export function parsePaperFormat(input: unknown): PaperFormat | undefined {
  const result = PaperFormatSchema.safeParse(input);
  if (!result.success) return undefined;
  return {
    durationMinutes: result.data.durationMinutes,
    sections: result.data.sections.map((section) => ({
      label: section.label,
      ...(section.booklet === undefined ? {} : { booklet: section.booklet }),
      kind: section.kind,
      questionCount: section.questionCount,
      totalMarks: section.totalMarks,
      ...(section.marksEach === undefined ? {} : { marksEach: section.marksEach }),
    })),
  };
}
