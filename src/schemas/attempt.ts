import { z } from "zod";

/**
 * What a child's device sends to save its progress. Answers are keyed by the paper's own question
 * row. `strokes` is the versioned stroke document; the server re-reads it with the stroke model, so
 * anything it does not understand is refused rather than stored.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SavedResponseSchema = z.object({
  paperQuestionId: z.string().regex(UUID),
  selected: z.enum(["A", "B", "C", "D"]).nullable(),
  typed: z.string().max(500).nullable(),
  strokes: z.record(z.string(), z.unknown()).nullable(),
  flagged: z.boolean(),
});
export type SavedResponseInput = z.infer<typeof SavedResponseSchema>;

export const SaveProgressInputSchema = z.object({
  /** The question the child is on, 1 = the first. */
  position: z.number().int().min(1).max(200),
  /** When the device made these answers (ISO 8601). The newest write for a question wins. */
  savedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), { error: "must be a date and time" }),
  responses: z.array(SavedResponseSchema).max(100),
});
export type SaveProgressInput = z.infer<typeof SaveProgressInputSchema>;
