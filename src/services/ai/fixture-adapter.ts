import { readFile } from "node:fs/promises";
import path from "node:path";
import { AIError, type AIAdapter } from "./types";
import { readFixturePage, type FixturePage } from "./fixture-pages";
import { MARK_RESPONSE_PROMPT, NOTICE_EXTRACTION_PROMPT, READ_ANSWERS_PROMPT, READ_PAGE_NUMBERS_PROMPT, TOPIC_MAPPING_PROMPT } from "./prompts";

/**
 * Deterministic provider for tests and browser tests. It never calls a model: an extraction is a
 * recorded JSON answer stored as `<sha256 of the file>.json`, and topic mapping reads an optional
 * `topic-mapping.json` (school wording to topic codes). A file with no recorded answer behaves like
 * a page the model could not read.
 *
 * Marking reads an optional `marking-responses.json`: the recorded marker's answers by question text
 * (exact match of the question's plain text, or "*" for any question). A question with no recorded
 * answer behaves like a marker that could not be reached. Reading a photographed paper reads the
 * answers stored inside synthetic fixture pages (see fixture-pages.ts).
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

  function pagesOf(input: { pages: readonly { bytes: Uint8Array }[] }): (FixturePage | null)[] {
    return input.pages.map((page) => readFixturePage(page.bytes));
  }

  return {
    provider: "fixture",
    async markResponse(input) {
      const table = await readJson("marking-responses.json");
      const known = typeof table === "object" && table !== null ? (table as Record<string, unknown>) : {};
      const recorded = known[input.questionText] ?? known["*"];
      if (typeof recorded !== "object" || recorded === null) throw new AIError("no_fixture", "No recorded marking for this question.");
      // A recording is made once for any question: the total is always this question's, and the mark can never pass it.
      const entry = recorded as { proposedScore?: unknown };
      const proposedScore = typeof entry.proposedScore === "number" ? Math.min(entry.proposedScore, input.marks) : 0;
      return { output: { ...recorded, maxScore: input.marks, proposedScore }, model: "fixture", promptVersion: MARK_RESPONSE_PROMPT.version };
    },
    async readAnswers(input) {
      const fixtures = pagesOf(input);
      if (fixtures.every((fixture) => fixture === null)) throw new AIError("no_fixture", "No recorded reading for these pages.");
      const defaults = fixtures.find((fixture) => fixture?.defaults)?.defaults ?? {};
      const perPage = Math.max(1, Math.ceil(input.questions.length / Math.max(1, input.pages.length)));
      const answers = input.questions.map((question, index) => {
        const explicit = fixtures.map((fixture) => fixture?.answers?.[String(question.position)]).find((answer) => answer !== undefined);
        const page = Math.min(input.pages.length, Math.floor(index / perPage) + 1);
        const answerText = explicit?.answerText ?? defaults[question.kind] ?? "";
        return { position: question.position, answerText, confident: explicit?.confident ?? true, page, hasWorking: explicit?.hasWorking ?? false };
      });
      return { output: { answers }, model: "fixture", promptVersion: READ_ANSWERS_PROMPT.version };
    },
    async readPageNumbers(input) {
      const pages = pagesOf(input).map((fixture) => ({ pageNumber: typeof fixture?.page === "number" ? fixture.page : null }));
      return { output: { pages }, model: "fixture", promptVersion: READ_PAGE_NUMBERS_PROMPT.version };
    },
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
