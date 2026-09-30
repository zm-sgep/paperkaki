/**
 * Shared practice rules for the parent's Home and the child's Today: which outcome is weakest,
 * which are due, and the constants that decide "enough practice" and "done for today".
 * Pure and deterministic. UI never re-implements any of this.
 */
import { MASTERY_STATE_RANK, type MasteryState } from "@/domain/mastery";

/** Length of one recommended practice set. */
export const PRACTICE_SESSION_MINUTES = 15;
/** Practice minutes in one day after which the plan is complete and the app says "done for today". */
export const DAILY_PRACTICE_TARGET_MINUTES = 15;
/** Practice sessions since the last mock after which a new mock is the next step. */
export const ENOUGH_PRACTICE_SESSIONS_SINCE_MOCK = 3;
/** An assessment this many days away (or fewer) is "close": a final mock comes first. */
export const FINAL_MOCK_WINDOW_DAYS = 3;

export type PracticeOutcome = {
  outcomeId: string;
  /** Familiar words, e.g. "Fractions of a set". Never the curriculum code. */
  name: string;
  state: MasteryState;
  /** 0..1, used only to order outcomes of the same state. */
  recentAccuracy?: number;
  /** ISO 8601. */
  lastPracticedAt?: string;
  /** ISO 8601. Spaced retention check for mastered outcomes. */
  reviewDueAt?: string;
};

/** A weak area: started, and not yet solid. Not-started and mastered outcomes are not weak. */
export function isWeakOutcome(outcome: PracticeOutcome): boolean {
  return outcome.state === "learning" || outcome.state === "developing";
}

/** Worth practising now: weak, not started, nearly there, or a mastered outcome whose review is due. */
export function isDueForPractice(outcome: PracticeOutcome, now: string): boolean {
  if (outcome.state === "mastered" || outcome.state === "retained") {
    return outcome.reviewDueAt !== undefined && Date.parse(outcome.reviewDueAt) <= Date.parse(now);
  }
  return true;
}

/** Lower is more urgent: learning, developing, not started, almost mastered, then reviews. */
function urgency(outcome: PracticeOutcome): number {
  switch (outcome.state) {
    case "learning":
      return 0;
    case "developing":
      return 1;
    case "not_started":
      return 2;
    case "almost_mastered":
      return 3;
    default:
      return 4 + (MASTERY_STATE_RANK[outcome.state] - MASTERY_STATE_RANK.mastered);
  }
}

const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function compareOutcomes(a: PracticeOutcome, b: PracticeOutcome): number {
  return (
    urgency(a) - urgency(b) ||
    (a.recentAccuracy ?? 1) - (b.recentAccuracy ?? 1) ||
    // Never practised, or practised longest ago, first.
    text(a.lastPracticedAt ?? "", b.lastPracticedAt ?? "") ||
    text(a.outcomeId, b.outcomeId)
  );
}

/** The weakest weak area, or undefined when none. */
export function weakestWeakOutcome(outcomes: readonly PracticeOutcome[]): PracticeOutcome | undefined {
  return outcomes.filter(isWeakOutcome).sort(compareOutcomes)[0];
}

/** The most urgent outcome that is due for practice, or undefined when nothing is due. */
export function weakestDueOutcome(outcomes: readonly PracticeOutcome[], now: string): PracticeOutcome | undefined {
  return outcomes.filter((o) => isDueForPractice(o, now)).sort(compareOutcomes)[0];
}

/**
 * True once today's practice reaches the daily target: the minutes add up to it, or one whole practice set
 * has been finished (a set is the day's plan, however quickly it went). Unknown counts as none.
 */
export function dailyPracticeComplete(minutesToday: number | undefined, setsToday: number | undefined = 0): boolean {
  return (setsToday ?? 0) >= 1 || (minutesToday ?? 0) >= DAILY_PRACTICE_TARGET_MINUTES;
}
