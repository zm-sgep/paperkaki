/**
 * Reward domain types (docs/GAMIFICATION_REWARDS_SPEC.md, ARCHITECTURE section 17, ADR-0006).
 *
 * Pure types only. Nothing here reads a database, a clock or a network. Mastery is owned by the
 * mastery domain; the reward domain only reads the states it is handed.
 */

/** Academic mastery states (spec section 2). Ordered from least to most secure. */
export const MASTERY_STATES = [
  "not_started",
  "learning",
  "developing",
  "almost_mastered",
  "mastered",
  "retained",
] as const;
export type MasteryState = (typeof MASTERY_STATES)[number];

export const DIFFICULTIES = ["basic", "standard", "challenging"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/**
 * Activity kinds, named after the policy's base-points keys (spec section 5). The architecture
 * sketch used the coarser "practice | review | retention"; the spec's finer names win because the
 * policy prices short and targeted practice differently.
 */
export const ACTIVITY_TYPES = [
  "short_practice",
  "targeted_practice",
  "mock",
  "mistake_review",
  "retention_check",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Reason codes (spec section 3), plus `manual_correction` for compensating entries. */
export const REWARD_REASONS = [
  "activity_completion",
  "improvement",
  "first_mastery",
  "weak_area_recovery",
  "mistake_review",
  "retention",
  "healthy_variety",
  "stretch_challenge",
  "manual_parent_bonus",
  "reward_redemption",
  "reward_refund",
  "manual_correction",
] as const;
export type RewardReason = (typeof REWARD_REASONS)[number];

/** Reasons the RewardEngine itself can award. The rest come from parents, redemptions or corrections. */
export const LEARNING_REASONS = [
  "activity_completion",
  "improvement",
  "first_mastery",
  "weak_area_recovery",
  "mistake_review",
  "retention",
  "healthy_variety",
  "stretch_challenge",
] as const;
export type LearningReason = (typeof LEARNING_REASONS)[number];

/** A place the child could go next, supplied by the recommendations domain (spec section 8). */
export type NextActionTarget = {
  outcomeId: string;
  /** Child-friendly name, for example "Fractions". Never an internal id. */
  label: string;
};

/**
 * What the caller knows about where the child could usefully go next. The engine only picks
 * between these by the spec's priority order; it never invents a target.
 */
export type NextActionCandidates = {
  /** 1. A weak outcome for an upcoming assessment. */
  weakOutcome?: NextActionTarget | undefined;
  /** 2. An under-practised required outcome. */
  underPractisedOutcome?: NextActionTarget | undefined;
  /** 3. Mistakes waiting to be reviewed. */
  mistakeReviewDue?: boolean | undefined;
  /** 4. A mastered outcome whose spaced review is due. */
  retentionReview?: NextActionTarget | undefined;
  /** 5. A harder transfer activity in a mastered topic. */
  transferOutcome?: NextActionTarget | undefined;
};

export type RewardContext = {
  childId: string;
  /** Stable id of the event that triggers this reward. One event, at most one award. */
  sourceEventId: string;
  activityType: ActivityType;
  outcomeIds: readonly string[];
  /** Child-friendly topic name used in nudges, for example "Multiplication". */
  topicLabel?: string | undefined;
  /** False for retries of an item or paper the child has already attempted meaningfully. */
  firstMeaningfulAttempt: boolean;
  /**
   * True once marked results exist. Full mocks earn nothing while the attempt is in progress, so
   * a mock context must set this to true to be rewarded. Defaults to true for other activities.
   */
  resultsAvailable?: boolean | undefined;
  /** 0..1. */
  accuracy?: number | undefined;
  /** 0..1, on the same outcomes before this activity. */
  previousAccuracy?: number | undefined;
  masteryBefore: MasteryState;
  masteryAfter: MasteryState;
  difficulty: Difficulty;
  /** Times the same question family was already rewarded in the recent window. */
  repeatedFamilyCountRecent: number;
  /** Rewarded sessions already on this topic in the current window (for example today). */
  topicRewardedSessionsRecent: number;
  spacedReviewDue: boolean;
  reviewedMistakes: boolean;
  /** The one-time mastery bonus was already paid for this outcome. */
  firstMasteryAlreadyAwarded: boolean;
  /** The outcome is relevant to the child's assessment and under-practised. */
  underPractisedRelevant?: boolean | undefined;
  /** Minutes since a near-identical activity (same outcomes and difficulty) ended. */
  minutesSinceNearIdenticalActivity?: number | undefined;
  /** Only true when robust evidence of random answering exists. Never inferred from speed alone. */
  reliableLowEffortSignal?: boolean | undefined;
  nextActionCandidates?: NextActionCandidates | undefined;
};

export type RecommendedActionType =
  | "practice_outcome"
  | "review_mistakes"
  | "retention_review"
  | "try_harder_transfer"
  | "done_for_today";

export type RecommendedLearningAction = {
  /** Encouraging, child-safe wording. Never mentions formulas, penalties or points lost. */
  message: string;
  action: { type: RecommendedActionType; outcomeId?: string };
};

export type AntiFarmingRule =
  | "mock_in_progress"
  | "not_eligible"
  | "retry_attempt"
  | "family_repetition"
  | "topic_saturation"
  | "difficulty_floor"
  | "near_identical_cooldown"
  | "recovery_needs_mistake_review"
  | "low_effort_evidence";

/** One anti-farming call the engine made, recorded for transparency (PRD 15.12). */
export type AntiFarmingDecision = {
  rule: AntiFarmingRule;
  effect: "reduced" | "suppressed" | "withheld";
  /** Factor applied, 1 when nothing was multiplied. */
  factor: number;
};

export type RewardBreakdownItem = { reason: LearningReason; points: number };

export type RewardDecision = {
  /** Whole, non-negative. */
  points: number;
  reasonCodes: RewardReason[];
  /** Points per reason, summing to `points`. */
  breakdown: RewardBreakdownItem[];
  policyVersion: string;
  /** Every factor applied, in calculation order. */
  multipliers: Record<string, number>;
  antiFarmingDecisions: AntiFarmingDecision[];
  capped: boolean;
  capReason?: string;
  recommendedNextAction?: RecommendedLearningAction;
};

// --- Ledger ---------------------------------------------------------------

/** Where a ledger entry came from. Manual bonuses are analytically separate from learning. */
export type LedgerOrigin = "learning" | "parent_bonus" | "redemption" | "correction";

/** An entry before storage assigns it identity. Amounts are whole and never zero. */
export type LedgerEntry = {
  id: string;
  childId: string;
  /** Positive earns, negative spends. Whole and non-zero. */
  amount: number;
  reasonCode: RewardReason;
  origin: LedgerOrigin;
  /** Idempotency key, unique per child. Required for every entry. */
  sourceEventId: string;
  /** Required for learning entries. */
  policyVersion?: string | undefined;
  masteryBefore?: MasteryState | undefined;
  masteryAfter?: MasteryState | undefined;
  /** Full calculation record for transparency; plain JSON. */
  calculation?: Record<string, unknown> | undefined;
  note?: string | undefined;
  /** Set on compensating entries: the entry this one reverses. At most one reversal each. */
  compensatesEntryId?: string | undefined;
  /** ISO timestamp supplied by the caller. */
  createdAt: string;
};

// --- Redemption -----------------------------------------------------------

export const REDEMPTION_STATUSES = [
  "requested",
  "approved",
  "fulfilled",
  "rejected",
  "cancelled",
] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];

export type Redemption = {
  id: string;
  rewardId: string;
  childId: string;
  /** The parent who owns the reward and is the only one who may decide the request. */
  ownerParentId: string;
  status: RedemptionStatus;
  /** Cost when requested; later catalogue edits do not change it. */
  pointsCostSnapshot: number;
  requestedAt: string;
  decidedAt?: string | undefined;
  fulfilledAt?: string | undefined;
  decisionNote?: string | undefined;
  debitLedgerEntryId?: string | undefined;
  refundLedgerEntryId?: string | undefined;
};

export type RedemptionActor =
  | { role: "parent"; parentId: string }
  | { role: "child"; childId: string };
