import { readFile } from "node:fs/promises";
import path from "node:path";
import { AIError, type AIAdapter } from "./types";
import { NOTICE_EXTRACTION_PROMPT, TOPIC_MAPPING_PROMPT } from "./prompts";

/**
 * Deterministic provider for tests and browser tests. It never calls a model: an extraction is a
 * recorded JSON answer stored as `<sha256 of the file>.json`, and topic mapping reads an optional
 * `topic-mapping.json` (school wording to topic codes). A file with no recorded answer behaves like
 * a page the model could not read.
 */
export function createFixtureAdapter(options: { dir: string }): AIAdapter {
  const dir = path.resolve(options.dir);

  async function readJson(name: string): Promise<unknown | null> {
    try {
      return JSON.parse(await readFile(/*turbopackIgnore: true*/ path.join(dir, name), "utf8")) as unknown;
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
      throw new AIError("invalid_output", "A recorded fixture could not be read.", { cause: error });
    }
  }

  return {
    provider: "fixture",
    async extractSchoolNotice(input) {
      if (!/^[0-9a-f]{64}$/.test(input.sha256)) throw new AIError("no_fixture", "No recorded result for this file.");
      const output = await readJson(`${input.sha256}.json`);
      if (output === null) throw new AIError("no_fixture", "No recorded result for this file.");
      return { output, model: "fixture", promptVersion: NOTICE_EXTRACTION_PROMPT.version };
    },
    async mapTopics(input) {
      const table = await readJson("topic-mapping.json");
      const known = typeof table === "object" && table !== null ? (table as Record<string, unknown>) : {};
      const mappings = input.labels.map((schoolLabel) => {
        const codes = known[schoolLabel];
        return { schoolLabel, topicCodes: Array.isArray(codes) ? codes.filter((c): c is string => typeof c === "string") : [] };
      });
      return { output: { mappings }, model: "fixture", promptVersion: TOPIC_MAPPING_PROMPT.version };
    },
  };
}
