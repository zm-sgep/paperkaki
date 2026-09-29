/**
 * The deterministic RewardEngine (spec sections 5-8, ARCHITECTURE 17.2, ADR-0006).
 *
 * `calculateReward` is a pure function of a context and a versioned policy. No clock, randomness,
 * database or model is involved, so every decision can be replayed from its inputs and the policy
 * version it records. Points are always whole and never negative.
 *
 * Calculation order follows spec section 6:
 *   base -> eligibility -> first-attempt factor -> mastery need -> difficulty -> accuracy
 *   -> bonuses (improvement, recovery, retention, variety) -> family repetition -> topic saturation
 *   -> difficulty floor / cooldown -> activity cap -> one-time mastery bonus -> deterministic rounding.
 */
import {
  ACTIVITY_TYPES,
  DIFFICULTIES,
  MASTERY_STATES,
  type LearningReason,
  type RecommendedLearningAction,
  type RewardBreakdownItem,
  type RewardContext,
  type RewardDecision,
} from "./entities";
import {
  evaluateAntiFarming,
  evaluateWeakAreaRecovery,
  isMasteredState,
} from "./anti-farming";
import type { RewardPolicy } from "./reward-policy";

/** The context was malformed, so no decision can be trusted. Callers must not award points. */
export class RewardContextError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid reward context: ${problems.join("; ")}`);
    this.name = "RewardContextError";
    this.problems = problems;
  }
}

export function validateRewardContext(context: RewardContext): string[] {
  const problems: string[] = [];
  if (context.childId.trim() === "") problems.push("childId is required");
  if (context.sourceEventId.trim() === "") problems.push("sourceEventId is required");
  if (!ACTIVITY_TYPES.includes(context.activityType)) problems.push("activityType is unknown");
  if (!DIFFICULTIES.includes(context.difficulty)) problems.push("difficulty is unknown");
  if (!MASTERY_STATES.includes(context.masteryBefore)) problems.push("masteryBefore is unknown");
  if (!MASTERY_STATES.includes(context.masteryAfter)) problems.push("masteryAfter is unknown");
  for (const [name, value] of [
    ["accuracy", context.accuracy],
    ["previousAccuracy", context.previousAccuracy],
  ] as const) {
    if (value !== undefined && !(Number.isFinite(value) && value >= 0 && value <= 1)) {
      problems.push(`${name} must be between 0 and 1`);
    }
  }
  for (const [name, value] of [
    ["repeatedFamilyCountRecent", context.repeatedFamilyCountRecent],
    ["topicRewardedSessionsRecent", context.topicRewardedSessionsRecent],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) problems.push(`${name} must be a whole number of 0 or more`);
  }
  const minutes = context.minutesSinceNearIdenticalActivity;
  if (minutes !== undefined && !(Number.isFinite(minutes) && minutes >= 0)) {
    problems.push("minutesSinceNearIdenticalActivity must be 0 or more");
  }
  return problems;
}

/** Round half up on a non-negative number, ignoring floating-point dust. */
export function roundHalfUp(value: number): number {
  return Math.floor(Math.round(value * 1e9) / 1e9 + 0.5);
}

/** When several reasons apply, the earliest here is the headline reason. */
const REASON_PRIORITY: readonly LearningReason[] = [
  "first_mastery",
  "weak_area_recovery",
  "improvement",
  "retention",
  "stretch_challenge",
  "mistake_review",
  "healthy_variety",
  "activity_completion",
];

/**
 * Splits a fractional total into whole points per reason so the parts sum exactly to the rounded
 * total. Largest remainder wins; ties go to the earlier reason in priority order.
 */
function allocateWholePoints(parts: ReadonlyMap<LearningReason, number>): RewardBreakdownItem[] {
  const ordered = REASON_PRIORITY.filter((reason) => (parts.get(reason) ?? 0) > 0).map((reason) => ({
    reason,
    exact: Math.round((parts.get(reason) ?? 0) * 1e9) / 1e9,
  }));
  const total = roundHalfUp(ordered.reduce((sum, item) => sum + item.exact, 0));
  const items = ordered.map((item) => ({ ...item, points: Math.floor(item.exact) }));
  let leftover = total - items.reduce((sum, item) => sum + item.points, 0);
  const byRemainder = items
    .map((item, index) => ({ index, remainder: item.exact - item.points }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; leftover > 0 && byRemainder.length > 0; i = (i + 1) % byRemainder.length) {
    const target = byRemainder[i];
    if (target) items[target.index]!.points += 1;
    leftover -= 1;
  }
  return items.filter((item) => item.points > 0).map(({ reason, points }) => ({ reason, points }));
}

function buildNextAction(context: RewardContext): RecommendedLearningAction {
  const strong = isMasteredState(context.masteryBefore);
  const opening = strong
    ? context.topicLabel
      ? `You're already strong in ${context.topicLabel}.`
      : "You're already strong here."
    : "Nice work.";
  const candidates = context.nextActionCandidates ?? {};

  const first = candidates.weakOutcome ?? candidates.underPractisedOutcome;
  if (first) {
    return {
      message: `${opening} Try ${first.label} next to earn more points and keep growing.`,
      action: { type: "practice_outcome", outcomeId: first.outcomeId },
    };
  }
  if (candidates.mistakeReviewDue && context.activityType !== "mistake_review") {
    return {
      message: `${opening} Looking back at your mistakes is a smart next step and earns more points.`,
      action: { type: "review_mistakes" },
    };
  }
  if (candidates.retentionReview) {
    return {
      message: `${opening} A quick refresher on ${candidates.retentionReview.label} after a break is strong learning and earns more points.`,
      action: { type: "retention_review", outcomeId: candidates.retentionReview.outcomeId },
    };
  }
  if (candidates.transferOutcome) {
    return {
      message: `${opening} Try a new challenge in ${candidates.transferOutcome.label} to keep growing.`,
      action: { type: "try_harder_transfer", outcomeId: candidates.transferOutcome.outcomeId },
    };
  }
  return {
    message: "Great job today. That was productive learning, and this is a good place to stop.",
    action: { type: "done_for_today" },
  };
}

