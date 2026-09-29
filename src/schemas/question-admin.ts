import { z } from "zod";
import { DifficultySchema, QuestionTypeSchema } from "./question-content";

/**
 * Admin question-list filters as they arrive in the URL. Anything that does not parse is treated
 * as "no filter" rather than an error, so a stale or hand-edited link still opens the list.
 */

const StatusSchema = z.enum(["draft", "in_review", "approved", "retired"]);
const UuidSchema = z.uuid();

export type QuestionFilterParams = {
  level?: string;
  topicId?: string;
  outcomeId?: string;
  questionType?: z.infer<typeof QuestionTypeSchema>;
  difficulty?: z.infer<typeof DifficultySchema>;
  status?: z.infer<typeof StatusSchema>;
};

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

export function parseQuestionFilters(query: Record<string, string | string[] | undefined>): {
  filters: QuestionFilterParams;
  page: number;
} {
  const pick = <T>(schema: z.ZodType<T>, key: string): T | undefined => {
    const parsed = schema.safeParse(first(query[key]));
    return parsed.success ? parsed.data : undefined;
  };
  const filters: QuestionFilterParams = {};
  const level = pick(z.string().regex(/^[A-Za-z0-9 ._-]{1,16}$/), "level");
  if (level) filters.level = level;
  const topicId = pick(UuidSchema, "topic");
  if (topicId) filters.topicId = topicId;
  const outcomeId = pick(UuidSchema, "outcome");
  if (outcomeId) filters.outcomeId = outcomeId;
  const questionType = pick(QuestionTypeSchema, "type");
  if (questionType) filters.questionType = questionType;
  const difficulty = pick(DifficultySchema, "difficulty");
  if (difficulty) filters.difficulty = difficulty;
  const status = pick(StatusSchema, "status");
  if (status) filters.status = status;
  const page = pick(z.coerce.number().int().min(1).max(100000), "page") ?? 1;
  return { filters, page };
}

/** The list URL for a set of filters (and optionally a page), omitting anything unset. */
export function questionListHref(filters: QuestionFilterParams, page = 1): string {
  const params = new URLSearchParams();
  if (filters.level) params.set("level", filters.level);
  if (filters.topicId) params.set("topic", filters.topicId);
  if (filters.outcomeId) params.set("outcome", filters.outcomeId);
  if (filters.questionType) params.set("type", filters.questionType);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  if (filters.status) params.set("status", filters.status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/questions?${query}` : "/admin/questions";
}
