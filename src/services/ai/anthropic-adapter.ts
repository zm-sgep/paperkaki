import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MarkResponseModelSchema, ReadAnswersModelSchema, ReadPageNumbersModelSchema } from "@/schemas/marking-ai";
import { NoticeExtractionModelSchema, TopicMappingModelSchema } from "@/schemas/notice-extraction";
import {
  MARK_RESPONSE_PROMPT,
  NOTICE_EXTRACTION_PROMPT,
  READ_ANSWERS_PROMPT,
  READ_PAGE_NUMBERS_PROMPT,
  TOPIC_MAPPING_PROMPT,
  type PromptTemplate,
} from "./prompts";
import { AIError, type AIAdapter, type AdapterOutput, type ExtractSchoolNoticeInput } from "./types";

/**
 * The current default model for reading notices. Override with AI_EXTRACTION_MODEL. Chosen from the
 * claude-api skill's model table (2026-09); re-check it when models change.
 */
export const DEFAULT_EXTRACTION_MODEL = "claude-opus-5-5";

export const REQUEST_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 8_000;

/** The part of the SDK client this adapter uses, so tests can stand in for it. */
export type AnthropicLike = Pick<Anthropic, "beta">;

type Block = Anthropic.Beta.BetaContentBlockParam;

function fileBlock(file: { bytes: Uint8Array; mime: string }): Block {
  const data = Buffer.from(file.bytes).toString("base64");
  if (file.mime === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  if (file.mime === "image/jpeg" || file.mime === "image/png") {
    return { type: "image", source: { type: "base64", media_type: file.mime, data } };
  }
  throw new AIError("invalid_output", "This kind of file cannot be read.");
}

/** Transport problems and overloads are worth one more try; everything else is not. */
function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.APIConnectionError) return true; // includes timeouts
  return error instanceof Anthropic.APIError && typeof error.status === "number" && error.status >= 500;
}

function toAIError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new AIError("timeout", "The model took too long.", { cause: error });
  // Messages are not copied: an API error may quote the request. The status is enough to trace it.
  return new AIError("unavailable", "The model could not be reached.", { cause: error });
}

export function createAnthropicAdapter(options: { apiKey: string; model?: string | undefined; client?: AnthropicLike }): AIAdapter {
  const model = options.model ?? DEFAULT_EXTRACTION_MODEL;
  // Our own single retry replaces the SDK's default two.
  const client: AnthropicLike = options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 0 });

  async function ask(prompt: PromptTemplate, content: Block[], schema: Parameters<typeof zodOutputFormat>[0]): Promise<AdapterOutput> {
    const { type, schema: jsonSchema } = zodOutputFormat(schema);
    const send = () =>
      client.beta.messages.create(
        {
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: prompt.system,
          output_config: { effort: "medium", format: { type, schema: jsonSchema } },
          messages: [{ role: "user", content }],
        },
        { timeout: REQUEST_TIMEOUT_MS },
      );

    let response;
    try {
      try {
        response = await send();
      } catch (error) {
        if (!isRetryable(error)) throw error;
        response = await send();
      }
    } catch (error) {
      throw toAIError(error);
    }

    if (response.stop_reason === "refusal") throw new AIError("refused", "The model declined to read this file.");
    if (response.stop_reason === "max_tokens") throw new AIError("invalid_output", "The answer was cut off.");
    const answer = response.content.find((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text");
    if (!answer) throw new AIError("invalid_output", "The model gave no answer.");
    let output: unknown;
    try {
      output = JSON.parse(answer.text);
    } catch (error) {
      throw new AIError("invalid_output", "The answer was not JSON.", { cause: error });
    }
    return {
      output,
      model: response.model,
      promptVersion: prompt.version,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  return {
    provider: "anthropic",
    extractSchoolNotice(input: ExtractSchoolNoticeInput) {
      const content: Block[] = [
        ...input.files.map(fileBlock),
        { type: "text", text: NOTICE_EXTRACTION_PROMPT.user({ subject: input.subject, level: input.level, today: input.today }) },
      ];
      return ask(NOTICE_EXTRACTION_PROMPT, content, NoticeExtractionModelSchema);
    },
    mapTopics(input) {
      const text = TOPIC_MAPPING_PROMPT.user({
        subject: input.subject,
        level: input.level,
        topics: input.topics.map((topic) => `${topic.code}: ${topic.label}`).join("\n"),
        labels: input.labels.map((label) => `- ${label}`).join("\n"),
      });
      return ask(TOPIC_MAPPING_PROMPT, [{ type: "text", text }], TopicMappingModelSchema);
    },
    markResponse(input) {
      const scheme = [
        input.markingScheme.method === "exact_with_unit" ? "the answer and its unit must be right" : "the answer must be right",
        ...input.markingScheme.partialMarks.map((partial) => `${partial.marks} mark(s) for: ${partial.criterion}`),
      ].join("; ");
      const content: Block[] = [
        ...(input.working ? [fileBlock(input.working)] : []),
        {
          type: "text",
          text: MARK_RESPONSE_PROMPT.user({
            questionText: input.questionText,
            marks: String(input.marks),
            scheme,
            correctAnswer: input.correctAnswer,
            workedSolution: input.workedSolution,
            childAnswer: input.childAnswer ?? "(none)",
            hasPicture: input.working ? "yes" : "no",
          }),
        },
      ];
      return ask(MARK_RESPONSE_PROMPT, content, MarkResponseModelSchema);
    },
    readAnswers(input) {
      const layout = input.questions
        .map((question) => `${question.position}: ${question.kind === "mcq" ? "multiple choice" : question.kind}${question.unit ? ` (unit ${question.unit} is printed)` : ""}, ${question.marks} mark(s)`)
        .join("\n");
      const content: Block[] = [
        ...input.pages.map(fileBlock),
        { type: "text", text: READ_ANSWERS_PROMPT.user({ layout, pages: String(input.pages.length) }) },
      ];
      return ask(READ_ANSWERS_PROMPT, content, ReadAnswersModelSchema);
    },
    readPageNumbers(input) {
      const content: Block[] = [
        ...input.pages.map(fileBlock),
        { type: "text", text: READ_PAGE_NUMBERS_PROMPT.user({ pages: String(input.pages.length) }) },
      ];
      return ask(READ_PAGE_NUMBERS_PROMPT, content, ReadPageNumbersModelSchema);
    },
  };
}
