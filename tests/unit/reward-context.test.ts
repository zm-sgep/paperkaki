import { describe, expect, it } from "vitest";
import type { MasteryEvidence } from "@/domain/mastery";
import { REWARD_POLICY_V1, buildRewardContext, calculateReward, masteryOfScope, modalDifficulty } from "@/domain/rewards";

/** Fictional evidence for one skill "O1" (and a second skill "O2"), built the way the mastery domain stores it. */
const DAY = 86_400_000;
const T0 = Date.parse("2026-09-01T02:00:00Z");
const at = (days: number, minutes = 0) => new Date(T0 + days * DAY + minutes * 60_000).toISOString();

let counter = 0;
function evidence(input: Partial<MasteryEvidence> & { sessionId: string; at: string }): MasteryEvidence {
  counter += 1;
  return {
    outcomeId: "O1",
    questionId: `q-${counter}`,
    familyId: `f-${counter}`,
    questionType: "number",
    difficulty: "standard",
    scoreRatio: 1,
    firstAttempt: true,
    ...input,
  };
}

/** `count` answers in one session, scoring by `ratios` (repeated as needed), spaced a minute apart. */
function session(sessionId: string, start: string, ratios: number[], extra: Partial<MasteryEvidence> = {}): MasteryEvidence[] {
  return ratios.map((scoreRatio, index) =>
    evidence({ sessionId, at: new Date(Date.parse(start) + index * 60_000).toISOString(), scoreRatio, ...extra }),
  );
}

const scope = { testableOutcomeIds: ["O1"] };
const base = {
  childId: "child-1",
  scope,
  reviewedMistakes: false,
  firstMasteryAlreadyAwarded: false,
};

/** A skill that is properly mastered: five-plus answers, two sessions on two days, two families, all right. */
function masteredHistory(): MasteryEvidence[] {
  return [...session("m1", at(0), [1, 1, 1]), ...session("m2", at(2), [1, 1, 1])];
}

