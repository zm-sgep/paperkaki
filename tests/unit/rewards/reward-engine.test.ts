import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TYPES,
  DIFFICULTIES,
  MASTERY_STATES,
  REWARD_POLICY_V1,
  RewardContextError,
  calculateReward,
  roundHalfUp,
  type RewardContext,
  type RewardPolicy,
} from "@/domain/rewards";
import { context, scenarioA, scenarioB, scenarioC, scenarioD, scenarioE } from "./fixtures";

const policy = REWARD_POLICY_V1;
const points = (ctx: RewardContext) => calculateReward(ctx, policy).points;

describe("spec section 7 scenarios", () => {
  it("A: weak fractions improving earns healthy points with improvement and recovery reasons and no farming penalty", () => {
    const decision = calculateReward(scenarioA(), policy);
    expect(decision.points).toBeGreaterThanOrEqual(15);
    expect(decision.reasonCodes).toContain("improvement");
    expect(decision.reasonCodes).toContain("weak_area_recovery");
    expect(decision.antiFarmingDecisions).toEqual([]);
    expect(decision.recommendedNextAction).toBeUndefined();
  });

  it("A: recovery is held back, with a note, until mistakes are reviewed", () => {
    const decision = calculateReward({ ...scenarioA(), reviewedMistakes: false }, policy);
    expect(decision.reasonCodes).toContain("improvement");
    expect(decision.reasonCodes).not.toContain("weak_area_recovery");
    expect(decision.antiFarmingDecisions.map((entry) => entry.rule)).toContain(
      "recovery_needs_mistake_review",
    );
    expect(decision.points).toBeLessThan(points(scenarioA()));
  });

  it("B: repeated mastered easy work earns very little or nothing and redirects kindly", () => {
    const decision = calculateReward(scenarioB(), policy);
    expect(decision.points).toBeLessThanOrEqual(1);
    expect(decision.points).toBeLessThan(points(scenarioA()) * 0.1);
    expect(decision.recommendedNextAction).toEqual({
      message: "You're already strong in Multiplication. Try Fractions next to earn more points and keep growing.",
      action: { type: "practice_outcome", outcomeId: "outcome-fractions" },
    });
  });

  it("C: harder transfer on a mastered topic earns moderate points with the stretch reason, less than genuine weak-area improvement", () => {
    const decision = calculateReward(scenarioC(), policy);
    expect(decision.reasonCodes).toEqual(["stretch_challenge"]);
    expect(decision.points).toBeGreaterThanOrEqual(6);
    expect(decision.points).toBeLessThan(points(scenarioA()));
  });

  it("D: strong spaced retention earns moderate points with the retention reason", () => {
    const decision = calculateReward(scenarioD(), policy);
    expect(decision.reasonCodes).toContain("retention");
    expect(decision.points).toBeGreaterThanOrEqual(6);
    expect(decision.points).toBeLessThan(points(scenarioA()));
    expect(decision.antiFarmingDecisions).toEqual([]);
  });

  it("E: rapid retries earn little or nothing, and a later mistake review still earns", () => {
    const retry = calculateReward(scenarioE(), policy);
    expect(retry.points).toBeLessThanOrEqual(1);
    const firstAttempt = points({
      ...scenarioE(),
      firstMeaningfulAttempt: true,
      previousAccuracy: undefined,
      repeatedFamilyCountRecent: 0,
      minutesSinceNearIdenticalActivity: undefined,
    });
    expect(retry.points).toBeLessThan(firstAttempt * 0.2);

    const review = calculateReward(
      context({
        activityType: "mistake_review",
        accuracy: undefined,
        previousAccuracy: undefined,
        reviewedMistakes: true,
        repeatedFamilyCountRecent: 3,
        topicRewardedSessionsRecent: 3,
      }),
      policy,
    );
    expect(review.points).toBeGreaterThanOrEqual(6);
    expect(review.reasonCodes).toEqual(["mistake_review"]);
  });
});

