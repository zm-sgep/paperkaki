import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { createAnthropicAdapter, REQUEST_TIMEOUT_MS, type AnthropicLike } from "@/services/ai/anthropic-adapter";
import { createDisabledAdapter } from "@/services/ai/disabled-adapter";
import { createFixtureAdapter } from "@/services/ai/fixture-adapter";
import { createAIService } from "@/services/ai/gateway";
import { AIError, type AIRunRecord, type ExtractSchoolNoticeInput } from "@/services/ai/types";

const HASH = "a".repeat(64);
const input: ExtractSchoolNoticeInput = {
  files: [{ bytes: new Uint8Array([37, 80, 68, 70]), mime: "application/pdf" }],
  sha256: HASH,
  subject: "Mathematics",
  level: "P3",
  today: "2026-09-29",
};
const extraction = { subjects: [{ subject: "Mathematics", topics: [{ schoolLabel: "Money", confident: true }], notes: [] }] };

async function fixtureDir(files: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pk-fixtures-"));
  for (const [name, value] of Object.entries(files)) await writeFile(path.join(dir, name), JSON.stringify(value));
  return dir;
}

describe("AI gateway", () => {
  it("returns a validated result from the fixture provider and records a run without file contents", async () => {
    const dir = await fixtureDir({ [`${HASH}.json`]: extraction });
    const runs: AIRunRecord[] = [];
    const ai = createAIService({ adapter: createFixtureAdapter({ dir }), record: async (run) => void runs.push(run) });
    const result = await ai.extractSchoolNotice(input);
    expect(result.subjects[0]?.topics[0]?.schoolLabel).toBe("Money");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ task: "extract_school_notice", provider: "fixture", status: "succeeded", errorCode: null });
    expect(Object.keys(runs[0] ?? {}).sort()).toEqual(
      ["durationMs", "errorCode", "inputTokens", "model", "outputTokens", "promptVersion", "provider", "status", "task"],
    );
  });

  it("treats a file with no recorded result as unreadable and records the failure", async () => {
    const runs: AIRunRecord[] = [];
    const ai = createAIService({
      adapter: createFixtureAdapter({ dir: await fixtureDir({}) }),
      record: async (run) => void runs.push(run),
    });
    await expect(ai.extractSchoolNotice(input)).rejects.toMatchObject({ code: "no_fixture" });
    expect(runs[0]).toMatchObject({ status: "failed", errorCode: "no_fixture" });
  });

  it("rejects an answer that does not match the schema", async () => {
    const dir = await fixtureDir({ [`${HASH}.json`]: { subjects: [{ subject: "Mathematics", date: "27 Oct", topics: [], notes: [] }] } });
    const ai = createAIService({ adapter: createFixtureAdapter({ dir }) });
    await expect(ai.extractSchoolNotice(input)).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("never lets a model-invented topic code through mapTopics", async () => {
    const dir = await fixtureDir({ "topic-mapping.json": { "Shapes and Solids": ["P3-MG-AN", "P3-XX-INVENTED"] } });
    const ai = createAIService({ adapter: createFixtureAdapter({ dir }) });
    const result = await ai.mapTopics({
      labels: ["Shapes and Solids", "Unknown thing"],
      topics: [{ code: "P3-MG-AN", label: "Angles" }],
      subject: "Mathematics",
      level: "P3",
    });
    expect(result.mappings).toEqual([
      { schoolLabel: "Shapes and Solids", topicCodes: ["P3-MG-AN"] },
      { schoolLabel: "Unknown thing", topicCodes: [] },
    ]);
  });

  it("does nothing when disabled, and the later methods are not implemented", async () => {
    const ai = createAIService({ adapter: createDisabledAdapter() });
    await expect(ai.extractSchoolNotice(input)).rejects.toMatchObject({ code: "disabled" });
    await expect(ai.generateQuestion({})).rejects.toThrow("not implemented");
    await expect(ai.markResponse({})).rejects.toThrow("not implemented");
  });

  it("does not let a failing recorder fail the call", async () => {
    const dir = await fixtureDir({ [`${HASH}.json`]: extraction });
    const ai = createAIService({
      adapter: createFixtureAdapter({ dir }),
      record: async () => {
        throw new Error("db down");
      },
    });
    await expect(ai.extractSchoolNotice(input)).resolves.toBeDefined();
  });
});

