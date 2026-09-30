import type { z } from "zod";
import { NoticeExtractionSchema, TopicMappingSchema, type NoticeExtraction, type TopicMapping } from "@/schemas/notice-extraction";
import {
  AIError,
  type AIAdapter,
  type AIRunRecorder,
  type AIService,
  type AITask,
  type AdapterOutput,
  type ExtractSchoolNoticeInput,
  type MapTopicsInput,
} from "./types";

/**
 * The gateway: the one place a provider adapter is called from. It times the call, checks the
 * provider's JSON against the schema, records a run row (task, provider, model, prompt version,
 * status, duration, token counts, error code; never file contents or child data), and turns
 * every failure into an `AIError` with a plain code.
 */

const notImplemented = (name: string): never => {
  throw new Error(`AIService.${name} is not implemented yet.`);
};

export function createAIService(options: { adapter: AIAdapter; record?: AIRunRecorder | undefined; now?: () => number }): AIService {
  const { adapter } = options;
  const clock = options.now ?? (() => performance.now());

  async function run<T>(task: AITask, call: () => Promise<AdapterOutput>, schema: z.ZodType<T, unknown>): Promise<T> {
    const started = clock();
    let meta: Partial<AdapterOutput> = {};
    try {
      const raw = await call();
      meta = raw;
      const parsed = schema.safeParse(raw.output);
      if (!parsed.success) {
        throw new AIError("invalid_output", "The answer did not match the expected shape.");
      }
      await record("succeeded", null);
      return parsed.data;
    } catch (error) {
      const code = error instanceof AIError ? error.code : "internal";
      await record("failed", code);
      throw error instanceof AIError ? error : new AIError("unavailable", "The model call failed.", { cause: error });
    }

    async function record(status: "succeeded" | "failed", errorCode: AIError["code"] | "internal" | null): Promise<void> {
      if (!options.record) return;
      try {
        await options.record({
          task,
          provider: adapter.provider,
          model: meta.model ?? "none",
          promptVersion: meta.promptVersion ?? "none",
          status,
          durationMs: Math.max(0, Math.round(clock() - started)),
          inputTokens: meta.inputTokens ?? null,
          outputTokens: meta.outputTokens ?? null,
          errorCode,
        });
      } catch {
        // Bookkeeping must never fail the call it describes.
      }
    }
  }

  return {
    provider: adapter.provider,
    extractSchoolNotice: (input: ExtractSchoolNoticeInput): Promise<NoticeExtraction> =>
      run("extract_school_notice", () => adapter.extractSchoolNotice(input), NoticeExtractionSchema),
    async mapTopics(input: MapTopicsInput): Promise<TopicMapping> {
      const allowed = new Set(input.topics.map((topic) => topic.code));
      const mapped = await run("map_topics", () => adapter.mapTopics(input), TopicMappingSchema);
      // The list is closed: a code the model made up is dropped, never turned into a topic.
      return {
        mappings: mapped.mappings.map((entry) => ({
          schoolLabel: entry.schoolLabel,
          topicCodes: [...new Set(entry.topicCodes.filter((code) => allowed.has(code)))],
        })),
      };
    },
    generateQuestion: async () => notImplemented("generateQuestion"),
    validateQuestion: async () => notImplemented("validateQuestion"),
    markResponse: async () => notImplemented("markResponse"),
    diagnoseError: async () => notImplemented("diagnoseError"),
  };
}
