import { z } from "zod";

/**
 * What the AI service returns when it helps mark an answer, reads the answers on a photographed paper,
 * or reads the page numbers on the photos (ADR-0002: every model output is checked against a schema
 * before anything uses it). The service never decides points or mastery: it proposes a mark and says
 * how sure it is, and rules in src/domain/marking decide what happens next.
 */

export const MARKING_ERROR_TYPES = ["calculation", "method", "misread", "incomplete", "other"] as const;
export type MarkingErrorType = (typeof MARKING_ERROR_TYPES)[number];

const optional = <T extends z.ZodType>(schema: T) => schema.nullish().transform((value) => value ?? undefined);

const sentence = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1).max(300));

/** One sentence for the parent, a mark, and how sure the marker is. */
export const MarkResponseOutputSchema = z
  .object({
    proposedScore: z.number().int().min(0),
    maxScore: z.number().int().min(1),
    confidence: z.enum(["high", "low"]),
    reason: sentence,
    errorType: optional(z.enum(MARKING_ERROR_TYPES)),
    reviewRequired: z.boolean(),
  })
  .refine((output) => output.proposedScore <= output.maxScore, { error: "proposedScore cannot be more than maxScore", path: ["proposedScore"] });
export type MarkResponseOutput = z.infer<typeof MarkResponseOutputSchema>;

/** The same shape without transforms or refinements, for the provider's JSON schema. A test keeps them in step. */
export const MarkResponseModelSchema = z.object({
  proposedScore: z.number().int(),
  maxScore: z.number().int(),
  confidence: z.enum(["high", "low"]),
  reason: z.string(),
  errorType: z.enum(MARKING_ERROR_TYPES).nullable(),
  reviewRequired: z.boolean(),
});

/** One long answer never spoils the whole reading: it is cut to a length no child's answer line needs. */
const AnswerTextSchema = z.string().transform((value) => value.replace(/\s+/g, " ").trim().slice(0, 300));

/** One question's final answer as written on the paper. An empty text means nothing was written. */
export const ReadAnswerSchema = z.object({
  /** The printed question number, 1 upward. */
  position: z.number().int().min(1).max(200),
  answerText: AnswerTextSchema,
  /** False when the handwriting could mean more than one answer. */
  confident: z.boolean(),
  /** Which photo, counted from 1 in the order given, holds this answer. */
  page: optional(z.number().int().min(1).max(40)),
  /** True when the child wrote working (not just the answer) for this question. */
  hasWorking: optional(z.boolean()),
});
export type ReadAnswer = z.infer<typeof ReadAnswerSchema>;

export const ReadAnswersOutputSchema = z.object({ answers: z.array(ReadAnswerSchema).max(200) });
export type ReadAnswersOutput = z.infer<typeof ReadAnswersOutputSchema>;

export const ReadAnswersModelSchema = z.object({
  answers: z.array(
    z.object({
      position: z.number().int(),
      answerText: z.string(),
      confident: z.boolean(),
      page: z.number().int().nullable(),
      hasWorking: z.boolean().nullable(),
    }),
  ),
});

/** The number printed in the footer of each photo, in the order the photos were given. Null when it cannot be read. */
export const ReadPageNumbersOutputSchema = z.object({
  pages: z.array(z.object({ pageNumber: z.number().int().min(1).max(60).nullable() })).max(40),
});
export type ReadPageNumbersOutput = z.infer<typeof ReadPageNumbersOutputSchema>;
export const ReadPageNumbersModelSchema = z.object({
  pages: z.array(z.object({ pageNumber: z.number().int().nullable() })),
});
