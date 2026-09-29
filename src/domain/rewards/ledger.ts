/**
 * The append-only point ledger (spec sections 10, 15; ARCHITECTURE 17.4 and 17.7; ADR-0006).
 *
 * The authoritative balance is the sum of ledger entries. Nothing here edits or removes an entry:
 * `appendEntries` returns a new list, corrections are compensating entries that point at the entry
 * they reverse, and every entry carries a `sourceEventId` so retries and jobs cannot award twice.
 * The caller's database enforces the same rules with a unique (child, source event) constraint.
 */
import {
  LEARNING_REASONS,
  type LedgerEntry,
  type RewardContext,
  type RewardDecision,
} from "./entities";

export type LedgerErrorCode =
  | "invalid_entry"
  | "duplicate_source_event"
  | "duplicate_compensation"
  | "insufficient_balance";

export class LedgerError extends Error {
  readonly code: LedgerErrorCode;

  constructor(code: LedgerErrorCode, message: string) {
    super(message);
    this.name = "LedgerError";
    this.code = code;
  }
}

function invalid(message: string): never {
  throw new LedgerError("invalid_entry", message);
}

/** Throws `LedgerError("invalid_entry")` when a single entry breaks a ledger rule. */
export function validateLedgerEntry(entry: LedgerEntry): void {
  if (entry.id.trim() === "") invalid("entry id is required");
  if (entry.childId.trim() === "") invalid("childId is required");
  if (entry.sourceEventId.trim() === "") invalid("sourceEventId is required for every entry");
  if (!Number.isInteger(entry.amount) || entry.amount === 0) {
    invalid("amount must be a whole number that is not zero");
  }
  if (Number.isNaN(Date.parse(entry.createdAt))) invalid("createdAt must be a valid timestamp");

  switch (entry.origin) {
    case "learning":
      if (!(LEARNING_REASONS as readonly string[]).includes(entry.reasonCode)) {
        invalid(`${entry.reasonCode} is not a learning reason`);
      }
      if (entry.amount < 0) invalid("learning entries earn points and cannot be negative");
      if (!entry.policyVersion) invalid("learning entries must record the policy version");
      break;
    case "parent_bonus":
      if (entry.reasonCode !== "manual_parent_bonus") invalid("parent bonuses use manual_parent_bonus");
      if (entry.amount < 0) invalid("a parent bonus must be positive");
      if (!entry.note?.trim()) invalid("a parent bonus needs a reason");
      break;
    case "redemption":
      if (entry.reasonCode === "reward_redemption") {
        if (entry.amount > 0) invalid("a redemption debit must be negative");
      } else if (entry.reasonCode === "reward_refund") {
        if (entry.amount < 0) invalid("a refund must be positive");
        if (!entry.compensatesEntryId) invalid("a refund must point at the debit it reverses");
      } else {
        invalid(`${entry.reasonCode} is not a redemption reason`);
      }
      break;
    case "correction":
      if (entry.reasonCode !== "manual_correction") invalid("corrections use manual_correction");
      if (!entry.compensatesEntryId) invalid("a correction must point at the entry it reverses");
      if (!entry.note?.trim()) invalid("a correction needs a reason");
      break;
  }
}

const sourceKey = (entry: Pick<LedgerEntry, "childId" | "sourceEventId">) =>
  `${entry.childId}\u0000${entry.sourceEventId}`;

/**
 * Returns `existing` followed by `added`, or throws without changing anything. Rejects duplicate
 * source events per child (idempotency), invalid entries, a second reversal of the same entry, and
 * any child's balance going below zero. Never mutates its arguments.
 */
export function appendEntries(
  existing: readonly LedgerEntry[],
  added: readonly LedgerEntry[],
): LedgerEntry[] {
  const seenSources = new Set(existing.map(sourceKey));
  const seenIds = new Set(existing.map((entry) => entry.id));
  const byId = new Map(existing.map((entry) => [entry.id, entry] as const));
  const compensated = new Set(
    existing.flatMap((entry) => (entry.compensatesEntryId ? [entry.compensatesEntryId] : [])),
  );
  const balances = new Map<string, number>();
  for (const entry of existing) balances.set(entry.childId, (balances.get(entry.childId) ?? 0) + entry.amount);

  const accepted: LedgerEntry[] = [];
  for (const entry of added) {
    validateLedgerEntry(entry);
    if (seenIds.has(entry.id)) invalid(`entry id ${entry.id} already exists`);
    if (seenSources.has(sourceKey(entry))) {
      throw new LedgerError(
        "duplicate_source_event",
        `Source event ${entry.sourceEventId} was already recorded for this child.`,
      );
    }
    if (entry.compensatesEntryId) {
      const original = byId.get(entry.compensatesEntryId);
      if (!original) invalid("the entry being reversed does not exist");
      if (original.childId !== entry.childId) invalid("a reversal must belong to the same child");
      if (original.amount !== -entry.amount) invalid("a reversal must exactly cancel the entry it reverses");
      if (compensated.has(original.id)) {
        throw new LedgerError("duplicate_compensation", "That entry was already reversed.");
      }
      compensated.add(original.id);
    }
    const next = (balances.get(entry.childId) ?? 0) + entry.amount;
    if (next < 0) {
      throw new LedgerError("insufficient_balance", "That would take the point balance below zero.");
    }
    balances.set(entry.childId, next);
    seenSources.add(sourceKey(entry));
    seenIds.add(entry.id);
    const stored = Object.freeze({ ...entry });
    byId.set(stored.id, stored);
    accepted.push(stored);
  }
  return [...existing, ...accepted];
}

