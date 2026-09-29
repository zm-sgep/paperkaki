import { describe, expect, it } from "vitest";
import {
  REWARD_POLICY_V1,
  decayFactor,
  evaluateAntiFarming,
  evaluateWeakAreaRecovery,
  qualifiesForSpacedRetention,
  qualifiesForStretch,
} from "@/domain/rewards";
import { context, scenarioA, scenarioB, scenarioC, scenarioD } from "./fixtures";

const policy = REWARD_POLICY_V1;
const rules = (ctx: ReturnType<typeof context>) => evaluateAntiFarming(ctx, policy).decisions.map((d) => d.rule);

describe("decayFactor", () => {
  it("indexes by count and repeats the last value", () => {
    expect(decayFactor([1, 0.6, 0.25, 0.1], 0)).toBe(1);
    expect(decayFactor([1, 0.6, 0.25, 0.1], 2)).toBe(0.25);
    expect(decayFactor([1, 0.6, 0.25, 0.1], 50)).toBe(0.1);
    expect(decayFactor([1, 0.6], -3)).toBe(1);
  });
});

describe("evaluateAntiFarming", () => {
  it("applies nothing to a fresh first attempt on a weak topic", () => {
    const result = evaluateAntiFarming(scenarioA(), policy);
    expect(result.eligible).toBe(true);
    expect(result.decisions).toEqual([]);
    expect(Object.values(result.factors).every((factor) => factor === 1)).toBe(true);
  });

  it("first-attempt weighting: retries use the repeat factor", () => {
    const result = evaluateAntiFarming(context({ firstMeaningfulAttempt: false }), policy);
    expect(result.factors.attempt).toBe(0.15);
    expect(rules(context({ firstMeaningfulAttempt: false }))).toEqual(["retry_attempt"]);
  });

  it("family repetition follows the policy list and suppresses at the end of a zero tail", () => {
    expect(evaluateAntiFarming(context({ repeatedFamilyCountRecent: 1 }), policy).factors.familyRepetition).toBe(0.6);
    expect(evaluateAntiFarming(context({ repeatedFamilyCountRecent: 2 }), policy).factors.familyRepetition).toBe(0.25);
    expect(evaluateAntiFarming(context({ repeatedFamilyCountRecent: 9 }), policy).factors.familyRepetition).toBe(0.1);
  });

  it("topic saturation only applies to mastered topics and can reach zero", () => {
    const weak = evaluateAntiFarming(context({ topicRewardedSessionsRecent: 5 }), policy);
    expect(weak.factors.topicSaturation).toBe(1);
    const mastered = evaluateAntiFarming(
      context({ masteryBefore: "mastered", masteryAfter: "mastered", difficulty: "challenging", topicRewardedSessionsRecent: 3 }),
      policy,
    );
    expect(mastered.factors.topicSaturation).toBe(0);
    expect(mastered.decisions.find((d) => d.rule === "topic_saturation")?.effect).toBe("suppressed");
  });

  it("difficulty floor: easy work after mastery is reduced, standard work is not", () => {
    const mastered = { masteryBefore: "mastered", masteryAfter: "mastered" } as const;
    expect(evaluateAntiFarming(context({ ...mastered, difficulty: "basic" }), policy).factors.difficultyFloor).toBe(0.5);
    expect(evaluateAntiFarming(context({ ...mastered, difficulty: "standard" }), policy).factors.difficultyFloor).toBe(1);
    expect(evaluateAntiFarming(context({ difficulty: "basic" }), policy).factors.difficultyFloor).toBe(1);
  });

  it("cooldown: near-identical activity inside the window is reduced", () => {
    expect(evaluateAntiFarming(context({ minutesSinceNearIdenticalActivity: 29 }), policy).factors.cooldown).toBe(0.25);
    expect(evaluateAntiFarming(context({ minutesSinceNearIdenticalActivity: 30 }), policy).factors.cooldown).toBe(1);
  });

  it("spaced retention is exempt from saturation, floor and cooldown", () => {
    const spaced = evaluateAntiFarming(
      { ...scenarioD(), difficulty: "basic", topicRewardedSessionsRecent: 4, minutesSinceNearIdenticalActivity: 1 },
      policy,
    );
    expect(spaced.spacedRetention).toBe(true);
    expect(spaced.factors.topicSaturation).toBe(1);
    expect(spaced.factors.difficultyFloor).toBe(1);
    expect(spaced.factors.cooldown).toBe(1);
  });

  it("mistake review is exempt from repetition rules but not from the retry factor", () => {
    const review = context({
      activityType: "mistake_review",
      reviewedMistakes: true,
      masteryBefore: "mastered",
      masteryAfter: "mastered",
      difficulty: "basic",
      repeatedFamilyCountRecent: 4,
      topicRewardedSessionsRecent: 4,
      minutesSinceNearIdenticalActivity: 1,
    });
    expect(rules(review)).toEqual([]);
    expect(rules({ ...review, firstMeaningfulAttempt: false })).toEqual(["retry_attempt"]);
  });

  it("withholds a mock until results exist and a review until mistakes were reviewed", () => {
    const mock = evaluateAntiFarming(context({ activityType: "mock" }), policy);
    expect(mock.eligible).toBe(false);
    expect(mock.decisions).toEqual([{ rule: "mock_in_progress", effect: "withheld", factor: 0 }]);
    expect(evaluateAntiFarming(context({ activityType: "mock", resultsAvailable: true }), policy).eligible).toBe(true);
    expect(evaluateAntiFarming(context({ activityType: "mistake_review" }), policy).eligible).toBe(false);
  });

  it("low-effort factor applies only when the caller reports reliable evidence", () => {
    expect(evaluateAntiFarming(context(), policy).factors.lowEffort).toBe(1);
    expect(evaluateAntiFarming(context({ reliableLowEffortSignal: true }), policy).factors.lowEffort).toBe(0);
    expect(evaluateAntiFarming(context({ reliableLowEffortSignal: false }), policy).factors.lowEffort).toBe(1);
  });

  it("does not mistake a fast, correct attempt for low effort", () => {
    expect(evaluateAntiFarming(context({ accuracy: 1, previousAccuracy: 1 }), policy).decisions).toEqual([]);
  });
});