describe("building a reward context from evidence", () => {
  it("works out mastery before and after from the evidence on either side of the activity", () => {
    const earlier = session("old", at(0), [0, 1, 0]);
    const own = session("now", at(3), [1, 1, 1, 1]);
    const { context, before, after } = buildRewardContext({
      ...base,
      sourceEventId: "practice:now",
      activityType: "targeted_practice",
      activityId: "now",
      evidence: [...earlier, ...own],
      now: at(3, 30),
    });
    expect(before.evidenceCount).toBe(3);
    expect(context.masteryBefore).toBe(before.attention);
    expect(context.masteryAfter).toBe(after.attention);
    expect(after.evidenceCount).toBe(7);
    // The state before ignores the activity itself.
    expect(context.masteryBefore).not.toBe("mastered");
  });

  it("takes accuracy from the activity and the previous accuracy from before it", () => {
    const earlier = session("old", at(0), [0, 0, 1, 0]);
    const own = session("now", at(3), [1, 1, 1, 0]);
    const { context, before } = buildRewardContext({
      ...base,
      sourceEventId: "practice:now",
      activityType: "targeted_practice",
      activityId: "now",
      evidence: [...earlier, ...own],
      now: at(3, 30),
    });
    expect(context.accuracy).toBeCloseTo(0.75, 5);
    expect(context.previousAccuracy).toBeCloseTo(before.recentAccuracy as number, 10);
    expect(context.previousAccuracy).toBeLessThan(0.5);
  });

  it("has no previous accuracy for a skill that has never been tried", () => {
    const { context } = buildRewardContext({
      ...base,
      sourceEventId: "practice:now",
      activityType: "targeted_practice",
      activityId: "now",
      evidence: session("now", at(0), [1, 0, 1]),
      now: at(0, 30),
    });
    expect(context.masteryBefore).toBe("not_started");
    expect(context.previousAccuracy).toBeUndefined();
    expect(context.firstMeaningfulAttempt).toBe(true);
  });

  it("marks an activity made only of retries as not a first meaningful attempt", () => {
    const { context } = buildRewardContext({
      ...base,
      sourceEventId: "practice:retry",
      activityType: "targeted_practice",
      activityId: "retry",
      evidence: [...session("first", at(0), [0, 0, 0]), ...session("retry", at(1), [1, 1, 1], { firstAttempt: false })],
      now: at(1, 30),
    });
    expect(context.firstMeaningfulAttempt).toBe(false);
  });

  it("uses the most common difficulty, and the harder one on a tie", () => {
    expect(modalDifficulty([{ difficulty: "basic" }, { difficulty: "basic" }, { difficulty: "challenging" }])).toBe("basic");
    expect(modalDifficulty([{ difficulty: "basic" }, { difficulty: "challenging" }])).toBe("challenging");
    expect(modalDifficulty([])).toBe("standard");
  });

  it("counts a question family already used in earlier sessions within a week, and only when most of the set repeats", () => {
    const earlier = [
      ...session("s1", at(0), [1, 1, 1], { familyId: "same" }),
      ...session("s2", at(1), [1, 1, 1], { familyId: "same" }),
    ];
    const repeat = session("s3", at(3), [1, 1, 1], { familyId: "same" });
    const built = buildRewardContext({ ...base, sourceEventId: "practice:s3", activityType: "targeted_practice", activityId: "s3", evidence: [...earlier, ...repeat], now: at(3, 30) });
    expect(built.context.repeatedFamilyCountRecent).toBe(2);

    // The same families a fortnight earlier are outside the window.
    const old = buildRewardContext({ ...base, sourceEventId: "practice:s3", activityType: "targeted_practice", activityId: "s3", evidence: [...earlier, ...session("s3", at(20), [1, 1, 1], { familyId: "same" })], now: at(20, 30) });
    expect(old.context.repeatedFamilyCountRecent).toBe(0);

    // One repeated family among many new ones does not count.
    const mixed = [...session("s3", at(3), [1, 1, 1], { familyId: "same" }).slice(0, 1), ...session("s3", at(3, 5), [1, 1, 1, 1])];
    const some = buildRewardContext({ ...base, sourceEventId: "practice:s3", activityType: "targeted_practice", activityId: "s3", evidence: [...earlier, ...mixed], now: at(3, 30) });
    expect(some.context.repeatedFamilyCountRecent).toBe(0);
  });

  it("counts earlier sessions on the same Singapore day for saturation, not earlier days", () => {
    const today = at(5);
    const earlier = [...session("a", today, [1, 1, 1]), ...session("b", at(5, 60), [1, 1, 1]), ...session("yesterday", at(4), [1, 1, 1])];
    const { context } = buildRewardContext({ ...base, sourceEventId: "practice:c", activityType: "targeted_practice", activityId: "c", evidence: [...earlier, ...session("c", at(5, 180), [1, 1, 1])], now: at(5, 240) });
    expect(context.topicRewardedSessionsRecent).toBe(2);
  });

  it("reports minutes since a near-identical activity: same skills, same difficulty", () => {
    const same = session("prev", at(2), [1, 1, 1]);
    const { context } = buildRewardContext({ ...base, sourceEventId: "practice:now", activityType: "targeted_practice", activityId: "now", evidence: [...same, ...session("now", at(2, 12), [1, 1, 1])], now: at(2, 20) });
    // Last answer of the earlier set was at minute 2; this set began at minute 12.
    expect(context.minutesSinceNearIdenticalActivity).toBeCloseTo(10, 5);

    const harder = buildRewardContext({ ...base, sourceEventId: "practice:now", activityType: "targeted_practice", activityId: "now", evidence: [...same, ...session("now", at(2, 12), [1, 1, 1], { difficulty: "challenging" })], now: at(2, 20) });
    expect(harder.context.minutesSinceNearIdenticalActivity).toBeUndefined();
  });

  it("says a review is due once a mastered skill's review date has passed", () => {
    const history = masteredHistory();
    const dueLater = buildRewardContext({ ...base, sourceEventId: "practice:r", activityType: "retention_check", activityId: "r", evidence: [...history, ...session("r", at(4), [1, 1])], now: at(4, 10) });
    expect(dueLater.before.state).toBe("mastered");
    expect(dueLater.context.spacedReviewDue).toBe(false);
    const due = buildRewardContext({ ...base, sourceEventId: "practice:r", activityType: "retention_check", activityId: "r", evidence: [...history, ...session("r", at(14), [1, 1])], now: at(14, 10) });
    expect(due.context.spacedReviewDue).toBe(true);
  });

  it("gives an activity with no evidence of its own (a mistake review) the same state before and after", () => {
    const { context } = buildRewardContext({
      ...base,
      sourceEventId: "mistake-review:a1",
      activityType: "mistake_review",
      evidence: session("mock", at(0), [1, 0, 0, 1]),
      now: at(1),
      reviewedMistakes: true,
    });
    expect(context.masteryAfter).toBe(context.masteryBefore);
    expect(context.firstMeaningfulAttempt).toBe(true);
    expect(context.accuracy).toBeUndefined();
    expect(context.reviewedMistakes).toBe(true);
  });

  it("does not call a topic secure while a skill of it has not been seen", () => {
    const wide = { testableOutcomeIds: ["O1", "O2"] };
    const state = masteryOfScope([...masteredHistory(), ...session("x", at(3), [1, 1, 1])], wide, at(4));
    expect(state.state).toBe("almost_mastered");
  });
});

