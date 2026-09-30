import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { insertAiRun } from "@/repositories/postgres/ai-runs";
import { getReadyDb } from "@/repositories/postgres/ready";
import { createAnthropicAdapter } from "./anthropic-adapter";
import { createDisabledAdapter } from "./disabled-adapter";
import { createFixtureAdapter } from "./fixture-adapter";
import { createAIService } from "./gateway";
import type { AIAdapter, AIRunRecorder, AIService } from "./types";

export * from "./types";
export { createAIService } from "./gateway";
export { createAnthropicAdapter, DEFAULT_EXTRACTION_MODEL } from "./anthropic-adapter";
export { createFixtureAdapter } from "./fixture-adapter";
export { createDisabledAdapter } from "./disabled-adapter";
export { NOTICE_EXTRACTION_PROMPT, TOPIC_MAPPING_PROMPT } from "./prompts";

const DEFAULT_FIXTURE_DIR = "./tests/fixtures/ai";

/** Is the school-notice upload offered? Only when a provider that can read notices is configured (ADR-0011). */
export function isNoticeUploadAvailable(): boolean {
  return env.AI_PROVIDER !== "disabled";
}

function adapterFromEnv(): AIAdapter {
  switch (env.AI_PROVIDER) {
    case "anthropic":
      // parseEnv guarantees the key exists for this provider. It is passed on and never logged.
      return createAnthropicAdapter({ apiKey: env.ANTHROPIC_API_KEY ?? "", model: env.AI_EXTRACTION_MODEL });
    case "fixture":
      return createFixtureAdapter({ dir: env.AI_FIXTURE_DIR ?? DEFAULT_FIXTURE_DIR });
    default:
      return createDisabledAdapter();
  }
}

const recordRun: AIRunRecorder = async (run) => {
  try {
    await insertAiRun(await getReadyDb(), run);
  } catch (error) {
    logger.warn({ err: error }, "Could not record an AI run");
  }
};

const globalForAI = globalThis as unknown as { __paperkakiAI?: AIService };

/** The AI service for this deployment. */
export function getAIService(): AIService {
  globalForAI.__paperkakiAI ??= createAIService({ adapter: adapterFromEnv(), record: recordRun });
  return globalForAI.__paperkakiAI;
}