describe("relative value rules (spec section 16)", () => {
  it("improvement earns more than no improvement in the same context", () => {
    const flat = points(context({ previousAccuracy: 0.75, accuracy: 0.75 }));
    const better = points(context({ previousAccuracy: 0.5, accuracy: 0.75 }));
    expect(better).toBeGreaterThan(flat);
  });

  it("weak and developing topics earn more than mastered for the same easy activity", () => {
    const easy = { activityType: "short_practice", difficulty: "basic", accuracy: 0.9, previousAccuracy: 0.9 } as const;
    const mastered = points(context({ ...easy, masteryBefore: "mastered", masteryAfter: "mastered" }));
    for (const state of ["not_started", "learning", "developing", "almost_mastered"] as const) {
      expect(points(context({ ...easy, masteryBefore: state, masteryAfter: state }))).toBeGreaterThan(mastered);
    }
  });

  it("the fifth same-day repeat of easy mastered work earns under 20% of the first", () => {
    const repeat = (n: number) =>
      points(
        context({
          activityType: "targeted_practice",
          masteryBefore: "mastered",
          masteryAfter: "mastered",
          difficulty: "basic",
          accuracy: 0.95,
          previousAccuracy: 0.95,
          repeatedFamilyCountRecent: n,
          topicRewardedSessionsRecent: n,
        }),
      );
    const first = repeat(0);
    expect(first).toBeGreaterThan(0);
    expect(repeat(4)).toBeLessThan(first * 0.2);
    for (let n = 1; n <= 5; n += 1) expect(repeat(n)).toBeLessThanOrEqual(repeat(n - 1));
  });

  it("repeated mastered sessions across a window decay even when the family is new each time", () => {
    const session = (n: number) =>
      points(
        context({
          masteryBefore: "mastered",
          masteryAfter: "mastered",
          difficulty: "challenging",
          topicRewardedSessionsRecent: n,
        }),
      );
    expect(session(1)).toBeLessThan(session(0));
    expect(session(3)).toBe(0);
  });

  it("a challenging transfer earns more than an easy repeat on a mastered topic", () => {
    const base = { masteryBefore: "mastered", masteryAfter: "mastered", accuracy: 0.9, previousAccuracy: 0.9 } as const;
    const transfer = points(context({ ...base, difficulty: "challenging" }));
    const easyRepeat = points(context({ ...base, difficulty: "basic", repeatedFamilyCountRecent: 1, topicRewardedSessionsRecent: 1 }));
    expect(transfer).toBeGreaterThan(easyRepeat);
  });

  it("spaced retention earns more than an immediate repeat", () => {
    const spaced = points(scenarioD());
    const immediate = points({ ...scenarioD(), spacedReviewDue: false, topicRewardedSessionsRecent: 1, repeatedFamilyCountRecent: 1 });
    expect(spaced).toBeGreaterThan(immediate);
  });

  it("weak retention performance does not earn the retention reward", () => {
    const decision = calculateReward({ ...scenarioD(), accuracy: 0.4, previousAccuracy: undefined }, policy);
    expect(decision.reasonCodes).not.toContain("retention");
  });

  it("a repeat attempt earns much less than the first attempt", () => {
    const first = points(context({ activityType: "short_practice", masteryBefore: "learning", masteryAfter: "learning" }));
    const retry = points(
      context({ activityType: "short_practice", masteryBefore: "learning", masteryAfter: "learning", firstMeaningfulAttempt: false }),
    );
    expect(retry).toBeLessThan(first * 0.25);
    expect(calculateReward(context({ firstMeaningfulAttempt: false }), policy).antiFarmingDecisions.map((d) => d.rule)).toContain(
      "retry_attempt",
    );
  });

  it("retries earn no improvement or variety bonus", () => {
    const decision = calculateReward(
      context({ firstMeaningfulAttempt: false, previousAccuracy: 0.2, accuracy: 0.9, underPractisedRelevant: true }),
      policy,
    );
    expect(decision.reasonCodes).toEqual(["activity_completion"]);
  });

  it("healthy variety adds a bonus for relevant under-practised outcomes", () => {
    const plain = calculateReward(context({ previousAccuracy: 0.75 }), policy);
    const variety = calculateReward(context({ previousAccuracy: 0.75, underPractisedRelevant: true }), policy);
    expect(variety.points).toBeGreaterThan(plain.points);
    expect(variety.reasonCodes).toContain("healthy_variety");
  });
});

