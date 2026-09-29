import type { Difficulty } from "@/schemas/question-content";

/**
 * Mastery policy v1. Every threshold lives here, nowhere else. Changing a number is a policy
 * change: bump the version and add a fixture, never edit v1 in place after release.
 */
export const MASTERY_POLICY_V1 = {
  version: "mastery-policy-v1",

  /** Only the newest N first-attempt items decide accuracy, so mastery can drop. */
  recentWindow: 10,
  /** Each step back in time multiplies an item's weight by this (newest item = 1). */
  recencyDecay: 0.9,
  /** Harder items say more about understanding. */
  difficultyWeight: { basic: 1, standard: 1.5, challenging: 2 } satisfies Record<Difficulty, number>,

  /** Below this many first-attempt items an outcome stays "learning": too little evidence. */
  minItemsForBands: 3,
  /** Weighted recent accuracy lower bounds. */
  bands: { developing: 0.4, almostMastered: 0.65, mastered: 0.8 },

  /** Everything "mastered" needs on top of accuracy. Counted over all first-attempt items. */
  masteredNeeds: {
    minItems: 5,
    minSessions: 2,
    /** Different Singapore calendar days. */
    minDays: 2,
    minFamilies: 2,
    /** At least one standard or challenging item. */
    minNonBasicItems: 1,
  },
  /** One session alone can never show more than this. */
  singleSessionCeiling: "developing",

  retention: {
    /** A fully correct first attempt at least this long after mastery is "retained". */
    minScoreRatio: 1,
    /** Days after mastery for the first review, then after each successful spaced review. */
    reviewIntervalsDays: [7, 21],
  },

  /** Singapore is UTC+8: "different days" means Singapore calendar days. */
  dayBoundaryUtcOffsetHours: 8,
} as const;

export type MasteryPolicy = typeof MASTERY_POLICY_V1;
