/**
 * Pairing a child's device with a short code (ARCHITECTURE section 13). Pure rules only: how long a
 * code lives, when it is spent, when it is locked. Where codes are stored and compared is the
 * application's job.
 */

export const PAIRING_CODE_LENGTH = 6;
export const PAIRING_CODE_TTL_MINUTES = 10;
/** Wrong tries a live code survives. The next wrong try (the fifth) locks it. */
export const PAIRING_MAX_WRONG_TRIES = 5;

export type PairingCodeFacts = {
  expiresAt: Date;
  usedAt: Date | null;
  wrongTries: number;
};

export type PairingCodeState = "live" | "used" | "expired" | "locked";

export function pairingCodeExpiry(now: Date): Date {
  return new Date(now.getTime() + PAIRING_CODE_TTL_MINUTES * 60_000);
}

/** A code works once, for ten minutes, and only until it has been guessed against five times. */
export function pairingCodeState(code: PairingCodeFacts, now: Date): PairingCodeState {
  if (code.usedAt !== null) return "used";
  if (now.getTime() >= code.expiresAt.getTime()) return "expired";
  if (code.wrongTries >= PAIRING_MAX_WRONG_TRIES) return "locked";
  return "live";
}

/** What the child typed, as six digits, or null. Spaces, dashes and dots are ignored; nothing else is. */
export function normalisePairingCode(input: string): string | null {
  const compact = input.replace(/[\s\-.]/g, "");
  return /^\d{6}$/.test(compact) ? compact : null;
}

/** "123456" -> "123 456", for reading aloud or across a table. */
export function formatPairingCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