describe("what the engine does with a built context", () => {
  it("pays a weak skill that improves more than the same work on a mastered skill", () => {
    const weak = buildRewardContext({
      ...base,
      sourceEventId: "practice:w",
      activityType: "targeted_practice",
      activityId: "w",
      evidence: [...session("old", at(0), [0, 0, 1, 0]), ...session("w", at(3), [1, 1, 1, 1])],
      now: at(3, 30),
    });
    const strong = buildRewardContext({
      ...base,
      sourceEventId: "practice:s",
      activityType: "targeted_practice",
      activityId: "s",
      evidence: [...masteredHistory(), ...session("s", at(3), [1, 1, 1, 1])],
      now: at(3, 30),
    });
    const weakPoints = calculateReward(weak.context, REWARD_POLICY_V1);
    const strongPoints = calculateReward(strong.context, REWARD_POLICY_V1);
    expect(weakPoints.reasonCodes).toContain("improvement");
    expect(weakPoints.points).toBeGreaterThan(strongPoints.points * 2);
  });

  it("gives less and redirects when a mastered skill is repeated the same day", () => {
    const history = [...masteredHistory(), ...session("t1", at(5), [1, 1, 1]), ...session("t2", at(5, 30), [1, 1, 1])];
    const third = buildRewardContext({ ...base, sourceEventId: "practice:t3", activityType: "targeted_practice", activityId: "t3", evidence: [...history, ...session("t3", at(5, 60), [1, 1, 1])], now: at(5, 90), nextActionCandidates: { weakOutcome: { outcomeId: "topic-2", label: "Fractions" } } });
    const decision = calculateReward(third.context, REWARD_POLICY_V1);
    expect(decision.points).toBeLessThanOrEqual(3);
    expect(decision.recommendedNextAction?.message).toContain("Try Fractions next to earn more points and keep growing.");
  });

  it("earns nothing for a mock while results are not available, and something once they are", () => {
    const input = { ...base, sourceEventId: "mock-result:m", activityType: "mock" as const, activityId: "m", evidence: session("m", at(0), [1, 0, 1, 1]), now: at(0, 10) };
    expect(calculateReward(buildRewardContext(input).context, REWARD_POLICY_V1).points).toBe(0);
    const ready = buildRewardContext({ ...input, resultsAvailable: true });
    expect(calculateReward(ready.context, REWARD_POLICY_V1).points).toBeGreaterThan(0);
  });
});
