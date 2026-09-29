/**
 * The versioned reward policy (spec section 5, ARCHITECTURE 17.3, ADR-0006).
 *
 * Policy is data. Every number that shapes a reward lives here, and the engine only reads it. These
 * are product parameters to tune from evidence, not educational facts. Changing any value means a
 * new version: add REWARD_POLICY_V2, never edit a published one, so old ledger entries stay
 * explainable by the version they recorded.
 */
import type { ActivityType, Difficulty, MasteryState } from "./entities";

export type RewardPolicy = {
  version: string;
  /** Base points by activity (spec section 5). */
  basePoints: Record<ActivityType, number>;
  /** Most points one activity can earn before the one-time mastery bonus. */
  activityCap: Record<ActivityType, number>;
  masteryNeedMultiplier: Record<MasteryState, number>;
  difficultyMultiplier: Record<Difficulty, number>;
  /** Factor for a first meaningful attempt. */
  firstMeaningfulAttempt: number;
  /** Factor for a repeat attempt on the same item or paper. */
  repeatAttempt: number;
  /** Completion credit rises from minFactor at 0% to 1 at fullCreditAt accuracy. */
  accuracy: { minFactor: number; fullCreditAt: number };
  improvement: {
    /** Smallest accuracy gain (0..1) that counts as improvement. */
    minGain: number;
    /** Bonus fraction earned per unit of gain. */
    scale: number;
    /** Largest bonus fraction. */
    bonusMax: number;
  };
  weakAreaRecovery: {
    weakStates: readonly MasteryState[];
    minGain: number;
    minAccuracy: number;
    /** Bonus fraction; needs a mistake review. */
    bonus: number;
  };
  /** Bonus fraction for relevant, under-practised outcomes. */
  varietyBonus: number;
  retention: {
    /** Bonus fraction for a strong spaced review. */
    bonus: number;
    minAccuracy: number;
    /** Replaces the mastered need multiplier when spacing is genuine. */
    needMultiplier: number;
  };
  stretch: {
    minDifficulty: Difficulty;
    /** Replaces the mastered need multiplier for a new harder family. */
    needMultiplier: number;
    minAccuracy: number;
  };
  /** Mistake review pays for the review itself, whatever the topic's mastery. */
  mistakeReviewNeedMultiplier: number;
  /** One-time whole-number bonus for verified first mastery. */
  masteryBonus: number;
  /** Factor by how many times the same question family was rewarded recently. Last value repeats. */
  sameFamilyDecay: readonly number[];
  /** Factor by rewarded sessions on a mastered topic in the window. Last value repeats. */
  masteredTopicSessionDecay: readonly number[];
  /** After mastery, work below this difficulty is under the floor. */
  masteredDifficultyFloor: { minDifficulty: Difficulty; belowFloorMultiplier: number };
  /** Near-identical activity inside the window earns the reduced factor. */
  cooldown: { windowMinutes: number; multiplier: number };
  /** Factor when robust low-effort evidence exists. */
  lowEffortMultiplier: number;
  /** A nudge is shown when anti-farming reduced the award or it is at most this many points. */
  lowYieldNudgeAtMostPoints: number;
};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

export const REWARD_POLICY_V1: RewardPolicy = deepFreeze({
  version: "rewards-v1",
  basePoints: {
    short_practice: 5,
    targeted_practice: 10,
    mock: 18,
    mistake_review: 6,
    retention_check: 6,
  },
  activityCap: {
    short_practice: 12,
    targeted_practice: 30,
    mock: 45,
    mistake_review: 12,
    retention_check: 15,
  },
  masteryNeedMultiplier: {
    not_started: 1.2,
    learning: 1.6,
    developing: 1.4,
    almost_mastered: 1.2,
    mastered: 0.3,
    retained: 0.2,
  },
  difficultyMultiplier: { basic: 1.0, standard: 1.15, challenging: 1.3 },
  firstMeaningfulAttempt: 1.0,
  repeatAttempt: 0.15,
  accuracy: { minFactor: 0.6, fullCreditAt: 0.7 },
  improvement: { minGain: 0.05, scale: 1.0, bonusMax: 0.5 },
  weakAreaRecovery: {
    weakStates: ["learning", "developing"],
    minGain: 0.2,
    minAccuracy: 0.6,
    bonus: 0.25,
  },
  varietyBonus: 0.15,
  retention: { bonus: 0.35, minAccuracy: 0.7, needMultiplier: 1.0 },
  stretch: { minDifficulty: "challenging", needMultiplier: 0.8, minAccuracy: 0.5 },
  mistakeReviewNeedMultiplier: 1.0,
  masteryBonus: 12,
  sameFamilyDecay: [1.0, 0.6, 0.25, 0.1],
  masteredTopicSessionDecay: [1.0, 0.35, 0.1, 0.0],
  masteredDifficultyFloor: { minDifficulty: "standard", belowFloorMultiplier: 0.5 },
  cooldown: { windowMinutes: 30, multiplier: 0.25 },
  lowEffortMultiplier: 0,
  lowYieldNudgeAtMostPoints: 3,
} satisfies RewardPolicy);

