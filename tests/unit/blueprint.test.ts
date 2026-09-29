import { describe, expect, it } from "vitest";
import {
  DIFFICULTY_PRESETS,
  END_OF_YEAR_COMMON_FORMAT,
  buildBlueprint,
  blueprintSections,
  formatTotalMarks,
  splitEvenly,
  standardFormat,
  type BlueprintInput,
  type DifficultyLevel,
  type PaperFormat,
} from "@/domain/assessments";

function input(topicCount: number, totalMarks: number, difficulty: DifficultyLevel = "balanced", format?: PaperFormat): BlueprintInput {
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
    format,
  };
}

describe("buildBlueprint without a format (the standard mock)", () => {
  it("splits 40 marks over 3 topics as 14/13/13 with two parts of 10 and 30 marks", () => {
    const bp = buildBlueprint(input(3, 40));
    expect(bp.scope.map((s) => s.targetMarks)).toEqual([14, 13, 13]);
    expect(blueprintSections(bp).map((s) => [s.code, s.kind, s.totalMarks])).toEqual([
      ["A", "mcq", 10],
      ["B", "short", 30],
    ]);
    expect(bp.format).toEqual(standardFormat({ totalMarks: 40, durationMinutes: 45 }));
  });

  it("uses 25% for the multiple choice part, rounding half up", () => {
    const a = (total: number) => buildBlueprint(input(1, total)).format.sections[0]?.totalMarks;
    expect(a(40)).toBe(10);
    expect(a(20)).toBe(5);
    expect(a(30)).toBe(8);
    expect(a(10)).toBe(3);
    expect(a(15)).toBe(4);
    expect(a(60)).toBe(15);
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

  it("keeps part and topic marks consistent for every allowed total and topic count", () => {
    for (let total = 10; total <= 60; total += 5) {
      for (let n = 1; n <= 11; n += 1) {
        const bp = buildBlueprint(input(n, total));
        const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
        expect(sum(bp.scope.map((s) => s.targetMarks))).toBe(total);
        expect(formatTotalMarks(bp.format)).toBe(total);
        expect(bp.totalMarks).toBe(total);
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

describe("buildBlueprint with a format", () => {
  it("carries the format and takes marks and time from it", () => {
    const bp = buildBlueprint(input(5, 40, "balanced", END_OF_YEAR_COMMON_FORMAT));
    expect(bp.format).toEqual(END_OF_YEAR_COMMON_FORMAT);
    expect(bp.totalMarks).toBe(50);
    expect(bp.durationMinutes).toBe(90);
    expect(bp.scope.map((s) => s.targetMarks)).toEqual([10, 10, 10, 10, 10]);
    expect(blueprintSections(bp).map((s) => [s.code, s.label])).toEqual([
      ["A", "Section A"],
      ["B", "Section B"],
      ["C", "Section C"],
    ]);
  });

  it("copies the format, so the blueprint cannot change a shared preset", () => {
    const bp = buildBlueprint(input(2, 40, "balanced", END_OF_YEAR_COMMON_FORMAT));
    bp.format.sections[0]!.label = "Changed";
    expect(END_OF_YEAR_COMMON_FORMAT.sections[0]?.label).toBe("Section A");
  });
});

describe("splitEvenly", () => {
  it("gives the remainder to the earliest parts", () => {
    expect(splitEvenly(40, 3)).toEqual([14, 13, 13]);
    expect(splitEvenly(50, 11)).toEqual([5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4]);
    expect(splitEvenly(10, 0)).toEqual([]);
  });
});
