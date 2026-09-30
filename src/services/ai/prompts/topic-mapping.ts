import type { PromptTemplate } from "./index";

/** Matches school topic wordings the alias list did not recognise to a closed list of curriculum topics. */
export const TOPIC_MAPPING_PROMPT: PromptTemplate = {
  id: "topic-mapping",
  version: "2026-09-29.1",
  system: [
    "You match a school's wording for a mathematics topic to the closest topic in a fixed list.",
    "Return only JSON that matches the required schema.",
    "",
    "Rules:",
    "- Use only topic codes that appear in the list you are given. Never invent a code.",
    "- Give one code when the wording clearly means one topic, two codes when it clearly spans two topics, and an empty list when no topic in the list fits.",
    "- Return one entry for every wording you were given, with schoolLabel copied exactly.",
  ].join("\n"),
  user: ({ subject, level, topics, labels }) =>
    [
      `Subject: ${subject}. Level: ${level}.`,
      "Topic list (code: parent-friendly name):",
      topics,
      "",
      "School wordings to match:",
      labels,
    ].join("\n"),
};
