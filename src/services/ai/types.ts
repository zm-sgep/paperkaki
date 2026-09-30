import type { NoticeExtraction, TopicMapping } from "@/schemas/notice-extraction";

/**
 * The central AI gateway contract (ADR-0002, docs/ARCHITECTURE.md section 14). Every model call in
 * the product goes through an `AIService`; features never import a provider SDK. Outputs are
 * checked against zod schemas before they leave the gateway.
 */

export type AIProvider = "disabled" | "fixture" | "anthropic";

/** A page of the notice as the parent uploaded it. Only ever held in memory while a call runs. */
export type NoticeFile = { bytes: Uint8Array; mime: string };

export type ExtractSchoolNoticeInput = {
  files: readonly NoticeFile[];
  /** SHA-256 (hex) of the file bytes, in order. The fixture provider finds its recorded result by it. */
  sha256: string;
  subject: string;
  level: string;
  /** Today in Singapore, "YYYY-MM-DD". Lets the model place a date written without a year. */
  today: string;
};

export type TopicChoice = { code: string; label: string };

export type MapTopicsInput = {
  /** School wordings the alias list did not recognise. */
  labels: readonly string[];
  /** The closed list the answer must come from. */
  topics: readonly TopicChoice[];
  subject: string;
  level: string;
};

/** Later milestones. Typed placeholders so callers can already depend on the shape of the service. */
export type QuestionGenerationInput = Record<string, unknown>;
export type QuestionDraft = Record<string, unknown>;
export type QuestionValidationInput = Record<string, unknown>;
export type QuestionValidationResult = Record<string, unknown>;
export type MarkingInput = Record<string, unknown>;
export type MarkingResult = Record<string, unknown>;
export type DiagnosisInput = Record<string, unknown>;
export type DiagnosisResult = Record<string, unknown>;

export interface AIService {
  readonly provider: AIProvider;
  extractSchoolNotice(input: ExtractSchoolNoticeInput): Promise<NoticeExtraction>;
  mapTopics(input: MapTopicsInput): Promise<TopicMapping>;
  generateQuestion(input: QuestionGenerationInput): Promise<QuestionDraft>;
  validateQuestion(input: QuestionValidationInput): Promise<QuestionValidationResult>;
  markResponse(input: MarkingInput): Promise<MarkingResult>;
  diagnoseError(input: DiagnosisInput): Promise<DiagnosisResult>;
}

export type AITask = "extract_school_notice" | "map_topics";

/** Why a call failed, in words the application can turn into a calm message. */
export type AIErrorCode =
  /** AI_PROVIDER=disabled. */
  | "disabled"
  /** The provider could not be reached, refused the key, or is overloaded. */
  | "unavailable"
  | "timeout"
  /** The answer did not match the schema, was cut off, or the provider declined to read the file. */
  | "invalid_output"
  | "refused"
  /** The fixture provider has no recorded result for this file. */
  | "no_fixture";

export class AIError extends Error {
  readonly code: AIErrorCode;
  constructor(code: AIErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AIError";
    this.code = code;
  }
}

/** What an adapter hands back: the unchecked JSON answer plus what the call used. */
export type AdapterOutput = {
  output: unknown;
  model: string;
  promptVersion: string;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
};

/** A provider behind the gateway. Adapters return raw JSON; the gateway validates it. */
export interface AIAdapter {
  readonly provider: AIProvider;
  extractSchoolNotice(input: ExtractSchoolNoticeInput): Promise<AdapterOutput>;
  mapTopics(input: MapTopicsInput): Promise<AdapterOutput>;
}

/** One row for the `ai_runs` table: what ran and how it went. Never file contents or child data. */
export type AIRunRecord = {
  task: AITask;
  provider: AIProvider;
  model: string;
  promptVersion: string;
  status: "succeeded" | "failed";
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: AIErrorCode | "internal" | null;
};

export type AIRunRecorder = (run: AIRunRecord) => Promise<void>;
