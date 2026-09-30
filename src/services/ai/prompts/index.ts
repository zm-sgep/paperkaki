/**
 * Versioned prompt templates (ADR-0002). A prompt's id and version are stored with every run and every
 * extraction, so a result can be traced to the wording that produced it. Change the wording only
 * together with a new version string, and re-run `npm run eval:extraction`.
 */
export type PromptTemplate = { id: string; version: string; system: string; user: (values: Record<string, string>) => string };

export { NOTICE_EXTRACTION_PROMPT } from "./notice-extraction";
export { TOPIC_MAPPING_PROMPT } from "./topic-mapping";
