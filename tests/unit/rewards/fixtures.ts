import type { RewardContext } from "@/domain/rewards";

/** A neutral first attempt on a developing topic. Tests override what they care about. */
export function context(overrides: Partial<RewardContext> = {}): RewardContext {
  return {
    childId: "child-1",
    sourceEventId: "event-1",
    activityType: "targeted_practice",
    outcomeIds: ["outcome-fractions"],
    topicLabel: "Fractions",
    firstMeaningfulAttempt: true,
    accuracy: 0.75,
    previousAccuracy: 0.75,
    masteryBefore: "developing",
    masteryAfter: "developing",
    difficulty: "standard",
    repeatedFamilyCountRecent: 0,
    topicRewardedSessionsRecent: 0,
    spacedReviewDue: false,
    reviewedMistakes: false,
    firstMasteryAlreadyAwarded: false,
    ...overrides,
  };
}

/** Spec scenario A: weak fractions improve from 45% to 75%. */
export const scenarioA = (): RewardContext =>
  context({ previousAccuracy: 0.45, accuracy: 0.75, reviewedMistakes: true });

/** Spec scenario B: the third easy multiplication session today on a mastered topic. */
export const scenarioB = (): RewardContext =>
  context({
    activityType: "short_practice",
    topicLabel: "Multiplication",
    masteryBefore: "mastered",
    masteryAfter: "mastered",
    difficulty: "basic",
    accuracy: 0.95,
    previousAccuracy: 0.95,
    repeatedFamilyCountRecent: 2,
    topicRewardedSessionsRecent: 2,
    nextActionCandidates: { weakOutcome: { outcomeId: "outcome-fractions", label: "Fractions" } },
  });

/** Spec scenario C: a new challenging word-problem family on a mastered topic. */
export const scenarioC = (): RewardContext =>
  context({
    topicLabel: "Multiplication",
    masteryBefore: "mastered",
    masteryAfter: "mastered",
    difficulty: "challenging",
    accuracy: 0.8,
    previousAccuracy: 0.9,
  });

/** Spec scenario D: mastered 12 days ago, spaced review due, performs strongly. */
export const scenarioD = (): RewardContext =>
  context({
    activityType: "retention_check",
    topicLabel: "Multiplication",
    masteryBefore: "mastered",
    masteryAfter: "retained",
    spacedReviewDue: true,
    accuracy: 0.9,
    previousAccuracy: 0.9,
  });

/** Spec scenario E: several rapid retries of the same items after an incorrect first attempt. */
export const scenarioE = (): RewardContext =>
  context({
    activityType: "short_practice",
    firstMeaningfulAttempt: false,
    accuracy: 1,
    previousAccuracy: 0.4,
    repeatedFamilyCountRecent: 3,
    minutesSinceNearIdenticalActivity: 1,
  });