const NUDGE_TRIGGER_RULES = new Set([
  "retry_attempt",
  "family_repetition",
  "topic_saturation",
  "difficulty_floor",
  "near_identical_cooldown",
]);

export function calculateReward(context: RewardContext, policy: RewardPolicy): RewardDecision {
  const problems = validateRewardContext(context);
  if (problems.length > 0) throw new RewardContextError(problems);

  const evaluation = evaluateAntiFarming(context, policy);
  const decision: RewardDecision = {
    points: 0,
    reasonCodes: [],
    breakdown: [],
    policyVersion: policy.version,
    multipliers: {},
    antiFarmingDecisions: evaluation.decisions,
    capped: false,
  };
  if (!evaluation.eligible) return decision;

  const { factors } = evaluation;
  const isReview = context.activityType === "mistake_review";

  // Steps 1-5: base, first-attempt factor, mastery need, difficulty, accuracy.
  let need = isReview
    ? policy.mistakeReviewNeedMultiplier
    : policy.masteryNeedMultiplier[context.masteryBefore];
  if (evaluation.spacedRetention) need = Math.max(need, policy.retention.needMultiplier);
  if (evaluation.stretch) need = Math.max(need, policy.stretch.needMultiplier);
  const difficulty = policy.difficultyMultiplier[context.difficulty];
  const accuracyFactor =
    context.accuracy === undefined
      ? 1
      : policy.accuracy.minFactor +
        (1 - policy.accuracy.minFactor) * Math.min(1, context.accuracy / policy.accuracy.fullCreditAt);
  const core =
    policy.basePoints[context.activityType] * factors.attempt * need * difficulty * accuracyFactor;

  // Steps 6-7: bonuses are fractions of the core, and only first meaningful attempts earn them.
  let improvementBonus = 0;
  let recoveryBonus = 0;
  let retentionBonus = 0;
  let varietyBonus = 0;
  if (context.firstMeaningfulAttempt) {
    if (context.accuracy !== undefined && context.previousAccuracy !== undefined) {
      const gain = context.accuracy - context.previousAccuracy;
      if (gain >= policy.improvement.minGain) {
        improvementBonus = Math.min(policy.improvement.bonusMax, gain * policy.improvement.scale);
      }
    }
    if (evaluateWeakAreaRecovery(context, policy).qualifies) recoveryBonus = policy.weakAreaRecovery.bonus;
    if (evaluation.spacedRetention) retentionBonus = policy.retention.bonus;
    if (context.underPractisedRelevant === true) varietyBonus = policy.varietyBonus;
  }

  const coreReason: LearningReason = isReview
    ? "mistake_review"
    : evaluation.spacedRetention
      ? "retention"
      : evaluation.stretch
        ? "stretch_challenge"
        : "activity_completion";
  const parts = new Map<LearningReason, number>();
  const add = (reason: LearningReason, amount: number) => {
    if (amount > 0) parts.set(reason, (parts.get(reason) ?? 0) + amount);
  };
  add(coreReason, core);
  add("improvement", core * improvementBonus);
  add("weak_area_recovery", core * recoveryBonus);
  add("retention", core * retentionBonus);
  add("healthy_variety", core * varietyBonus);

  // Steps 8-9: repetition and saturation decay (plus the difficulty floor, cooldown and low-effort factors).
  const decay =
    factors.familyRepetition *
    factors.topicSaturation *
    factors.difficultyFloor *
    factors.cooldown *
    factors.lowEffort;
  let scale = decay;

  // Step 10: activity cap.
  const cap = policy.activityCap[context.activityType];
  const decayedTotal = [...parts.values()].reduce((sum, value) => sum + value, 0) * decay;
  let capScale = 1;
  if (decayedTotal > cap) {
    capScale = cap / decayedTotal;
    scale *= capScale;
    decision.capped = true;
    decision.capReason = "activity_cap";
  }
  for (const [reason, value] of parts) parts.set(reason, value * scale);

  // Step 11: one-time verified mastery bonus, outside decay and cap.
  const masteryBonusEarned =
    isMasteredState(context.masteryAfter) &&
    !isMasteredState(context.masteryBefore) &&
    !context.firstMasteryAlreadyAwarded &&
    factors.lowEffort > 0;

  // Step 12: deterministic rounding to whole points.
  const breakdown = allocateWholePoints(parts);
  if (masteryBonusEarned && policy.masteryBonus > 0) {
    breakdown.unshift({ reason: "first_mastery", points: policy.masteryBonus });
  }
  breakdown.sort((a, b) => REASON_PRIORITY.indexOf(a.reason) - REASON_PRIORITY.indexOf(b.reason));

  decision.breakdown = breakdown;
  decision.reasonCodes = breakdown.map((item) => item.reason);
  decision.points = breakdown.reduce((sum, item) => sum + item.points, 0);

  // Step 13: record every factor applied.
  decision.multipliers = {
    attempt: factors.attempt,
    mastery_need: need,
    difficulty,
    accuracy: accuracyFactor,
    improvement_bonus: improvementBonus,
    weak_area_recovery_bonus: recoveryBonus,
    retention_bonus: retentionBonus,
    variety_bonus: varietyBonus,
    family_repetition: factors.familyRepetition,
    topic_saturation: factors.topicSaturation,
    difficulty_floor: factors.difficultyFloor,
    cooldown: factors.cooldown,
    low_effort: factors.lowEffort,
    activity_cap: capScale,
  };

  // Nudge: when yield is low because of mastery or repetition, redirect constructively.
  const learningPoints = decision.points - (masteryBonusEarned ? policy.masteryBonus : 0);
  const lowEffort = factors.lowEffort < 1;
  const lowYield =
    evaluation.decisions.some((entry) => NUDGE_TRIGGER_RULES.has(entry.rule)) ||
    learningPoints <= policy.lowYieldNudgeAtMostPoints;
  if (lowYield && !lowEffort) decision.recommendedNextAction = buildNextAction(context);

  return decision;
}
