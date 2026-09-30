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

const STATE_BY_RANK: readonly MasteryState[] = ["not_started", "learning", "developing", "almost_mastered", "mastered", "retained"];

export function starsForState(state: MasteryState): number {
  return MASTERY_STATE_STARS[state];
}

/**
 * A topic's state from its outcomes' states. The typical state of the outcomes the question bank can
 * test, rounded down, so a topic is never called secure while parts of it are untouched; and once any
 * outcome has been started, the topic is at least "Learning".
 */
export function topicStateOf(outcomeStates: readonly MasteryState[]): MasteryState {
  if (outcomeStates.length === 0) return "not_started";
  const total = outcomeStates.reduce((sum, state) => sum + MASTERY_STATE_RANK[state], 0);
  const typical = Math.floor(total / outcomeStates.length);
  const started = outcomeStates.some((state) => state !== "not_started");
  return STATE_BY_RANK[Math.max(started ? 1 : 0, typical)] as MasteryState;
}

export type TopicMastery = {
  state: MasteryState;
  stars: number;
  /** Mean of the recent accuracy of the started outcomes, 0..1. For ordering only; never shown. */
  recentAccuracy?: number;
  /** ISO 8601, the newest practice on any outcome of the topic. */
  lastPracticedAt?: string;
  /** ISO 8601, the earliest spaced review that is coming due among the topic's secure outcomes. */
  reviewDueAt?: string;
  evidenceCount: number;
};

/** Everything the screens and the practice policy need about one topic, from its outcomes' mastery. */
export function topicMasteryOf(outcomes: readonly OutcomeMastery[]): TopicMastery {
  const state = topicStateOf(outcomes.map((outcome) => outcome.state));
  const accuracies = outcomes.flatMap((outcome) => (outcome.recentAccuracy === undefined ? [] : [outcome.recentAccuracy]));
  const practiced = outcomes.flatMap((outcome) => (outcome.lastPracticedAt ? [outcome.lastPracticedAt] : []));
  const due = outcomes.flatMap((outcome) => (outcome.reviewDueAt ? [outcome.reviewDueAt] : []));
  return {
    state,
    stars: starsForState(state),
    ...(accuracies.length > 0 ? { recentAccuracy: accuracies.reduce((a, b) => a + b, 0) / accuracies.length } : {}),
    ...(practiced.length > 0 ? { lastPracticedAt: [...practiced].sort()[practiced.length - 1] as string } : {}),
    ...(due.length > 0 ? { reviewDueAt: [...due].sort()[0] as string } : {}),
    evidenceCount: outcomes.reduce((sum, outcome) => sum + outcome.evidenceCount, 0),
  };
}
