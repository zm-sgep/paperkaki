import { MASTERY_POLICY_V1 } from "./policy";
import { MASTERY_STATE_RANK, type MasteryState, type OutcomeMastery } from "./types";

/**
 * Mastery in words and pictures. One place for the six states' plain words, the child's stars, and how a
 * topic's state follows from its outcomes. Pure and deterministic: screens show what is worked out here.
 *
 * Words for the parent: Not started, Learning, Getting there, Almost there, Secure, Remembered.
 * The child sees the same words but never the word "mastery", numbers or percentages.
 */

export const MASTERY_STATE_WORDS: Record<MasteryState, string> = {
  not_started: "Not started",
  learning: "Learning",
  developing: "Getting there",
  almost_mastered: "Almost there",
  mastered: "Secure",
  retained: "Remembered",
};

/** A sentence-length explanation, for a tooltip or a line beneath the word. */
export const MASTERY_STATE_HELP: Record<MasteryState, string> = {
  not_started: "No questions answered yet.",
  learning: "Still finding their feet with this.",
  developing: "Some of it is right. A little more practice will help.",
  almost_mastered: "Nearly there. A bit more variety will make it secure.",
  mastered: "Right again and again, on different questions and different days.",
  retained: "Still right after some time has passed.",
};

/** The child's picture: 0 to 4 filled stars. */
export const MASTERY_STATE_STARS: Record<MasteryState, number> = {
  not_started: 0,
  learning: 1,
  developing: 2,
  almost_mastered: 3,
  mastered: 4,
  retained: 4,
};

export const MAX_STARS = 4;

export function starsForState(state: MasteryState): number {
  return MASTERY_STATE_STARS[state];
}

/**
 * The state as far as practice and attention are concerned. The mastery rules keep an outcome at "learning"
 * until it has three answers, and at "getting there" until a second session, however well it went. That is
 * right for mastery, but it is not a reason to worry: a skill answered right so far is not one that "needs
 * attention". So a skill that is doing well is shown to the practice and attention rules as
 *   - "almost there" when there is enough to say so, or
 *   - "not started" (nothing worrying, nothing settled) when there is too little.
 * A skill answered badly keeps its state.
 */
export function attentionStateOf(outcome: Pick<OutcomeMastery, "state" | "evidenceCount" | "recentAccuracy">): MasteryState {
  if (outcome.state !== "learning" && outcome.state !== "developing") return outcome.state;
  if (outcome.recentAccuracy === undefined || outcome.recentAccuracy < MASTERY_POLICY_V1.bands.almostMastered) return outcome.state;
  return outcome.evidenceCount >= MASTERY_POLICY_V1.minItemsForBands ? "almost_mastered" : "not_started";
}

export type TopicMastery = {
  /** The topic's state by the mastery rules over all its evidence. */
  state: MasteryState;
  /** The state practice and attention go by (see `attentionStateOf`). */
  attention: MasteryState;
  stars: number;
  /** Weighted recent accuracy 0..1 over the topic's evidence. For ordering only; never shown. */
  recentAccuracy?: number;
  /** ISO 8601, the newest practice on any skill of the topic. */
  lastPracticedAt?: string;
  /** ISO 8601, when the topic's spaced review is due, once it is secure. */
  reviewDueAt?: string;
  /** First-attempt answers the state rests on, and the sessions they came from. */
  evidenceCount: number;
  sessions: number;
};

/**
 * A topic is judged on all its evidence together (the same rules as a skill), and is never called secure
 * or remembered while some skill the bank can test has not been seen at all: "almost there" is as far as it
 * goes until every skill has been tried.
 */
export function topicMasteryOf(input: { pooled: OutcomeMastery; testableCount: number; coveredCount: number }): TopicMastery {
  const { pooled } = input;
  const capped = input.coveredCount < input.testableCount && MASTERY_STATE_RANK[pooled.state] > MASTERY_STATE_RANK.almost_mastered;
  const state: MasteryState = capped ? "almost_mastered" : pooled.state;
  const attention = attentionStateOf({ state, evidenceCount: pooled.evidenceCount, ...(pooled.recentAccuracy !== undefined ? { recentAccuracy: pooled.recentAccuracy } : {}) });
  return {
    state,
    attention,
    stars: starsForState(state),
    ...(pooled.recentAccuracy !== undefined ? { recentAccuracy: pooled.recentAccuracy } : {}),
    ...(pooled.lastPracticedAt ? { lastPracticedAt: pooled.lastPracticedAt } : {}),
    ...(pooled.reviewDueAt && !capped ? { reviewDueAt: pooled.reviewDueAt } : {}),
    evidenceCount: pooled.evidenceCount,
    sessions: pooled.sessions,
  };
}