/**
 * Checks a policy is usable: finite non-negative numbers, factors that only ever shrink a reward
 * where they should, and non-empty non-increasing decay lists. Returns plain-language problems;
 * an empty list means valid.
 */
export function validateRewardPolicy(policy: RewardPolicy): string[] {
  const problems: string[] = [];
  const check = (path: string, value: number, max?: number) => {
    if (!Number.isFinite(value) || value < 0) problems.push(`${path} must be a number of 0 or more`);
    else if (max !== undefined && value > max) problems.push(`${path} must be at most ${max}`);
  };
  if (policy.version.trim() === "") problems.push("version is required");
  for (const [key, value] of Object.entries(policy.basePoints)) check(`basePoints.${key}`, value);
  for (const [key, value] of Object.entries(policy.activityCap)) {
    check(`activityCap.${key}`, value);
    if (Number.isFinite(value) && value < (policy.basePoints[key as ActivityType] ?? 0)) {
      problems.push(`activityCap.${key} must not be below its base points`);
    }
  }
  for (const [key, value] of Object.entries(policy.masteryNeedMultiplier)) check(`masteryNeedMultiplier.${key}`, value);
  for (const [key, value] of Object.entries(policy.difficultyMultiplier)) check(`difficultyMultiplier.${key}`, value);
  check("firstMeaningfulAttempt", policy.firstMeaningfulAttempt);
  check("repeatAttempt", policy.repeatAttempt, policy.firstMeaningfulAttempt);
  check("accuracy.minFactor", policy.accuracy.minFactor, 1);
  check("accuracy.fullCreditAt", policy.accuracy.fullCreditAt, 1);
  check("improvement.minGain", policy.improvement.minGain, 1);
  check("improvement.scale", policy.improvement.scale);
  check("improvement.bonusMax", policy.improvement.bonusMax);
  check("weakAreaRecovery.minGain", policy.weakAreaRecovery.minGain, 1);
  check("weakAreaRecovery.minAccuracy", policy.weakAreaRecovery.minAccuracy, 1);
  check("weakAreaRecovery.bonus", policy.weakAreaRecovery.bonus);
  check("varietyBonus", policy.varietyBonus);
  check("retention.bonus", policy.retention.bonus);
  check("retention.minAccuracy", policy.retention.minAccuracy, 1);
  check("retention.needMultiplier", policy.retention.needMultiplier);
  check("stretch.needMultiplier", policy.stretch.needMultiplier);
  check("stretch.minAccuracy", policy.stretch.minAccuracy, 1);
  check("mistakeReviewNeedMultiplier", policy.mistakeReviewNeedMultiplier);
  check("masteryBonus", policy.masteryBonus);
  if (!Number.isInteger(policy.masteryBonus)) problems.push("masteryBonus must be a whole number");
  check("masteredDifficultyFloor.belowFloorMultiplier", policy.masteredDifficultyFloor.belowFloorMultiplier, 1);
  check("cooldown.windowMinutes", policy.cooldown.windowMinutes);
  check("cooldown.multiplier", policy.cooldown.multiplier, 1);
  check("lowEffortMultiplier", policy.lowEffortMultiplier, 1);
  check("lowYieldNudgeAtMostPoints", policy.lowYieldNudgeAtMostPoints);
  for (const [name, list] of [
    ["sameFamilyDecay", policy.sameFamilyDecay],
    ["masteredTopicSessionDecay", policy.masteredTopicSessionDecay],
  ] as const) {
    if (list.length === 0) problems.push(`${name} needs at least one value`);
    list.forEach((value, index) => {
      check(`${name}[${index}]`, value, 1);
      const previous = list[index - 1];
      if (previous !== undefined && value > previous) problems.push(`${name} must not increase`);
    });
    if (list[0] !== undefined && list[0] !== 1) problems.push(`${name} must start at 1`);
  }
  return problems;
}
