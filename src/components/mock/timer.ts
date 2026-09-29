/**
 * The mock clock, as plain functions (UX_SPEC section 10: "timer not excessively alarming until
 * meaningful thresholds"). It counts down, turns amber with ten minutes left, and shows one gentle
 * banner with five minutes left. Nothing flashes and nothing is red.
 */

export const AMBER_AT_SECONDS = 10 * 60;
export const BANNER_AT_SECONDS = 5 * 60;

/** "45:00", "9:05", "0:00" and, for a paper of an hour or more, "1:05:00". Never negative. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Spoken form for screen readers: "9 minutes 5 seconds". */
export function spokenClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  const parts = [h > 0 ? part(h, "hour") : "", m > 0 ? part(m, "minute") : "", h === 0 && (s > 0 || m === 0) ? part(s, "second") : ""];
  return parts.filter(Boolean).join(" ");
}

export function remainingSeconds(durationSeconds: number, elapsedSeconds: number): number {
  return Math.max(0, durationSeconds - Math.max(0, elapsedSeconds));
}

export type TimerPhase = {
  /** "calm" until ten minutes are left, then "amber". */
  tone: "calm" | "amber";
  /** The gentle five-minute banner. Stays up (with different words) once time is over. */
  banner: "none" | "five-minutes" | "time-up";
};

export function timerPhase(remaining: number): TimerPhase {
  if (remaining <= 0) return { tone: "amber", banner: "time-up" };
  if (remaining <= BANNER_AT_SECONDS) return { tone: "amber", banner: "five-minutes" };
  if (remaining <= AMBER_AT_SECONDS) return { tone: "amber", banner: "none" };
  return { tone: "calm", banner: "none" };
}

export const BANNER_TEXT = {
  "five-minutes": "About 5 minutes left. Check your answers when you are ready.",
  "time-up": "Time is up. Finish the question you are on, then review and submit.",
} as const;
