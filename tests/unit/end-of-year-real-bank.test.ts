import { describe, expect, it } from "vitest";
import { buildBlueprint, END_OF_YEAR_COMMON_FORMAT } from "@/domain/assessments";
import { selectQuestions } from "@/domain/papers";
import { BANK_CANDIDATES, BANK_TOPICS, topicsByShortCode } from "../helpers/question-bank";

// The school-style end-of-year paper (Sections A, B, C · 50 marks) must be possible from the
// real bank for the topic choices parents are likely to make, and repeatable without reusing
// the same questions.
const SCOPES: { name: string; codes: string[] }[] = [
  { name: "all eleven topics", codes: [] },
  { name: "number topics", codes: ["WN", "AS", "MD", "FR", "MN"] },
  { name: "measurement and time", codes: ["FR", "LM", "TM"] },
  { name: "money, area, bar graphs", codes: ["MN", "AR", "BG"] },
];

describe("common end-of-year format on the real question bank", () => {
  for (const scope of SCOPES) {
    it(`fills Sections A, B and C for ${scope.name}, twice with little repetition`, () => {
      const blueprint = buildBlueprint({
        curriculumVersionId: "SG-MOE-PRI-MATH-2021-UPD-2025-10",
        level: "P3",
        subject: "Mathematics",
        topics: scope.codes.length === 0 ? BANK_TOPICS : topicsByShortCode(scope.codes),
        settings: { totalMarks: 50, durationMinutes: 90, difficulty: "balanced" },
        format: END_OF_YEAR_COMMON_FORMAT,
      });
      const first = selectQuestions({ blueprint, candidates: BANK_CANDIDATES, seed: `${scope.name}:1` });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.report.totalMarks).toBe(50);
      expect(first.selection).toHaveLength(26);

      const used = first.selection.map((q) => q.questionId);
      const second = selectQuestions({
        blueprint,
        candidates: BANK_CANDIDATES,
        seed: `${scope.name}:2`,
        avoidQuestionIds: used,
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      const repeated = second.selection.filter((q) => used.includes(q.questionId)).length;
      expect(repeated).toBeLessThanOrEqual(8);
    });
  }
});
