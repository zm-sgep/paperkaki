import { describe, expect, it } from "vitest";
import {
  MASTERY_STATE_WORDS,
  attentionStateOf,
  deriveMastery,
  evidenceFromAnswers,
  scoreRatioOf,
  starsForState,
  topicMasteryOf,
  type MarkedAnswerFacts,
  type MasteryState,
} from "@/domain/mastery";

const answer = (over: Partial<MarkedAnswerFacts> = {}): MarkedAnswerFacts => ({
  outcomeId: "o1",
  questionId: "q1",
  familyId: "f1",
  questionType: "number",
  difficulty: "standard",
  score: 1,
  maxScore: 1,
  sessionId: "s1",
  answeredAt: "2026-09-29T02:00:00.000Z",
  ...over,
});

describe("evidence mapping (M8)", () => {
  it("turns marks into a ratio between 0 and 1", () => {
    expect(scoreRatioOf(2, 4)).toBe(0.5);
    expect(scoreRatioOf(0, 3)).toBe(0);
    expect(scoreRatioOf(5, 3)).toBe(1);
    expect(scoreRatioOf(-1, 3)).toBe(0);
    expect(scoreRatioOf(1, 0)).toBe(0);
    expect(scoreRatioOf(Number.NaN, 3)).toBe(0);
  });

  it("makes one piece of evidence per answer, in order, with the question's facts", () => {
    const evidence = evidenceFromAnswers([
      answer({ questionId: "q1", score: 3, maxScore: 3, difficulty: "challenging", questionType: "fraction", familyId: "fa" }),
      answer({ questionId: "q2", score: 0, maxScore: 2, difficulty: "basic", questionType: "mcq", familyId: "fb" }),
    ]);
    expect(evidence).toEqual([
      { outcomeId: "o1", questionId: "q1", familyId: "fa", questionType: "fraction", difficulty: "challenging", scoreRatio: 1, firstAttempt: true, sessionId: "s1", at: "2026-09-29T02:00:00.000Z" },
      { outcomeId: "o1", questionId: "q2", familyId: "fb", questionType: "mcq", difficulty: "basic", scoreRatio: 0, firstAttempt: true, sessionId: "s1", at: "2026-09-29T02:00:00.000Z" },
    ]);
  });

  it("counts a question as a first attempt only once for this child", () => {
    const later = evidenceFromAnswers([answer({ questionId: "q1" }), answer({ questionId: "q9" })], new Set(["q1"]));
    expect(later.map((entry) => entry.firstAttempt)).toEqual([false, true]);
    const repeated = evidenceFromAnswers([answer({ questionId: "q5" }), answer({ questionId: "q5" })]);
    expect(repeated.map((entry) => entry.firstAttempt)).toEqual([true, false]);
  });

  it("retries do not lift mastery: only first attempts count", () => {
    const first = evidenceFromAnswers(Array.from({ length: 4 }, (_, i) => answer({ questionId: `q${i}`, score: 0 })));
    const retries = evidenceFromAnswers(
      Array.from({ length: 6 }, (_, i) => answer({ questionId: `q${i % 4}`, score: 1, sessionId: "s2", answeredAt: "2026-09-30T02:00:00.000Z" })),
      new Set(first.map((entry) => entry.questionId)),
    );
    const [outcome] = deriveMastery([...first, ...retries], "2026-10-01T02:00:00.000Z");
    expect(outcome?.state).toBe("learning");
    expect(outcome?.evidenceCount).toBe(4);
  });
});

describe("mastery in words, stars and topics", () => {
  it("has plain words for all six states and never the word mastery", () => {
    expect(MASTERY_STATE_WORDS).toEqual({
      not_started: "Not started",
      learning: "Learning",
      developing: "Getting there",
      almost_mastered: "Almost there",
      mastered: "Secure",
      retained: "Remembered",
    });
    expect(Object.values(MASTERY_STATE_WORDS).join(" ")).not.toMatch(/master/i);
  });

  it("gives 0 to 4 stars, with the last two states both full", () => {
    const states: MasteryState[] = ["not_started", "learning", "developing", "almost_mastered", "mastered", "retained"];
    expect(states.map(starsForState)).toEqual([0, 1, 2, 3, 4, 4]);
  });

  it("sees a skill doing well as 'not weak': too few answers to say more, or almost there", () => {
    // Right so far but too little evidence (the mastery rules keep it at "learning"): nothing to worry about.
    expect(attentionStateOf({ state: "learning", evidenceCount: 2, recentAccuracy: 1 })).toBe("not_started");
    // Enough answers, one session only (the rules keep it at "getting there"): nearly there.
    expect(attentionStateOf({ state: "developing", evidenceCount: 6, recentAccuracy: 0.9 })).toBe("almost_mastered");
    // Answered badly: still weak.
    expect(attentionStateOf({ state: "learning", evidenceCount: 5, recentAccuracy: 0.2 })).toBe("learning");
    expect(attentionStateOf({ state: "developing", evidenceCount: 5, recentAccuracy: 0.5 })).toBe("developing");
    // Other states are left alone.
    expect(attentionStateOf({ state: "mastered", evidenceCount: 9, recentAccuracy: 1 })).toBe("mastered");
    expect(attentionStateOf({ state: "not_started", evidenceCount: 0 })).toBe("not_started");
  });

  it("judges a topic on all its evidence together, and never calls it secure while a skill is untouched", () => {
    const secure = { outcomeId: "t", state: "mastered" as const, evidenceCount: 9, sessions: 3, lastPracticedAt: "2026-09-10T00:00:00.000Z", reviewDueAt: "2026-09-20T00:00:00.000Z", recentAccuracy: 0.95 };
    expect(topicMasteryOf({ pooled: secure, testableCount: 4, coveredCount: 4 })).toMatchObject({ state: "mastered", attention: "mastered", stars: 4, reviewDueAt: "2026-09-20T00:00:00.000Z", sessions: 3, evidenceCount: 9 });
    const partial = topicMasteryOf({ pooled: secure, testableCount: 4, coveredCount: 3 });
    expect(partial).toMatchObject({ state: "almost_mastered", stars: 3 });
    expect(partial.reviewDueAt).toBeUndefined();
    const weak = topicMasteryOf({ pooled: { outcomeId: "t", state: "learning", evidenceCount: 6, sessions: 1, recentAccuracy: 0.2 }, testableCount: 4, coveredCount: 2 });
    expect(weak).toMatchObject({ state: "learning", attention: "learning", stars: 1 });
    expect(topicMasteryOf({ pooled: { outcomeId: "t", state: "not_started", evidenceCount: 0, sessions: 0 }, testableCount: 3, coveredCount: 0 })).toMatchObject({ state: "not_started", stars: 0 });
  });
});
