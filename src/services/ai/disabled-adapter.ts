import { AIError, type AIAdapter } from "./types";

/** The default: no model is called. Upload is not offered while this is the provider (ADR-0011). */
export function createDisabledAdapter(): AIAdapter {
  const off = (): never => {
    throw new AIError("disabled", "Reading school notices is switched off.");
  };
  return { provider: "disabled", extractSchoolNotice: async () => off(), mapTopics: async () => off() };
}
