/**
 * Recommended paper settings (M3-04 defaults).
 *
 * These are editable suggestions shown to the parent ("Recommend first;
 * customise second"). Pure and deterministic.
 */

export type DifficultyLevel = "easier" | "balanced" | "harder";

/** Share of marks by question difficulty, in percent. Always sums to 100. */
export type DifficultyMix = { basic: number; standard: number; challenging: number };

export const DIFFICULTY_PRESETS: Readonly<Record<DifficultyLevel, DifficultyMix>> = {
  easier: { basic: 50, standard: 40, challenging: 10 },
  balanced: { basic: 30, standard: 50, challenging: 20 },
  harder: { basic: 20, standard: 45, challenging: 35 },
};

/** Limits for parent edits. */
export const PAPER_LIMITS = {
  minMarks: 10,
  maxMarks: 60,
  marksStep: 5,
  minMinutes: 15,
  maxMinutes: 120,
} as const;

export type PaperSettings = {
  totalMarks: number;
  durationMinutes: number;
  difficulty: DifficultyLevel;
};

export function recommendPaperSettings(input: { topicCount: number }): PaperSettings {
  const n = input.topicCount;
  if (!(n >= 2)) return { totalMarks: 20, durationMinutes: 25, difficulty: "balanced" };
  if (n < 3) return { totalMarks: 30, durationMinutes: 35, difficulty: "balanced" };
  return { totalMarks: 40, durationMinutes: 45, difficulty: "balanced" };
}

export function isValidTotalMarks(totalMarks: number): boolean {
  return (
    Number.isInteger(totalMarks) &&
    totalMarks >= PAPER_LIMITS.minMarks &&
    totalMarks <= PAPER_LIMITS.maxMarks &&
    totalMarks % PAPER_LIMITS.marksStep === 0
  );
}

export function isValidDuration(durationMinutes: number): boolean {
  return (
    Number.isInteger(durationMinutes) &&
    durationMinutes >= PAPER_LIMITS.minMinutes &&
    durationMinutes <= PAPER_LIMITS.maxMinutes
  );
}

/** Every total-marks value a parent may choose, ascending. */
export function allowedTotalMarks(): number[] {
  const out: number[] = [];
  for (let m = PAPER_LIMITS.minMarks; m <= PAPER_LIMITS.maxMarks; m += PAPER_LIMITS.marksStep) out.push(m);
  return out;
}
