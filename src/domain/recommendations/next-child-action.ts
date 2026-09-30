/**
 * The next-action policy for a child's Today screen: exactly one mission, never a menu.
 *
 * Pure and deterministic. Copy is short and warm, shows no mastery numbers, and says nothing
 * about points or rewards (a mock mission is a quiet, calm start).
 */
import {
  PRACTICE_SESSION_MINUTES,
  dailyPracticeComplete,
  weakestDueOutcome,
  type PracticeOutcome,
} from "./practice-focus";

export type ChildActionState = {
  /** ISO 8601 timestamp. Decides which spaced reviews are due. */
  now: string;
  /**
   * A mock the child started and has not handed in. With `position` and `total` the mission says
   * where they were ("Question 8 of 26").
   */
  unfinishedMock?: { attemptId: string; position?: number; total?: number };
  /** A practice set the child started and has not finished. */
  unfinishedPractice?: { sessionId: string; focusName?: string };
  /**
   * A mock a parent has assigned and the child has not started. With `durationText` the mission is
   * the paper itself: `label` as its title ("Mathematics WA2 · Mock 1") and the time as its detail.
   */
  dueMock?: { attemptId: string; label?: string; durationText?: string };
  /** A marked mock the child has not looked at yet. `resultId` is the attempt's id. */
  newResult?: { resultId: string; label?: string };
  /** Marked work with mistakes the child has not gone through yet. */
  mistakes?: { count: number; resultId: string };
  practice?: {
    outcomes: PracticeOutcome[];
    /** Practice minutes done today. */
    minutesToday?: number;
  };
};

export type ChildActionKind =
  | "resume_mock"
  | "resume_practice"
  | "start_mock"
  | "see_results"
  | "fix_mistakes"
  | "start_practice"
  | "done_today";

export type ChildAction = {
  kind: ChildActionKind;
  title: string;
  supportingText: string;
  ctaLabel: string;
  href: string;
};

/** Checked in this order; the first that applies is the mission. */
export const CHILD_ACTION_ORDER: readonly ChildActionKind[] = [
  "resume_mock",
  "resume_practice",
  "start_mock",
  "see_results",
  "fix_mistakes",
  "start_practice",
  "done_today",
];

export function nextChildAction(state: ChildActionState): ChildAction {
  if (state.unfinishedMock) {
    const { position, total } = state.unfinishedMock;
    if (position !== undefined && total !== undefined) {
      return {
        kind: "resume_mock",
        title: "Carry on with your mock",
        supportingText: `Question ${Math.min(Math.max(1, position), Math.max(1, total))} of ${total}`,
        ctaLabel: "Continue",
        href: `/mock/${state.unfinishedMock.attemptId}`,
      };
    }
    return {
      kind: "resume_mock",
      title: "Let's finish your mock",
      supportingText: "You're partway through. Pick up where you stopped.",
      ctaLabel: "Continue",
      href: `/mock/${state.unfinishedMock.attemptId}`,
    };
  }

  if (state.unfinishedPractice) {
    const { sessionId, focusName } = state.unfinishedPractice;
    return {
      kind: "resume_practice",
      title: focusName ? `Let's finish your ${focusName} practice` : "Let's finish your practice",
      supportingText: "Pick up where you left off.",
      ctaLabel: "Continue",
      href: `/practice/${sessionId}`,
    };
  }

  if (state.dueMock) {
    if (state.dueMock.durationText !== undefined) {
      return {
        kind: "start_mock",
        title: state.dueMock.label ?? "Your mock is ready",
        supportingText: state.dueMock.durationText,
        ctaLabel: "Start",
        href: `/mock/${state.dueMock.attemptId}/start`,
      };
    }
    return {
      kind: "start_mock",
      title: state.dueMock.label ? `Your ${state.dueMock.label} is ready` : "Your mock is ready",
      supportingText: "Take your time and do your best.",
      ctaLabel: "Start mock",
      href: `/mock/${state.dueMock.attemptId}/start`,
    };
  }

  if (state.newResult) {
    return {
      kind: "see_results",
      title: state.newResult.label ? `Your ${state.newResult.label} is marked` : "Your mock is marked",
      supportingText: "Come and see how you did.",
      ctaLabel: "See my results",
      href: `/results/${state.newResult.resultId}`,
    };
  }

  if (state.mistakes && state.mistakes.count > 0) {
    const { count, resultId } = state.mistakes;
    return {
      kind: "fix_mistakes",
      title: count === 1 ? "Let's fix 1 mistake" : `Let's fix ${count} mistakes`,
      supportingText: "Each one you fix helps you remember it next time.",
      ctaLabel: "Review mistakes",
      href: `/results/${resultId}`,
    };
  }

  const focus = state.practice && !dailyPracticeComplete(state.practice.minutesToday)
    ? weakestDueOutcome(state.practice.outcomes, state.now)
    : undefined;
  if (focus) {
    return {
      kind: "start_practice",
      title: `Practise ${focus.name}`,
      supportingText: `About ${PRACTICE_SESSION_MINUTES} minutes.`,
      ctaLabel: "Start",
      href: "/practice",
    };
  }

  return {
    kind: "done_today",
    title: "You're done for today. Nice work.",
    supportingText: "Come back tomorrow for your next mission.",
    ctaLabel: "See my progress",
    href: "/progress",
  };
}
