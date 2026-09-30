import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import aliasFile from "../../content/curriculum/topic-aliases.json";
import curriculum from "../../content/curriculum/p3-maths-moe-2025-10.json";
import expectedFile from "../../evals/scope-extraction/expected.json";
import { scoreReview, type Expected } from "../../evals/scope-extraction/score";
import { buildAliasIndex, buildNoticeReview, pickMathematics } from "@/domain/assessments/notice";
import { NoticeExtractionSchema, TopicAliasTableSchema } from "@/schemas/notice-extraction";

const index = buildAliasIndex(TopicAliasTableSchema.parse(aliasFile).aliases);
const codes = new Set(curriculum.domains.flatMap((domain) => domain.topics.map((topic) => topic.code)));
const recorded = NoticeExtractionSchema.parse(JSON.parse(readFileSync("tests/fixtures/notices/p3-eoy-sample.extraction.json", "utf8")));

function reviewOf(extraction = recorded) {
  const found = pickMathematics(extraction);
  if (!found) throw new Error("no maths");
  return buildNoticeReview({ ...found, index, knownCodes: codes, guesses: [] });
}

describe("extraction eval scoring", () => {
  it("gives full marks to the recorded reading of each sample notice, so expected.json matches the fixtures", () => {
    for (const item of expectedFile.cases) {
      const scores = scoreReview(reviewOf(), item.expected as Expected);
      for (const score of scores) expect(score.correct, `${item.id}: ${score.field}`).toBe(score.total);
    }
  });

  it("marks what is wrong, field by field", () => {
    const wrong = NoticeExtractionSchema.parse({
      subjects: [
        {
          subject: "Mathematics",
          assessmentType: "wa2",
          date: "2026-10-28",
          durationMinutes: 60,
          topics: [
            { schoolLabel: "Fractions", confident: true },
            { schoolLabel: "Angles", confident: true },
          ],
          format: { sections: [{ label: "Section A", kind: "short", questionCount: 6, totalMarks: 12, confident: true }] },
          notes: [],
        },
      ],
    });
    const scores = new Map(scoreReview(reviewOf(wrong), expectedFile.cases[0]?.expected as Expected).map((score) => [score.field, score]));
    expect(scores.get("date")?.correct).toBe(0);
    expect(scores.get("duration")?.correct).toBe(0);
    expect(scores.get("assessment type")?.correct).toBe(0);
    expect(scores.get("topics found")).toMatchObject({ correct: 2, total: 11 });
    expect(scores.get("format: parts named")).toMatchObject({ correct: 1, total: 3 });
    expect(scores.get("format: question type")).toMatchObject({ correct: 0, total: 3 });
    expect(scores.get("format: question count")).toMatchObject({ correct: 1, total: 3 });
    expect(scores.get("notes")?.correct).toBe(0);
  });
});