describe("qualification helpers", () => {
  it("spaced retention needs mastery, a due review, a first attempt and strong accuracy", () => {
    expect(qualifiesForSpacedRetention(scenarioD(), policy)).toBe(true);
    expect(qualifiesForSpacedRetention({ ...scenarioD(), spacedReviewDue: false }, policy)).toBe(false);
    expect(qualifiesForSpacedRetention({ ...scenarioD(), accuracy: 0.5 }, policy)).toBe(false);
    expect(qualifiesForSpacedRetention({ ...scenarioD(), accuracy: undefined }, policy)).toBe(false);
    expect(qualifiesForSpacedRetention({ ...scenarioD(), masteryBefore: "developing" }, policy)).toBe(false);
  });

  it("stretch needs a new, harder family on a mastered topic", () => {
    expect(qualifiesForStretch(scenarioC(), policy)).toBe(true);
    expect(qualifiesForStretch({ ...scenarioC(), repeatedFamilyCountRecent: 1 }, policy)).toBe(false);
    expect(qualifiesForStretch({ ...scenarioC(), difficulty: "standard" }, policy)).toBe(false);
    expect(qualifiesForStretch({ ...scenarioB() }, policy)).toBe(false);
  });

  it("weak-area recovery needs real gain, and the mistake review some recovery rewards require", () => {
    expect(evaluateWeakAreaRecovery(scenarioA(), policy)).toEqual({ qualifies: true, blockedByMistakeReview: false });
    expect(evaluateWeakAreaRecovery({ ...scenarioA(), reviewedMistakes: false }, policy)).toEqual({
      qualifies: false,
      blockedByMistakeReview: true,
    });
    expect(evaluateWeakAreaRecovery({ ...scenarioA(), previousAccuracy: 0.7 }, policy)).toEqual({
      qualifies: false,
      blockedByMistakeReview: false,
    });
    expect(evaluateWeakAreaRecovery({ ...scenarioA(), masteryBefore: "mastered" }, policy).qualifies).toBe(false);
  });
});