describe("first mastery", () => {
  const mastering = () =>
    context({ masteryBefore: "almost_mastered", masteryAfter: "mastered", accuracy: 0.9, previousAccuracy: 0.9 });

  it("pays the one-time bonus when mastery is first reached", () => {
    const decision = calculateReward(mastering(), policy);
    expect(decision.reasonCodes[0]).toBe("first_mastery");
    expect(decision.breakdown.find((item) => item.reason === "first_mastery")?.points).toBe(policy.masteryBonus);
  });

  it("does not pay again once awarded", () => {
    const decision = calculateReward({ ...mastering(), firstMasteryAlreadyAwarded: true }, policy);
    expect(decision.reasonCodes).not.toContain("first_mastery");
  });

  it("does not pay when the topic was already mastered", () => {
    const decision = calculateReward({ ...mastering(), masteryBefore: "mastered" }, policy);
    expect(decision.reasonCodes).not.toContain("first_mastery");
  });

  it("is not reduced by repetition decay or the activity cap", () => {
    const decision = calculateReward({ ...mastering(), repeatedFamilyCountRecent: 5, topicRewardedSessionsRecent: 5 }, policy);
    expect(decision.breakdown.find((item) => item.reason === "first_mastery")?.points).toBe(policy.masteryBonus);
  });
});

describe("Full Mock Mode", () => {
  const mock = () =>
    context({ activityType: "mock", accuracy: 0.8, previousAccuracy: 0.6, difficulty: "standard" });

  it("awards nothing during the attempt", () => {
    for (const resultsAvailable of [undefined, false]) {
      const decision = calculateReward({ ...mock(), resultsAvailable }, policy);
      expect(decision.points).toBe(0);
      expect(decision.reasonCodes).toEqual([]);
      expect(decision.recommendedNextAction).toBeUndefined();
      expect(decision.antiFarmingDecisions[0]?.rule).toBe("mock_in_progress");
    }
  });

  it("does not pay a mastery bonus during the attempt either", () => {
    const decision = calculateReward({ ...mock(), masteryBefore: "developing", masteryAfter: "mastered" }, policy);
    expect(decision.points).toBe(0);
  });

  it("is rewarded once results are available", () => {
    expect(calculateReward({ ...mock(), resultsAvailable: true }, policy).points).toBeGreaterThan(0);
  });
});

describe("other eligibility and safety rules", () => {
  it("a mistake review earns nothing until mistakes were reviewed", () => {
    const decision = calculateReward(context({ activityType: "mistake_review", reviewedMistakes: false }), policy);
    expect(decision.points).toBe(0);
    expect(decision.antiFarmingDecisions[0]?.rule).toBe("not_eligible");
  });

  it("near-identical activity inside the cooldown earns less", () => {
    const normal = points(context({ previousAccuracy: 0.75, masteryBefore: "mastered", masteryAfter: "mastered", difficulty: "challenging" }));
    const cooling = points(
      context({ previousAccuracy: 0.75, masteryBefore: "mastered", masteryAfter: "mastered", difficulty: "challenging", minutesSinceNearIdenticalActivity: 5 }),
    );
    const later = points(
      context({ previousAccuracy: 0.75, masteryBefore: "mastered", masteryAfter: "mastered", difficulty: "challenging", minutesSinceNearIdenticalActivity: 600 }),
    );
    expect(cooling).toBeLessThan(normal);
    expect(later).toBe(normal);
  });

  it("reliable low-effort evidence suppresses the award, without a nudge or mastery bonus", () => {
    const decision = calculateReward(
      context({ reliableLowEffortSignal: true, masteryBefore: "almost_mastered", masteryAfter: "mastered" }),
      policy,
    );
    expect(decision.points).toBe(0);
    expect(decision.recommendedNextAction).toBeUndefined();
  });

  it("caps a single activity and records why", () => {
    const decision = calculateReward(
      context({ activityType: "short_practice", masteryBefore: "learning", masteryAfter: "learning", difficulty: "challenging", previousAccuracy: 0, accuracy: 1, underPractisedRelevant: true, reviewedMistakes: true }),
      policy,
    );
    expect(decision.capped).toBe(true);
    expect(decision.capReason).toBe("activity_cap");
    expect(decision.points).toBe(policy.activityCap.short_practice);
  });

  it("does not report a cap when none applied", () => {
    const decision = calculateReward(scenarioD(), policy);
    expect(decision.capped).toBe(false);
    expect(decision.capReason).toBeUndefined();
  });

  it("rejects malformed contexts instead of guessing", () => {
    const bad: Partial<RewardContext>[] = [
      { accuracy: 1.2 },
      { accuracy: Number.NaN },
      { previousAccuracy: -0.1 },
      { repeatedFamilyCountRecent: -1 },
      { topicRewardedSessionsRecent: 1.5 },
      { sourceEventId: " " },
      { minutesSinceNearIdenticalActivity: -3 },
    ];
    for (const overrides of bad) {
      expect(() => calculateReward(context(overrides), policy)).toThrow(RewardContextError);
    }
  });
});