function fakeClient(replies: Array<unknown | Error>): { client: AnthropicLike; create: ReturnType<typeof vi.fn> } {
  const queue = [...replies];
  const create = vi.fn(async () => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  return { client: { beta: { messages: { create } } } as unknown as AnthropicLike, create };
}

const okReply = (body: unknown, extra: Record<string, unknown> = {}) => ({
  stop_reason: "end_turn",
  model: "claude-opus-5-5",
  content: [{ type: "text", text: JSON.stringify(body) }],
  usage: { input_tokens: 1200, output_tokens: 300 },
  ...extra,
});

describe("Anthropic adapter", () => {
  it("sends the PDF as a document, asks for structured JSON with a 60 s timeout, and reports token counts", async () => {
    const { client, create } = fakeClient([okReply(extraction)]);
    const runs: AIRunRecord[] = [];
    const ai = createAIService({ adapter: createAnthropicAdapter({ apiKey: "test-key", client }), record: async (r) => void runs.push(r) });
    const result = await ai.extractSchoolNotice(input);
    expect(result.subjects).toHaveLength(1);

    const [body, options] = create.mock.calls[0] as unknown as [Record<string, unknown>, { timeout: number }];
    expect(body.model).toBe("claude-opus-5-5");
    expect(options.timeout).toBe(REQUEST_TIMEOUT_MS);
    expect(REQUEST_TIMEOUT_MS).toBe(60_000);
    expect((body.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    const content = (body.messages as Array<{ content: Array<{ type: string; source?: { media_type: string } }> }>)[0]?.content ?? [];
    expect(content[0]?.type).toBe("document");
    expect(content[0]?.source?.media_type).toBe("application/pdf");
    expect(content.at(-1)?.type).toBe("text");
    expect(runs[0]).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5", inputTokens: 1200, outputTokens: 300 });
    expect(runs[0]?.promptVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("sends photos as images and honours AI_EXTRACTION_MODEL", async () => {
    const { client, create } = fakeClient([okReply(extraction)]);
    const adapter = createAnthropicAdapter({ apiKey: "test-key", model: "some-other-model", client });
    await adapter.extractSchoolNotice({ ...input, files: [{ bytes: new Uint8Array([1]), mime: "image/png" }, { bytes: new Uint8Array([2]), mime: "image/jpeg" }] });
    const [body] = create.mock.calls[0] as unknown as [{ model: string; messages: Array<{ content: Array<{ type: string }> }> }];
    expect(body.model).toBe("some-other-model");
    expect(body.messages[0]?.content.map((block) => block.type)).toEqual(["image", "image", "text"]);
  });

  it("retries once on a transport error, then succeeds", async () => {
    const { client, create } = fakeClient([new Anthropic.APIConnectionError({ message: "socket hang up" }), okReply(extraction)]);
    const adapter = createAnthropicAdapter({ apiKey: "test-key", client });
    await expect(adapter.extractSchoolNotice(input)).resolves.toMatchObject({ model: "claude-opus-5-5" });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("gives up after the one retry and reports a timeout as a timeout", async () => {
    const { client, create } = fakeClient([new Anthropic.APIConnectionTimeoutError(), new Anthropic.APIConnectionTimeoutError()]);
    const adapter = createAIService({ adapter: createAnthropicAdapter({ apiKey: "test-key", client }) });
    await expect(adapter.extractSchoolNotice(input)).rejects.toMatchObject({ code: "timeout" });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not retry a rejected key, and never puts the key in an error", async () => {
    const error = new Anthropic.AuthenticationError(401, { type: "error", error: { type: "authentication_error", message: "bad key sk-secret" } }, "bad key sk-secret", new Headers());
    const { client, create } = fakeClient([error]);
    const ai = createAIService({ adapter: createAnthropicAdapter({ apiKey: "sk-secret", client }) });
    const failure = await ai.extractSchoolNotice(input).catch((caught: unknown) => caught);
    expect(failure).toBeInstanceOf(AIError);
    expect((failure as AIError).code).toBe("unavailable");
    expect((failure as AIError).message).not.toContain("sk-secret");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("maps a refusal, a cut-off answer and non-JSON to gateway errors", async () => {
    const cases: Array<[unknown, string]> = [
      [okReply({}, { stop_reason: "refusal", content: [] }), "refused"],
      [okReply(extraction, { stop_reason: "max_tokens" }), "invalid_output"],
      [okReply(extraction, { content: [{ type: "text", text: "Sure! Here is the answer" }] }), "invalid_output"],
      [okReply({ subjects: "none" }), "invalid_output"],
    ];
    for (const [reply, code] of cases) {
      const { client } = fakeClient([reply]);
      const ai = createAIService({ adapter: createAnthropicAdapter({ apiKey: "test-key", client }) });
      await expect(ai.extractSchoolNotice(input)).rejects.toMatchObject({ code });
    }
  });
});
