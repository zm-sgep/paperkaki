/**
 * The reward redemption state machine (spec section 10, ARCHITECTURE 17.6, PRD 15.10).
 *
 *   requested -> approved -> fulfilled
 *   requested -> rejected
 *   requested -> cancelled   (by the child)
 *   approved | fulfilled -> cancelled, with a refund entry   (a parent reverses it)
 *
 * Points are checked when requested and again when approved, and deducted only on approval, as one
 * debit ledger entry. Rejecting or cancelling a request never touches the ledger. Every transition
 * returns a new object; nothing is mutated and no history is deleted.
 */
import { balance } from "./ledger";
import type { LedgerEntry, Redemption, RedemptionActor } from "./entities";

export type RedemptionErrorCode =
  | "invalid_transition"
  | "insufficient_balance"
  | "not_authorised"
  | "invalid_request";

export class RedemptionError extends Error {
  readonly code: RedemptionErrorCode;

  constructor(code: RedemptionErrorCode, message: string) {
    super(message);
    this.name = "RedemptionError";
    this.code = code;
  }
}

/** The idempotency keys for a redemption's ledger entries. */
export const redemptionDebitSourceId = (redemptionId: string) => `redemption:${redemptionId}:debit`;
export const redemptionRefundSourceId = (redemptionId: string) => `redemption:${redemptionId}:refund`;

function requireParentOwner(redemption: Redemption, actor: RedemptionActor): void {
  if (actor.role !== "parent" || actor.parentId !== redemption.ownerParentId) {
    throw new RedemptionError("not_authorised", "Only the parent who owns this reward can do that.");
  }
}

function requireStatus(redemption: Redemption, allowed: readonly Redemption["status"][], action: string): void {
  if (!allowed.includes(redemption.status)) {
    throw new RedemptionError("invalid_transition", `A ${redemption.status} request cannot be ${action}.`);
  }
}

/** The child asks for a reward. The balance is checked now, but nothing is deducted. */
export function requestRedemption(input: {
  id: string;
  rewardId: string;
  childId: string;
  ownerParentId: string;
  pointsCost: number;
  now: string;
  ledger: readonly LedgerEntry[];
}): Redemption {
  if (!Number.isInteger(input.pointsCost) || input.pointsCost <= 0) {
    throw new RedemptionError("invalid_request", "A reward must cost a whole number of points above zero.");
  }
  if (balance(input.ledger, input.childId) < input.pointsCost) {
    throw new RedemptionError("insufficient_balance", "There are not enough points for this reward yet.");
  }
  return {
    id: input.id,
    rewardId: input.rewardId,
    childId: input.childId,
    ownerParentId: input.ownerParentId,
    status: "requested",
    pointsCostSnapshot: input.pointsCost,
    requestedAt: input.now,
  };
}

/**
 * The owning parent approves. The balance is checked again against the ledger as it is now, since
 * points may have been spent since the request. Returns the approved request and the single debit
 * entry the caller must append in the same transaction.
 */
export function approveRedemption(
  redemption: Redemption,
  input: {
    actor: RedemptionActor;
    now: string;
    ledger: readonly LedgerEntry[];
    debitEntryId: string;
    note?: string;
  },
): { redemption: Redemption; debit: LedgerEntry } {
  requireParentOwner(redemption, input.actor);
  requireStatus(redemption, ["requested"], "approved");
  if (balance(input.ledger, redemption.childId) < redemption.pointsCostSnapshot) {
    throw new RedemptionError("insufficient_balance", "There are not enough points to approve this now.");
  }
  const debit: LedgerEntry = {
    id: input.debitEntryId,
    childId: redemption.childId,
    amount: -redemption.pointsCostSnapshot,
    reasonCode: "reward_redemption",
    origin: "redemption",
    sourceEventId: redemptionDebitSourceId(redemption.id),
    calculation: { redemptionId: redemption.id, rewardId: redemption.rewardId },
    createdAt: input.now,
  };
  return {
    debit,
    redemption: {
      ...redemption,
      status: "approved",
      decidedAt: input.now,
      ...(input.note !== undefined ? { decisionNote: input.note } : {}),
      debitLedgerEntryId: debit.id,
    },
  };
}

/** The owning parent declines. No points move. */
export function rejectRedemption(
  redemption: Redemption,
  input: { actor: RedemptionActor; now: string; note?: string },
): Redemption {
  requireParentOwner(redemption, input.actor);
  requireStatus(redemption, ["requested"], "rejected");
  return {
    ...redemption,
    status: "rejected",
    decidedAt: input.now,
    ...(input.note !== undefined ? { decisionNote: input.note } : {}),
  };
}

/** The child withdraws a request that is still waiting. No points move. */
export function cancelRedemption(
  redemption: Redemption,
  input: { actor: RedemptionActor; now: string },
): Redemption {
  if (input.actor.role !== "child" || input.actor.childId !== redemption.childId) {
    throw new RedemptionError("not_authorised", "Only the child who asked can take a request back.");
  }
  requireStatus(redemption, ["requested"], "cancelled");
  return { ...redemption, status: "cancelled", decidedAt: input.now };
}

/** The owning parent marks the real-world reward as given. */
export function fulfilRedemption(
  redemption: Redemption,
  input: { actor: RedemptionActor; now: string },
): Redemption {
  requireParentOwner(redemption, input.actor);
  requireStatus(redemption, ["approved"], "marked as given");
  return { ...redemption, status: "fulfilled", fulfilledAt: input.now };
}

/**
 * The owning parent reverses an approved or fulfilled redemption. The debit is refunded with a
 * compensating entry (never deleted) and the request becomes cancelled. Returns the entry to append.
 */
export function reverseRedemption(
  redemption: Redemption,
  input: {
    actor: RedemptionActor;
    now: string;
    refundEntryId: string;
    reason: string;
  },
): { redemption: Redemption; refund: LedgerEntry } {
  requireParentOwner(redemption, input.actor);
  requireStatus(redemption, ["approved", "fulfilled"], "reversed");
  if (!redemption.debitLedgerEntryId) {
    throw new RedemptionError("invalid_transition", "This request has no debit to refund.");
  }
  const refund: LedgerEntry = {
    id: input.refundEntryId,
    childId: redemption.childId,
    amount: redemption.pointsCostSnapshot,
    reasonCode: "reward_refund",
    origin: "redemption",
    sourceEventId: redemptionRefundSourceId(redemption.id),
    note: input.reason,
    compensatesEntryId: redemption.debitLedgerEntryId,
    createdAt: input.now,
  };
  return {
    refund,
    redemption: {
      ...redemption,
      status: "cancelled",
      decisionNote: input.reason,
      refundLedgerEntryId: refund.id,
    },
  };
}