describe("determinism, integrity and transparency", () => {
  it("identical inputs give identical outputs, including key order", () => {
    const one = calculateReward(scenarioA(), policy);
    const two = calculateReward(structuredClone(scenarioA()), structuredClone(policy));
    expect(JSON.stringify(two)).toBe(JSON.stringify(one));
  });

  it("does not mutate the context", () => {
    const ctx = scenarioB();
    const before = structuredClone(ctx);
    calculateReward(ctx, policy);
    expect(ctx).toEqual(before);
  });

  it("records the policy version on every decision, including ineligible ones", () => {
    const decisions = [
      calculateReward(scenarioA(), policy),
      calculateReward(scenarioB(), policy),
      calculateReward(context({ activityType: "mock" }), policy),
      calculateReward(context({ activityType: "mistake_review" }), policy),
    ];
    for (const decision of decisions) expect(decision.policyVersion).toBe("rewards-v1");
    const custom: RewardPolicy = { ...policy, version: "rewards-test" };
    expect(calculateReward(scenarioA(), custom).policyVersion).toBe("rewards-test");
  });

  it("reads every number from the policy it is given", () => {
    const doubled: RewardPolicy = {
      ...policy,
      basePoints: { ...policy.basePoints, targeted_practice: 20 },
      activityCap: { ...policy.activityCap, targeted_practice: 100 },
    };
    const plain = context({ previousAccuracy: 0.75 });
    expect(calculateReward(plain, doubled).points).toBe(2 * calculateReward(plain, policy).points);
  });

  it("breakdown adds up to the points and reason codes list each reason once", () => {
    for (const ctx of [scenarioA(), scenarioB(), scenarioC(), scenarioD(), scenarioE()]) {
      const decision = calculateReward(ctx, policy);
      expect(decision.breakdown.reduce((sum, item) => sum + item.points, 0)).toBe(decision.points);
      expect(decision.reasonCodes).toEqual(decision.breakdown.map((item) => item.reason));
      expect(new Set(decision.reasonCodes).size).toBe(decision.reasonCodes.length);
    }
  });

  it("records the applied factors", () => {
    const decision = calculateReward(scenarioB(), policy);
    expect(decision.multipliers.mastery_need).toBe(0.3);
    expect(decision.multipliers.family_repetition).toBe(0.25);
    expect(decision.multipliers.topic_saturation).toBe(0.1);
    expect(decision.multipliers.difficulty_floor).toBe(0.5);
  });

  it("exhaustively yields whole, non-negative points and a version, with no NaN, across the input space", () => {
    let checked = 0;
    const violations: string[] = [];
    for (const activityType of ACTIVITY_TYPES)
      for (const masteryBefore of MASTERY_STATES)
        for (const masteryAfter of ["developing", "mastered", "retained"] as const)
          for (const difficulty of DIFFICULTIES)
            for (const first of [true, false])
              for (const accuracy of [undefined, 0, 0.7, 1])
                for (const previousAccuracy of [undefined, 0, 1])
                  for (const family of [0, 1, 7])
                    for (const sessions of [0, 2, 9])
                      for (const due of [true, false]) {
                        const decision = calculateReward(
                          context({
                            activityType, masteryBefore, masteryAfter, difficulty,
                            firstMeaningfulAttempt: first, accuracy, previousAccuracy,
                            repeatedFamilyCountRecent: family, topicRewardedSessionsRecent: sessions,
                            spacedReviewDue: due, reviewedMistakes: due, resultsAvailable: true,
                            underPractisedRelevant: !first,
                          }),
                          policy,
                        );
                        const wholePositive = decision.breakdown.every(
                          (item) => Number.isInteger(item.points) && item.points > 0,
                        );
                        const sums = decision.breakdown.reduce((sum, item) => sum + item.points, 0) === decision.points;
                        const finite = Object.values(decision.multipliers).every(Number.isFinite);
                        if (
                          !Number.isInteger(decision.points) || decision.points < 0 ||
                          !wholePositive || !sums || !finite || decision.policyVersion !== policy.version
                        ) {
                          violations.push(JSON.stringify({ activityType, masteryBefore, masteryAfter, difficulty, first, accuracy, previousAccuracy, family, sessions, due }));
                        }
                        checked += 1;
                      }
    expect(violations.slice(0, 3)).toEqual([]);
    expect(checked).toBeGreaterThan(10000);
  });

  it("rounds half up without floating-point dust", () => {
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(1.49)).toBe(1);
    // 2.4999999999999996 is 2.5 with floating-point dust, so it rounds up like 2.5.
    expect(roundHalfUp(2.4999999999999996)).toBe(3);
    expect(roundHalfUp(0)).toBe(0);
    expect(roundHalfUp(4.5)).toBe(5);
  });
});

