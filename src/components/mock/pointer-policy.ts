/**
 * Palm rejection for the handwriting canvas, as a pure rule so it can be tested without a browser.
 *
 * - Apple Pencil ("pen") and mouse always draw.
 * - A finger ("touch") draws only when no pen is being used: not while a pen is down, and not in
 *   the moments right after one lifted, when a resting palm usually lands.
 */

/** How long after the pen last touched or hovered a finger is still treated as a palm. */
export const PALM_GUARD_MS = 900;

export type PointerKind = "pen" | "touch" | "mouse";

export function pointerKind(pointerType: string): PointerKind {
  return pointerType === "pen" ? "pen" : pointerType === "touch" ? "touch" : "mouse";
}

export type PenActivity = {
  /** A pen pointer is down right now. */
  penDown: boolean;
  /** `performance.now()` of the last pen event of any kind, or null if none in this session. */
  lastPenEventAt: number | null;
};

export function shouldAcceptPointer(kind: PointerKind, activity: PenActivity, now: number): boolean {
  if (kind !== "touch") return true;
  if (activity.penDown) return false;
  return activity.lastPenEventAt === null || now - activity.lastPenEventAt > PALM_GUARD_MS;
}

/** Pressure to record: real pen pressure, or a steady mid value for a finger or mouse. */
export function effectivePressure(kind: PointerKind, pressure: number): number {
  if (kind !== "pen") return 0.5;
  return pressure > 0 ? Math.min(1, pressure) : 0.5;
}
