/**
 * The anti-farming evaluator (PRD 15.5, spec section 4, ARCHITECTURE 17.5).
 *
 * Decides which reward factors apply to an activity so that repeating easy, mastered or duplicate
 * work earns sharply less, while genuine growth still pays. The normal response is a smaller award
 * plus a redirect, never a punishment. Pure: the same context and policy give the same answer.
 */
import {
  DIFFICULTIES,
  type AntiFarmingDecision,
  type Difficulty,
  type MasteryState,
  type RewardContext,
} from "./entities";
import type { RewardPolicy } from "./reward-policy";

export type AntiFarmingFactors = {
  attempt: number;
  familyRepetition: number;
  topicSaturation: number;
  difficultyFloor: number;
  cooldown: number;
  lowEffort: number;
};

export type AntiFarmingEvaluation = {
  /** False when no reward can be earned yet; `decisions` says why. */
  eligible: boolean;
  factors: AntiFarmingFactors;
  /** A strong review after a real gap: mastered work that is due again and went well. */
  spacedRetention: boolean;
  /** Harder work in a new question family on a mastered topic. */
  stretch: boolean;
  decisions: AntiFarmingDecision[];
};

export function isMasteredState(state: MasteryState): boolean {
  return state === "mastered" || state === "retained";
}

function difficultyRank(difficulty: Difficulty): number {
  return DIFFICULTIES.indexOf(difficulty);
}

/** Looks up a decay list by count; counts past the end keep the last value. */
export function decayFactor(list: readonly number[], count: number): number {
  const index = Math.min(Math.max(0, Math.floor(count)), list.length - 1);
  return list[index] ?? 1;
}

function reducedEffect(factor: number): "reduced" | "suppressed" {
  return factor === 0 ? "suppressed" : "reduced";
}

/** Mastered work that is due again and went well earns the retention reward. */
export function qualifiesForSpacedRetention(context: RewardContext, policy: RewardPolicy): boolean {
  return (
    isMasteredState(context.masteryBefore) &&
    context.spacedReviewDue &&
    context.firstMeaningfulAttempt &&
    context.accuracy !== undefined &&
    context.accuracy >= policy.retention.minAccuracy
  );
}

/** Harder work in a new family on a mastered topic keeps a moderate reward. */
export function qualifiesForStretch(context: RewardContext, policy: RewardPolicy): boolean {
  return (
    isMasteredState(context.masteryBefore) &&
    context.firstMeaningfulAttempt &&
    context.repeatedFamilyCountRecent === 0 &&
    difficultyRank(context.difficulty) >= difficultyRank(policy.stretch.minDifficulty) &&
    (context.accuracy === undefined || context.accuracy >= policy.stretch.minAccuracy)
  );
}

export type RecoveryEvaluation = {
  /** Real recovery of a weak area, with the mistake review that some recovery rewards require. */
  qualifies: boolean;
  /** Recovery happened but the reward is held until mistakes are reviewed. */
  blockedByMistakeReview: boolean;
};

export function evaluateWeakAreaRecovery(context: RewardContext, policy: RewardPolicy): RecoveryEvaluation {
  const recovered =
    policy.weakAreaRecovery.weakStates.includes(context.masteryBefore) &&
    context.firstMeaningfulAttempt &&
    context.accuracy !== undefined &&
    context.previousAccuracy !== undefined &&
    context.accuracy - context.previousAccuracy >= policy.weakAreaRecovery.minGain &&
    context.accuracy >= policy.weakAreaRecovery.minAccuracy;
  return {
    qualifies: recovered && context.reviewedMistakes,
    blockedByMistakeReview: recovered && !context.reviewedMistakes,
  };
}

export function evaluateAntiFarming(context: RewardContext, policy: RewardPolicy): AntiFarmingEvaluation {
  const decisions: AntiFarmingDecision[] = [];
  const factors: AntiFarmingFactors = {
    attempt: policy.firstMeaningfulAttempt,
    familyRepetition: 1,
    topicSaturation: 1,
    difficultyFloor: 1,
    cooldown: 1,
    lowEffort: 1,
  };
  const none = { spacedRetention: false, stretch: false };

  // Full Mock Mode awards nothing during the attempt; the reward is computed after results.
  if (context.activityType === "mock" && context.resultsAvailable !== true) {
    decisions.push({ rule: "mock_in_progress", effect: "withheld", factor: 0 });
    return { eligible: false, factors, ...none, decisions };
  }
  // A mistake review earns only when mistakes were actually reviewed.
  if (context.activityType === "mistake_review" && !context.reviewedMistakes) {
    decisions.push({ rule: "not_eligible", effect: "withheld", factor: 0 });
    return { eligible: false, factors, ...none, decisions };
  }

  const spacedRetention = qualifiesForSpacedRetention(context, policy);
  const stretch = qualifiesForStretch(context, policy);
  // A review pays for the review itself; spacing already separates it from repeats.
  const isReview = context.activityType === "mistake_review";
  const repetitionApplies = !isReview && !spacedRetention;

  if (!context.firstMeaningfulAttempt) {
    factors.attempt = policy.repeatAttempt;
    decisions.push({ rule: "retry_attempt", effect: reducedEffect(policy.repeatAttempt), factor: policy.repeatAttempt });
  }

  if (!isReview) {
    factors.familyRepetition = decayFactor(policy.sameFamilyDecay, context.repeatedFamilyCountRecent);
    if (factors.familyRepetition < 1) {
      decisions.push({
        rule: "family_repetition",
        effect: reducedEffect(factors.familyRepetition),
        factor: factors.familyRepetition,
      });
    }
  }

  if (repetitionApplies && isMasteredState(context.masteryBefore)) {
    factors.topicSaturation = decayFactor(policy.masteredTopicSessionDecay, context.topicRewardedSessionsRecent);
    if (factors.topicSaturation < 1) {
      decisions.push({
        rule: "topic_saturation",
        effect: reducedEffect(factors.topicSaturation),
        factor: factors.topicSaturation,
      });
    }
    if (
      difficultyRank(context.difficulty) < difficultyRank(policy.masteredDifficultyFloor.minDifficulty)
    ) {
      factors.difficultyFloor = policy.masteredDifficultyFloor.belowFloorMultiplier;
      decisions.push({
        rule: "difficulty_floor",
        effect: reducedEffect(factors.difficultyFloor),
        factor: factors.difficultyFloor,
      });
    }
  }

  if (
    repetitionApplies &&
    context.minutesSinceNearIdenticalActivity !== undefined &&
    context.minutesSinceNearIdenticalActivity < policy.cooldown.windowMinutes
  ) {
    factors.cooldown = policy.cooldown.multiplier;
    decisions.push({
      rule: "near_identical_cooldown",
      effect: reducedEffect(factors.cooldown),
      factor: factors.cooldown,
    });
  }

  if (context.reliableLowEffortSignal === true) {
    factors.lowEffort = policy.lowEffortMultiplier;
    decisions.push({
      rule: "low_effort_evidence",
      effect: reducedEffect(factors.lowEffort),
      factor: factors.lowEffort,
    });
  }

  if (evaluateWeakAreaRecovery(context, policy).blockedByMistakeReview) {
    decisions.push({ rule: "recovery_needs_mistake_review", effect: "withheld", factor: 1 });
  }

  return { eligible: true, factors, spacedRetention, stretch, decisions };
}
