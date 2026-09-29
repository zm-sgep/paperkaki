import { describe, expect, it } from "vitest";
import { hasBannedParentWording } from "@/domain/assessments";
import {
  ANSWER_PACK_NOTE,
  MOCK_GENERATION_MESSAGES,
  mockReadyHeading,
  mockSummaryLine,
  printTip,
  repeatsEarlierPaper,
  sameQuestionSet,
} from "@/domain/papers";

describe("mock wording", () => {
  it("writes the ready heading, summary and print tip in the parent's words", () => {
    expect(mockReadyHeading(1)).toBe("Mock 1 is ready");
    expect(mockSummaryLine({ totalMarks: 40, durationMinutes: 45, topicLabels: ["Fractions", "Money in dollars and cents"] })).toBe(
      "40 marks · 45 minutes · Fractions, Money in dollars and cents",
    );
    expect(mockSummaryLine({ totalMarks: 20, durationMinutes: 25, topicLabels: [] })).toBe("20 marks · 25 minutes");
    expect(printTip("Darius", 45)).toBe("Print on A4. Give Darius 45 minutes.");
    expect(ANSWER_PACK_NOTE).toBe("Keep this for yourself. It has the answers.");
  });

  it("every message is calm, free of internal words, and says what to do", () => {
    for (const message of Object.values(MOCK_GENERATION_MESSAGES)) {
      expect(hasBannedParentWording(message)).toBe(false);
      expect(message).toMatch(/^[A-Z].*\.$/);
    }
    expect(MOCK_GENERATION_MESSAGES.noDifferentPaper).toMatch(/Add another topic or change the marks/);
    expect(MOCK_GENERATION_MESSAGES.couldNotRender).toMatch(/try again/i);
    expect(MOCK_GENERATION_MESSAGES.couldNotSave).toMatch(/Nothing was saved/);
  });

  it("recognises the same set of questions in any order, and only that", () => {
    expect(sameQuestionSet(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
    expect(sameQuestionSet(["a", "b"], ["a", "b", "c"])).toBe(false);
    expect(sameQuestionSet(["a", "b", "c"], ["a", "b", "d"])).toBe(false);
    expect(repeatsEarlierPaper(["a", "b"], [{ questionIds: ["x"] }, { questionIds: ["b", "a"] }])).toBe(true);
    expect(repeatsEarlierPaper(["a", "b"], [{ questionIds: ["a", "c"] }])).toBe(false);
    expect(repeatsEarlierPaper(["a"], [])).toBe(false);
  });
});
