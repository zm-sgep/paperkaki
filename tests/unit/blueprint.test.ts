import { describe, expect, it } from "vitest";
import {
  DIFFICULTY_PRESETS,
  allocateMarks,
  buildBlueprint,
  type BlueprintInput,
  type DifficultyLevel,
} from "@/domain/assessments";

function input(topicCount: number, totalMarks: number, difficulty: DifficultyLevel = "balanced"): BlueprintInput {
  return {
    curriculumVersionId: "cv-test",
    level: "P3",
    subject: "Mathematics",
    topics: Array.from({ length: topicCount }, (_, i) => ({
      topicId: `T${i + 1}`,
      label: `Topic ${i + 1}`,
      outcomeIds: [`T${i + 1}-01`, `T${i + 1}-02`],
    })),
    settings: { totalMarks, durationMinutes: 45, difficulty },
  };
}

describe("buildBlueprint", () => {
  it("splits 40 marks over 3 topics as 14/13/13 with section A 4/3/3", () => {
    const bp = buildBlueprint(input(3, 40));
    expect(bp.scope.map((s) => s.targetMarks)).toEqual([14, 13, 13]);
    expect(bp.scope.map((s) => s.sectionMarks.A)).toEqual([4, 3, 3]);
    expect(bp.scope.map((s) => s.sectionMarks.B)).toEqual([10, 10, 10]);
    expect(bp.sections.map((s) => [s.code, s.marks])).toEqual([
      ["A", 10],
      ["B", 30],
    ]);
  });

  it("uses 25% for section A, rounding half up", () => {
    const a = (total: number) => buildBlueprint(input(1, total)).sections[0]?.marks;
    expect(a(40)).toBe(10);
    expect(a(20)).toBe(5);
    expect(a(30)).toBe(8);
    expect(a(10)).toBe(3);
    expect(a(15)).toBe(4);
    expect(a(60)).toBe(15);
  });

  it("names the two sections and their question types", () => {
    const bp = buildBlueprint(input(2, 30));
    expect(bp.sections[0]).toMatchObject({ code: "A", title: "Multiple choice", types: ["mcq"] });
    expect(bp.sections[1]).toMatchObject({
      code: "B",
      title: "Short answer",
      types: ["number", "fraction", "text"],
    });
  });

  it("carries header fields, scope in parent order, and the no-repeat rule", () => {
    const bp = buildBlueprint(input(3, 40));
    expect(bp).toMatchObject({
      curriculumVersionId: "cv-test",
      level: "P3",
      subject: "Mathematics",
      totalMarks: 40,
      durationMinutes: 45,
      rules: { noRepeatFamily: true },
    });
    expect(bp.scope.map((s) => s.topicId)).toEqual(["T1", "T2", "T3"]);
    expect(bp.scope[0]).toMatchObject({ label: "Topic 1", outcomeIds: ["T1-01", "T1-02"] });
  });

  it("maps the difficulty preset to percentages summing to 100", () => {
    for (const level of ["easier", "balanced", "harder"] as const) {
      const bp = buildBlueprint(input(2, 30, level));
      expect(bp.difficulty).toEqual(DIFFICULTY_PRESETS[level]);
      expect(bp.difficulty.basic + bp.difficulty.standard + bp.difficulty.challenging).toBe(100);
    }
  });

  it("keeps section and topic marks consistent for every allowed total and topic count", () => {
    for (let total = 10; total <= 60; total += 5) {
      for (let n = 1; n <= 11; n += 1) {
        const bp = buildBlueprint(input(n, total));
        const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
        expect(sum(bp.scope.map((s) => s.targetMarks))).toBe(total);
        expect(sum(bp.scope.map((s) => s.sectionMarks.A))).toBe(bp.sections[0]?.marks);
        expect(sum(bp.scope.map((s) => s.sectionMarks.B))).toBe(bp.sections[1]?.marks);
        for (const s of bp.scope) {
          expect(s.sectionMarks.A + s.sectionMarks.B).toBe(s.targetMarks);
          expect(s.sectionMarks.A).toBeGreaterThanOrEqual(0);
          expect(s.sectionMarks.B).toBeGreaterThanOrEqual(0);
        }
        if (total >= n) expect(bp.scope.every((s) => s.targetMarks >= 1)).toBe(true);
      }
    }
  });

  it("returns an impossible blueprint instead of throwing when marks < topics", () => {
    const bp = buildBlueprint(input(11, 10));
    expect(bp.scope).toHaveLength(11);
    expect(bp.scope.filter((s) => s.targetMarks === 0)).toHaveLength(1);
  });

  it("copes with no topics", () => {
    const bp = buildBlueprint(input(0, 30));
    expect(bp.scope).toEqual([]);
    expect(bp.totalMarks).toBe(30);
  });

  it("does not share arrays with its input and does not mutate it", () => {
    const inp = input(2, 30);
    const before = JSON.stringify(inp);
    const bp = buildBlueprint(inp);
    bp.scope[0]?.outcomeIds.push("x");
    expect(JSON.stringify(inp)).toBe(before);
  });

  it("is deterministic", () => {
    expect(buildBlueprint(input(4, 40))).toEqual(buildBlueprint(input(4, 40)));
  });
});

describe("allocateMarks", () => {
  it("matches the blueprint numbers", () => {
    expect(allocateMarks(40, 3)).toEqual({
      sectionA: 10,
      sectionB: 30,
      topics: [
        { targetMarks: 14, A: 4, B: 10 },
        { targetMarks: 13, A: 3, B: 10 },
        { targetMarks: 13, A: 3, B: 10 },
      ],
    });
  });
});
