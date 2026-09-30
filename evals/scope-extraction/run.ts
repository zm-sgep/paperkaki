import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildAliasIndex, buildNoticeReview, pickMathematics, unmatchedWordings, type NoticeReview } from "../../src/domain/assessments/notice";
import { NoticeExtractionSchema, TopicAliasTableSchema } from "../../src/schemas/notice-extraction";
import { createAnthropicAdapter, DEFAULT_EXTRACTION_MODEL } from "../../src/services/ai/anthropic-adapter";
import { createAIService } from "../../src/services/ai/gateway";
import { scoreReview, type Expected } from "./score";

/**
 * Scope-extraction eval: reads the invented sample notices with the real model and scores the result
 * against expected.json. It costs money and needs a key, so it runs only when AI_PROVIDER=anthropic and
 * ANTHROPIC_API_KEY are both set, and it is not part of CI or `npm run check`.
 *
 *   AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... npm run eval:extraction
 */

const root = process.cwd();
const here = path.join(root, "evals/scope-extraction");

async function main(): Promise<void> {
  if (process.env.AI_PROVIDER !== "anthropic" || !process.env.ANTHROPIC_API_KEY) {
    console.log("Skipped: set AI_PROVIDER=anthropic and ANTHROPIC_API_KEY to run this eval against the real model.");
    return;
  }
  const model = process.env.AI_EXTRACTION_MODEL || DEFAULT_EXTRACTION_MODEL;
  const ai = createAIService({ adapter: createAnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY, model }) });

  const index = buildAliasIndex(TopicAliasTableSchema.parse(JSON.parse(readFileSync(path.join(root, "content/curriculum/topic-aliases.json"), "utf8"))).aliases);
  const curriculum = JSON.parse(readFileSync(path.join(root, "content/curriculum/p3-maths-moe-2025-10.json"), "utf8")) as {
    domains: { topics: { code: string; parentLabel: string }[] }[];
  };
  const topics = curriculum.domains.flatMap((domain) => domain.topics.map((topic) => ({ code: topic.code, label: topic.parentLabel })));
  const knownCodes = new Set(topics.map((topic) => topic.code));

  const file = JSON.parse(readFileSync(path.join(here, "expected.json"), "utf8")) as { cases: { id: string; files: string[]; expected: Expected }[] };
  const totals = new Map<string, { correct: number; total: number }>();
  const rows: string[][] = [["case", "field", "score"]];

  for (const item of file.cases) {
    const files = item.files.map((name) => ({ bytes: new Uint8Array(readFileSync(path.join(root, name))), mime: name.endsWith(".pdf") ? "application/pdf" : "image/png" }));
    const hash = createHash("sha256");
    for (const f of files) hash.update(f.bytes);
    let review: NoticeReview | null = null;
    try {
      const extraction = NoticeExtractionSchema.parse(
        await ai.extractSchoolNotice({ files, sha256: hash.digest("hex"), subject: "Mathematics", level: "P3", today: new Date().toISOString().slice(0, 10) }),
      );
      const found = pickMathematics(extraction);
      if (found) {
        const unmatched = unmatchedWordings(found.subject, index);
        const guesses = unmatched.length > 0 ? (await ai.mapTopics({ labels: unmatched, topics, subject: "Mathematics", level: "P3" })).mappings : [];
        review = buildNoticeReview({ ...found, index, knownCodes, guesses });
      }
    } catch (error) {
      rows.push([item.id, "(the call failed)", error instanceof Error ? error.message : "unknown"]);
    }
    if (!review) {
      rows.push([item.id, "(no reading)", "0%"]);
      continue;
    }
    for (const score of scoreReview(review, item.expected)) {
      rows.push([item.id, score.field, `${score.correct}/${score.total}`]);
      const sum = totals.get(score.field) ?? { correct: 0, total: 0 };
      totals.set(score.field, { correct: sum.correct + score.correct, total: sum.total + score.total });
    }
  }

  const widths = [0, 1, 2].map((i) => Math.max(...rows.map((row) => (row[i] ?? "").length)));
  for (const row of rows) console.log(row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  "));
  console.log(`\nModel: ${model}`);
  console.log("Overall by field:");
  for (const [field, sum] of totals) console.log(`  ${field.padEnd(30)} ${sum.correct}/${sum.total} (${sum.total === 0 ? 0 : Math.round((100 * sum.correct) / sum.total)}%)`);
}

void main();
