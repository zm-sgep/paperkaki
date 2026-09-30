import { describe, expect, it } from "vitest";
import { evidenceWords, mistakePatterns, progressSentence, topicNeedsWork, type ProgressTopic } from "@/domain/mastery";

function topic(over: Partial<ProgressTopic> & { label: string }): ProgressTopic {
  return { topicId: over.label.toLowerCase(), state: "developing", outcomes: [{ outcomeId: `${over.label}-1`, state: over.state ?? "developing", evidenceCount: 5 }], ...over };
}

describe("the parent's one-sentence summary", () => {
  it("says what improved and what still needs attention", () => {
    const summary = progressSentence([
      topic({ label: "Fractions", state: "almost_mastered", outcomes: [{ outcomeId: "f1", state: "almost_mastered", previousState: "developing", evidenceCount: 8 }] }),
      topic({ label: "Length", state: "developing", recentAccuracy: 0.4, outcomes: [{ outcomeId: "l1", state: "developing", previousState: "developing", evidenceCount: 6 }] }),
    ]);
    expect(summary.sentence).toBe("Fractions improved. Length still needs attention.");
    expect(summary.improved).toEqual([{ topicId: "fractions", label: "Fractions" }]);
    expect(summary.attention).toEqual({ topicId: "length", label: "Length", stillNeeds: true });
  });

  it("does not say 'still' or 'improved' on a first look: there is nothing to compare with", () => {
    const summary = progressSentence([topic({ label: "Length" }), topic({ label: "Time", state: "learning" })]);
    expect(summary.sentence).toBe("Time needs attention.");
    expect(summary.improved).toEqual([]);
    expect(summary.attention?.stillNeeds).toBe(false);
  });

  it("names the weakest topic: the emptiest state first, then the lowest accuracy, then the name", () => {
    const summary = progressSentence([
      topic({ label: "Angles", state: "developing", recentAccuracy: 0.5 }),
      topic({ label: "Mass", state: "developing", recentAccuracy: 0.45 }),
      topic({ label: "Money", state: "learning", recentAccuracy: 0.9 }),
    ]);
    expect(summary.attention?.label).toBe("Money");
    expect(progressSentence([topic({ label: "Angles", recentAccuracy: 0.5 }), topic({ label: "Mass", recentAccuracy: 0.45 })]).attention?.label).toBe("Mass");
    expect(progressSentence([topic({ label: "Beta" }), topic({ label: "Alpha" })]).attention?.label).toBe("Alpha");
  });

  it("stays calm when nothing needs attention, and when nothing has started", () => {
    expect(progressSentence([topic({ label: "Fractions", state: "mastered" })]).sentence).toBe("Everything is on track so far.");
    expect(progressSentence([topic({ label: "Fractions", state: "not_started", outcomes: [{ outcomeId: "x", state: "not_started" }] })]).sentence).toBe("No practice or mocks to look at yet.");
    expect(progressSentence([]).attention).toBeNull();
  });

  it("never puts a number, a percentage or the word mastery in the sentence", () => {
    const summary = progressSentence([
      topic({ label: "Fractions", state: "almost_mastered", outcomes: [{ outcomeId: "f1", state: "almost_mastered", previousState: "learning", evidenceCount: 8 }] }),
      topic({ label: "Length", outcomes: [{ outcomeId: "l1", state: "developing", previousState: "learning", evidenceCount: 6 }] }),
    ]);
    expect(summary.sentence).not.toMatch(/\d|%|master/i);
  });

  it("knows which topics need work", () => {
    expect(topicNeedsWork({ state: "learning" })).toBe(true);
    expect(topicNeedsWork({ state: "developing" })).toBe(true);
    expect(topicNeedsWork({ state: "almost_mastered" })).toBe(false);
    expect(topicNeedsWork({ state: "not_started" })).toBe(false);
  });
});

describe("evidence and mistake patterns in words", () => {
  it("says how much a state rests on", () => {
    expect(evidenceWords(0, 0)).toBe("No questions answered yet");
    expect(evidenceWords(1, 1)).toBe("Based on 1 question from 1 session");
    expect(evidenceWords(8, 2)).toBe("Based on 8 questions from 2 sessions");
  });

  it("counts slips by kind, most common first, in plain words", () => {
    expect(mistakePatterns(["calculation", "blank", "calculation", "misread", "blank", "calculation"])).toEqual([
      { kind: "calculation", label: "Slips in the calculation", count: 3 },
      { kind: "blank", label: "Questions left blank", count: 2 },
      { kind: "misread", label: "Reading the question carefully", count: 1 },
    ]);
    expect(mistakePatterns([])).toEqual([]);
  });
});