/** The authoritative balance: the sum of entries, for one child when `childId` is given. */
export function balance(entries: readonly LedgerEntry[], childId?: string): number {
  let total = 0;
  for (const entry of entries) {
    if (childId === undefined || entry.childId === childId) total += entry.amount;
  }
  return total;
}

export type LedgerSummary = {
  balance: number;
  /** Points earned through learning (the RewardEngine). */
  learningEarned: number;
  /** Manual parent bonuses, kept separate from learning-earned points. */
  manualParentBonus: number;
  /** Points spent on approved rewards, as a positive number. */
  redeemed: number;
  /** Points returned by refunds. */
  refunded: number;
  /** Net effect of compensating corrections. */
  corrections: number;
};

export function summariseLedger(entries: readonly LedgerEntry[], childId: string): LedgerSummary {
  const summary: LedgerSummary = {
    balance: 0,
    learningEarned: 0,
    manualParentBonus: 0,
    redeemed: 0,
    refunded: 0,
    corrections: 0,
  };
  for (const entry of entries) {
    if (entry.childId !== childId) continue;
    summary.balance += entry.amount;
    if (entry.origin === "learning") summary.learningEarned += entry.amount;
    else if (entry.origin === "parent_bonus") summary.manualParentBonus += entry.amount;
    else if (entry.origin === "correction") summary.corrections += entry.amount;
    else if (entry.reasonCode === "reward_refund") summary.refunded += entry.amount;
    else summary.redeemed += -entry.amount;
  }
  return summary;
}

/** Compares a cached balance with the ledger. The ledger always wins. */
export function reconcileBalance(
  entries: readonly LedgerEntry[],
  childId: string,
  cachedBalance: number,
): { matches: boolean; ledgerBalance: number; difference: number } {
  const ledgerBalance = balance(entries, childId);
  return { matches: ledgerBalance === cachedBalance, ledgerBalance, difference: cachedBalance - ledgerBalance };
}

/**
 * Turns a RewardDecision into the one ledger entry for its source event, or `undefined` when it
 * earned nothing (the ledger never stores zero-point entries). The headline reason is the first
 * reason code; the full breakdown and every factor are kept in `calculation`.
 */
export function entryFromDecision(
  context: RewardContext,
  decision: RewardDecision,
  meta: { id: string; createdAt: string },
): LedgerEntry | undefined {
  const headline = decision.reasonCodes[0];
  if (decision.points <= 0 || headline === undefined) return undefined;
  return {
    id: meta.id,
    childId: context.childId,
    amount: decision.points,
    reasonCode: headline,
    origin: "learning",
    sourceEventId: context.sourceEventId,
    policyVersion: decision.policyVersion,
    masteryBefore: context.masteryBefore,
    masteryAfter: context.masteryAfter,
    calculation: {
      activityType: context.activityType,
      reasonCodes: decision.reasonCodes,
      breakdown: decision.breakdown,
      multipliers: decision.multipliers,
      antiFarmingDecisions: decision.antiFarmingDecisions,
      capped: decision.capped,
      ...(decision.capReason ? { capReason: decision.capReason } : {}),
    },
    createdAt: meta.createdAt,
  };
}

/** A parent's manual bonus. It needs a reason and is never counted as learning-earned. */
export function createManualParentBonus(input: {
  id: string;
  childId: string;
  points: number;
  reason: string;
  /** Idempotency key, for example the form submission id, so a double click awards once. */
  sourceEventId: string;
  createdAt: string;
}): LedgerEntry {
  const entry: LedgerEntry = {
    id: input.id,
    childId: input.childId,
    amount: input.points,
    reasonCode: "manual_parent_bonus",
    origin: "parent_bonus",
    sourceEventId: input.sourceEventId,
    note: input.reason,
    createdAt: input.createdAt,
  };
  validateLedgerEntry(entry);
  return entry;
}

/** A compensating entry that exactly cancels `original`. History is never edited or deleted. */
export function compensatingEntry(
  original: LedgerEntry,
  input: { id: string; sourceEventId: string; reason: string; createdAt: string },
): LedgerEntry {
  const entry: LedgerEntry = {
    id: input.id,
    childId: original.childId,
    amount: -original.amount,
    reasonCode: "manual_correction",
    origin: "correction",
    sourceEventId: input.sourceEventId,
    note: input.reason,
    compensatesEntryId: original.id,
    createdAt: input.createdAt,
  };
  validateLedgerEntry(entry);
  return entry;
}
