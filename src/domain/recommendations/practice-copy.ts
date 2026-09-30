/**
 * The words on the practice screens. Pure, so every sentence is tested and none is built inside a
 * component. Calm and short for a child: no points, no percentages, no "mastery".
 */
import type { Block } from "@/schemas/question-content";

/** Longest gap between two actions that still counts as working time (a child who wandered off did not practise). */
export const MAX_ACTIVE_GAP_SECONDS = 240;

/** Seconds of real working time from one action to the next. */
export function activeGapSeconds(previous: Date, now: Date): number {
  const gap = Math.round((now.getTime() - previous.getTime()) / 1000);
  return Math.min(MAX_ACTIVE_GAP_SECONDS, Math.max(0, gap));
}

/** Whole minutes practised, never less than one (a finished set was at least a minute of a child's day). */
export function practisedMinutes(activeSeconds: number): number {
  return Math.max(1, Math.round(activeSeconds / 60));
}

export function minutesText(minutes: number): string {
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** "Good work. You practised Fractions for 14 minutes." */
export function practiceEndText(focusLabel: string, minutes: number): string {
  return `Good work. You practised ${focusLabel} for ${minutesText(minutes)}.`;
}

export function practiceProgressText(position: number, total: number): string {
  return `Question ${position} of ${total}`;
}

export type PracticeHint = { kind: "step"; blocks: Block[] } | { kind: "nudge"; text: string };

/**
 * The hint after a wrong answer: the first step of the worked solution. When the solution is a single
 * step, that step would give the answer away, so the hint is a nudge to read the question again.
 */
export function practiceHint(workedSolution: readonly Block[]): PracticeHint {
  const first = workedSolution[0];
  if (first && workedSolution.length > 1) return { kind: "step", blocks: [first] };
  return { kind: "nudge", text: "Read the question once more, and take it one step at a time." };
}

export type FeedbackResult = "right" | "wrong" | "unclear";

export const FEEDBACK_HEADING: Record<FeedbackResult, string> = {
  right: "✓ Well done!",
  wrong: "Not quite",
  unclear: "Let's look at this one together",
};

/** A child who has just answered the last question sees "Finish", otherwise "Next question". */
export function nextButtonLabel(isLast: boolean): string {
  return isLast ? "Finish" : "Next question";
}
