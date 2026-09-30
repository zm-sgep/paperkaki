/**
 * The mock clock, anchored on the server (ARCHITECTURE section 10, UX_SPEC section 10).
 *
 * remaining = limit - (now - started_at). There is no pause: the clock runs from Start until the
 * paper is handed in, whichever device is open, so a reload, a second device or a long "Stop for
 * now" cannot buy extra time. Handing in late is allowed; the seconds past the limit are recorded
 * for the parent.
 */

/** Whole seconds from `startedAt` to `now`, never negative. */
export function elapsedSecondsSince(startedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
}

/** Seconds left, never below zero. */
export function remainingSecondsFor(limitSeconds: number, elapsedSeconds: number): number {
  return Math.max(0, limitSeconds - Math.max(0, elapsedSeconds));
}

/** Seconds worked past the limit, zero when handed in on time. */
export function overTimeSecondsFor(limitSeconds: number, elapsedSeconds: number): number {
  return Math.max(0, Math.max(0, elapsedSeconds) - limitSeconds);
}

/** "45 min", "1 h", "1 h 30 min" */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