describe("nudges", () => {
  const forbidden = /penalt|decay|multiplier|farm|cheat|lost|lose|formula|cooldown|saturat|limit|too many|stop trying/i;

  it("follows the spec priority and never uses shaming or formula wording", () => {
    const target = (id: string, label: string) => ({ outcomeId: id, label });
    const all = {
      weakOutcome: target("weak", "Fractions"),
      underPractisedOutcome: target("under", "Measurement"),
      mistakeReviewDue: true,
      retentionReview: target("ret", "Multiplication"),
      transferOutcome: target("transfer", "Word problems"),
    };
    const order = [
      ["practice_outcome", "weak"],
      ["practice_outcome", "under"],
      ["review_mistakes", undefined],
      ["retention_review", "ret"],
      ["try_harder_transfer", "transfer"],
      ["done_for_today", undefined],
    ] as const;
    let candidates: typeof all | Record<string, never> = { ...all };
    const steps: (keyof typeof all)[] = ["weakOutcome", "underPractisedOutcome", "mistakeReviewDue", "retentionReview", "transferOutcome"];
    for (let i = 0; i < order.length; i += 1) {
      const decision = calculateReward({ ...scenarioB(), nextActionCandidates: candidates }, policy);
      const [type, outcomeId] = order[i]!;
      expect(decision.recommendedNextAction?.action.type).toBe(type);
      expect(decision.recommendedNextAction?.action.outcomeId).toBe(outcomeId);
      expect(decision.recommendedNextAction?.message).not.toMatch(forbidden);
      const next: Record<string, unknown> = { ...candidates };
      const step = steps[i];
      if (step) delete next[step];
      candidates = next as typeof all;
    }
  });

  it("offers a natural stopping point when nothing else is due", () => {
    const decision = calculateReward({ ...scenarioB(), nextActionCandidates: undefined }, policy);
    expect(decision.recommendedNextAction?.action.type).toBe("done_for_today");
    expect(decision.recommendedNextAction?.message).toMatch(/good place to stop/);
  });

  it("uses gentle wording for repeats on topics that are not mastered", () => {
    const decision = calculateReward(
      { ...scenarioE(), nextActionCandidates: { underPractisedOutcome: { outcomeId: "m", label: "Measurement" } } },
      policy,
    );
    expect(decision.recommendedNextAction?.message).toBe(
      "Nice work. Try Measurement next to earn more points and keep growing.",
    );
  });

  it("does not nudge when yield is healthy", () => {
    expect(calculateReward(scenarioA(), policy).recommendedNextAction).toBeUndefined();
    expect(calculateReward(scenarioD(), policy).recommendedNextAction).toBeUndefined();
  });
});

describe("rewards-v1 fixtures", () => {
  // Reward changes need deterministic fixtures. If a policy value changes, publish a new version
  // and add new fixtures instead of editing these numbers.
  it.each([
    ["A weak improvement", scenarioA, 25, ["weak_area_recovery", "improvement", "activity_completion"]],
    ["B mastered easy repeat", scenarioB, 0, []],
    ["C mastered harder transfer", scenarioC, 10, ["stretch_challenge"]],
    ["D spaced retention", scenarioD, 9, ["retention"]],
    ["E rapid retries", scenarioE, 0, []],
  ] as const)("%s", (_name, build, expectedPoints, expectedReasons) => {
    const decision = calculateReward(build(), REWARD_POLICY_V1);
    expect(decision.points).toBe(expectedPoints);
    expect(decision.reasonCodes).toEqual(expectedReasons);
  });
});
