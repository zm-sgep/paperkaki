import { z } from "zod";
import { LEVEL_PATTERN } from "./curriculum-import";

/**
 * Parent-safe curriculum selection (M1-07): what assessment setup may show and pick from.
 * Labels are the parent's and child's own wording. Codes and ids are for mapping later steps
 * (scope, blueprint) and must never be rendered: UI code uses `label`.
 * No verification state, source or version status appears here.
 */

export const SelectableTopicsQuerySchema = z.object({
  subject: z.string().trim().min(1, { error: "is required" }),
  level: z.string().regex(LEVEL_PATTERN, { error: 'must be a level from "P1" to "P6"' }),
});
export type SelectableTopicsQuery = z.infer<typeof SelectableTopicsQuerySchema>;

export const SelectableOutcomeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  /** The child's wording. */
  label: z.string(),
});

export const SelectableTopicSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  /** The parent's wording. */
  label: z.string(),
  outcomes: z.array(SelectableOutcomeSchema),
});

export const SelectableTopicsResponseSchema = z.object({
  curriculumVersionId: z.uuid(),
  topics: z.array(SelectableTopicSchema),
});

export type SelectableOutcome = z.infer<typeof SelectableOutcomeSchema>;
export type SelectableTopic = z.infer<typeof SelectableTopicSchema>;
export type SelectableTopicsResponse = z.infer<typeof SelectableTopicsResponseSchema>;
