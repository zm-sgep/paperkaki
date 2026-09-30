import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decisionFromAiMarking } from "@/domain/marking";
import { markQuestion } from "@/domain/marking";
import { MarkResponseModelSchema, MarkResponseOutputSchema, ReadAnswersOutputSchema, ReadPageNumbersOutputSchema } from "@/schemas/marking-ai";
import { createFixtureAdapter } from "@/services/ai/fixture-adapter";
import { encodeFixturePage, readFixturePage } from "@/services/ai/fixture-pages";
import { createAIService } from "@/services/ai/gateway";
import { MARK_RESPONSE_PROMPT, READ_ANSWERS_PROMPT, READ_PAGE_NUMBERS_PROMPT } from "@/services/ai/prompts";
import type { AIRunRecord, MarkingInput } from "@/services/ai/types";

const good = { proposedScore: 2, maxScore: 3, confidence: "high", reason: "  Right method,\n but the last step slipped. ", errorType: "calculation", reviewRequired: false };

describe("AI marking output schema", () => {
  it("accepts a complete proposal and tidies the sentence", () => {
    const parsed = MarkResponseOutputSchema.parse(good);
    expect(parsed).toMatchObject({ proposedScore: 2, maxScore: 3, confidence: "high", errorType: "calculation", reviewRequired: false });
    expect(parsed.reason).toBe("Right method, but the last step slipped.");
  });

  it("reads a missing or null error type as none", () => {
    expect(MarkResponseOutputSchema.parse({ ...good, errorType: null }).errorType).toBeUndefined();
    const { errorType: _drop, ...without } = good;
    void _drop;
    expect(MarkResponseOutputSchema.parse(without).errorType).toBeUndefined();
  });

  it("refuses what cannot be trusted", () => {
    for (const bad of [
      { ...good, proposedScore: 4 },
      { ...good, proposedScore: -1 },
      { ...good, proposedScore: 1.5 },
      { ...good, confidence: 0.83 },
      { ...good, confidence: "medium" },
      { ...good, reason: "   " },
      { ...good, errorType: "sloppy" },
      { ...good, reviewRequired: "no" },
      { proposedScore: 1, maxScore: 3 },
    ]) {
      expect(MarkResponseOutputSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("keeps the provider's schema in step with the strict one", () => {
    expect(MarkResponseModelSchema.safeParse({ ...good, errorType: null }).success).toBe(true);
    expect(Object.keys(MarkResponseModelSchema.shape).sort()).toEqual(["confidence", "errorType", "maxScore", "proposedScore", "reason", "reviewRequired"]);
  });

  it("checks what was read from a photographed paper", () => {
    expect(ReadAnswersOutputSchema.parse({ answers: [{ position: 1, answerText: " B ", confident: true, page: null, hasWorking: null }] }).answers[0]).toEqual({
      position: 1,
      answerText: "B",
      confident: true,
    });
    expect(ReadAnswersOutputSchema.safeParse({ answers: [{ position: 0, answerText: "1", confident: true }] }).success).toBe(false);
    expect(ReadAnswersOutputSchema.safeParse({ answers: [{ position: 1, answerText: "1" }] }).success).toBe(false);
    expect(ReadPageNumbersOutputSchema.parse({ pages: [{ pageNumber: 3 }, { pageNumber: null }] }).pages).toHaveLength(2);
    expect(ReadPageNumbersOutputSchema.safeParse({ pages: [{ pageNumber: 0 }] }).success).toBe(false);
  });

  it("versions every prompt", () => {
    for (const prompt of [MARK_RESPONSE_PROMPT, READ_ANSWERS_PROMPT, READ_PAGE_NUMBERS_PROMPT]) {
      expect(prompt.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
      expect(prompt.system.toLowerCase()).not.toContain("points");
    }
  });
});

describe("what an AI proposal becomes", () => {
  const question = { marks: 3 };
  const output = (over: Record<string, unknown> = {}) => MarkResponseOutputSchema.parse({ ...good, ...over });

  it("settles only a clear, high-confidence mark", () => {
    expect(decisionFromAiMarking(question, output())).toMatchObject({ score: 2, maxScore: 3, method: "ai_assisted", confidence: "high", reviewRequired: false });
  });

  it("sends low confidence, or a request for a person, to the parent with the proposal kept", () => {
    const low = decisionFromAiMarking(question, output({ confidence: "low", reviewRequired: true }));
    expect(low).toMatchObject({ score: 2, confidence: "low", reviewRequired: true, childMessage: "We need a quick check on this one." });
    expect(decisionFromAiMarking(question, output({ reviewRequired: true })).reviewRequired).toBe(true);
    expect(decisionFromAiMarking(question, output({ confidence: "low" })).reviewRequired).toBe(true);
  });

  it("does not trust a mark for a different total", () => {
    expect(decisionFromAiMarking({ marks: 4 }, output()).reviewRequired).toBe(true);
    expect(decisionFromAiMarking({ marks: 4 }, output()).maxScore).toBe(4);
  });

  it("never lets the AI change a decision made by rule to something the rules refuse to make", () => {
    // The rule-based marker still asks for a person when a photographed answer could not be read.
    const q = { id: "q", questionType: "number" as const, marks: 3, answer: { kind: "number" as const, value: "12" }, markingScheme: { method: "exact" as const } };
    expect(markQuestion(q, { typedAnswer: "12", answerUnclear: true })).toMatchObject({ method: "needs_review", reviewRequired: true });
    expect(markQuestion(q, { typedAnswer: "12" })).toMatchObject({ method: "deterministic", score: 3 });
  });
});

async function fixtureDir(files: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pk-marking-"));
  for (const [name, value] of Object.entries(files)) await writeFile(path.join(dir, name), JSON.stringify(value));
  return dir;
}

const markingInput: MarkingInput = {
  questionText: "A ribbon is 3 m long. Tom cuts 85 cm. How much is left?",
  marks: 3,
  markingScheme: { method: "exact_with_unit", partialMarks: [{ marks: 1, criterion: "Converts 3 m to 300 cm" }] },
  correctAnswer: "215 cm",
  workedSolution: "300 - 85 = 215",
  childAnswer: "225",
};

describe("AI service marking, reading and page numbers through the fixture provider", () => {
  it("returns the recorded proposal, capped at the question's marks, and records the run without child data", async () => {
    const dir = await fixtureDir({ "marking-responses.json": { "*": { proposedScore: 9, confidence: "low", reason: "A slip in the subtraction.", errorType: "calculation", reviewRequired: true } } });
    const runs: AIRunRecord[] = [];
    const ai = createAIService({ adapter: createFixtureAdapter({ dir }), record: async (run) => void runs.push(run) });
    const result = await ai.markResponse(markingInput);
    expect(result).toMatchObject({ proposedScore: 3, maxScore: 3, confidence: "low", reviewRequired: true });
    expect(runs[0]).toMatchObject({ task: "mark_response", provider: "fixture", status: "succeeded", promptVersion: MARK_RESPONSE_PROMPT.version });
    expect(JSON.stringify(runs[0])).not.toContain("ribbon");
    expect(JSON.stringify(runs[0])).not.toContain("225");
  });

  it("has no answer for a question nobody recorded, like a marker that cannot be reached", async () => {
    const ai = createAIService({ adapter: createFixtureAdapter({ dir: await fixtureDir({}) }) });
    await expect(ai.markResponse(markingInput)).rejects.toMatchObject({ code: "no_fixture" });
  });

  it("reads the answers stored in synthetic pages, spreading questions over the pages, and drops questions that are not on the paper", async () => {
    const ai = createAIService({ adapter: createFixtureAdapter({ dir: await fixtureDir({}) }) });
    const pages = [
      { bytes: encodeFixturePage({ page: 1, defaults: { mcq: "B", number: "12" }, answers: { "3": { answerText: "7", confident: false, hasWorking: true } } }), mime: "image/png" },
      { bytes: encodeFixturePage({ page: 2 }), mime: "image/png" },
    ];
    const questions = [
      { position: 1, kind: "mcq" as const, marks: 1 },
      { position: 2, kind: "number" as const, marks: 2 },
      { position: 3, kind: "number" as const, marks: 3 },
      { position: 4, kind: "fraction" as const, marks: 3 },
    ];
    const read = await ai.readAnswers({ pages, sha256: "x", questions });
    expect(read.answers.map((a) => [a.position, a.answerText, a.confident, a.page])).toEqual([
      [1, "B", true, 1],
      [2, "12", true, 1],
      [3, "7", false, 2],
      [4, "", true, 2],
    ]);
    expect(read.answers[2]?.hasWorking).toBe(true);
  });

  it("reads footer page numbers, one entry per photo, null when the footer is not readable", async () => {
    const ai = createAIService({ adapter: createFixtureAdapter({ dir: await fixtureDir({}) }) });
    const read = await ai.readPageNumbers({
      pages: [
        { bytes: encodeFixturePage({ page: 2 }), mime: "image/png" },
        { bytes: encodeFixturePage({}), mime: "image/png" },
        { bytes: new Uint8Array([1, 2, 3]), mime: "image/png" },
      ],
      sha256: "x",
    });
    expect(read.pages).toEqual([{ pageNumber: 2 }, { pageNumber: null }, { pageNumber: null }]);
  });

  it("stores the fixture in a real PNG that other software can open, and reads nothing from any other image", () => {
    const bytes = encodeFixturePage({ page: 5, answers: { "1": { answerText: "A" } } });
    expect(Buffer.from(bytes).subarray(1, 4).toString()).toBe("PNG");
    expect(readFixturePage(bytes)).toMatchObject({ page: 5, answers: { "1": { answerText: "A" } } });
    expect(readFixturePage(new Uint8Array([0, 1, 2]))).toBeNull();
  });
});
