import { describe, expect, it } from "vitest";
import {
  DIFFICULTY_PRESETS,
  PAPER_LIMITS,
  allowedTotalMarks,
  isValidDuration,
  isValidTotalMarks,
  recommendPaperSettings,
} from "@/domain/assessments";

describe("recommendPaperSettings", () => {
  it("suggests 20 marks / 25 minutes for one topic", () => {
    expect(recommendPaperSettings({ topicCount: 1 })).toEqual({
      totalMarks: 20,
      durationMinutes: 25,
      difficulty: "balanced",
    });
  });

  it("suggests 30 marks / 35 minutes for two topics", () => {
    expect(recommendPaperSettings({ topicCount: 2 })).toEqual({
      totalMarks: 30,
      durationMinutes: 35,
      difficulty: "balanced",
    });
  });

  it("suggests 40 marks / 45 minutes for three or more topics", () => {
    for (const topicCount of [3, 4, 7, 11]) {
      expect(recommendPaperSettings({ topicCount })).toEqual({
        totalMarks: 40,
        durationMinutes: 45,
        difficulty: "balanced",
      });
    }
  });

  it("treats zero topics like one topic instead of throwing", () => {
    expect(recommendPaperSettings({ topicCount: 0 }).totalMarks).toBe(20);
  });

  it("only recommends values a parent is allowed to choose", () => {
    for (let topicCount = 0; topicCount <= 11; topicCount += 1) {
      const s = recommendPaperSettings({ topicCount });
      expect(isValidTotalMarks(s.totalMarks)).toBe(true);
      expect(isValidDuration(s.durationMinutes)).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(recommendPaperSettings({ topicCount: 4 })).toEqual(recommendPaperSettings({ topicCount: 4 }));
  });
});

describe("difficulty presets", () => {
  it("match the product defaults", () => {
    expect(DIFFICULTY_PRESETS.easier).toEqual({ basic: 50, standard: 40, challenging: 10 });
    expect(DIFFICULTY_PRESETS.balanced).toEqual({ basic: 30, standard: 50, challenging: 20 });
    expect(DIFFICULTY_PRESETS.harder).toEqual({ basic: 20, standard: 45, challenging: 35 });
  });

  it("each sum to 100", () => {
    for (const mix of Object.values(DIFFICULTY_PRESETS)) {
      expect(mix.basic + mix.standard + mix.challenging).toBe(100);
    }
  });
});

describe("parent edit limits", () => {
  it("allows 10 to 60 marks in steps of 5", () => {
    expect(allowedTotalMarks()).toEqual([10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
    expect(isValidTotalMarks(PAPER_LIMITS.minMarks)).toBe(true);
    expect(isValidTotalMarks(PAPER_LIMITS.maxMarks)).toBe(true);
    for (const bad of [5, 12, 65, 0, -10, 42.5, Number.NaN]) expect(isValidTotalMarks(bad)).toBe(false);
  });

  it("allows 15 to 120 minutes", () => {
    expect(isValidDuration(15)).toBe(true);
    expect(isValidDuration(120)).toBe(true);
    for (const bad of [14, 121, 0, 30.5, Number.NaN]) expect(isValidDuration(bad)).toBe(false);
  });
});
