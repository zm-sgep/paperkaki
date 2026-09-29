import { describe, expect, it } from "vitest";
import {
  LedgerError,
  RedemptionError,
  appendEntries,
  approveRedemption,
  balance,
  cancelRedemption,
  createManualParentBonus,
  fulfilRedemption,
  rejectRedemption,
  requestRedemption,
  reverseRedemption,
  summariseLedger,
  type LedgerEntry,
  type Redemption,
  type RedemptionActor,
} from "@/domain/rewards";

const T0 = "2026-09-29T08:00:00.000Z";
const T1 = "2026-09-29T09:00:00.000Z";
const T2 = "2026-09-30T09:00:00.000Z";
const parent: RedemptionActor = { role: "parent", parentId: "parent-1" };
const otherParent: RedemptionActor = { role: "parent", parentId: "parent-2" };
const child: RedemptionActor = { role: "child", childId: "child-1" };
const otherChild: RedemptionActor = { role: "child", childId: "child-2" };

function ledgerWith(points: number): LedgerEntry[] {
  return appendEntries(
    [],
    [{ id: "seed", childId: "child-1", amount: points, reasonCode: "activity_completion", origin: "learning", sourceEventId: "seed-event", policyVersion: "rewards-v1", createdAt: T0 }],
  );
}

function requested(ledger: LedgerEntry[], cost = 40): Redemption {
  return requestRedemption({ id: "red-1", rewardId: "reward-1", childId: "child-1", ownerParentId: "parent-1", pointsCost: cost, now: T0, ledger });
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof RedemptionError || error instanceof LedgerError ? error.code : "other";
  }
  return "none";
};

describe("request", () => {
  it("checks the balance but deducts nothing", () => {
    const ledger = ledgerWith(50);
    const request = requested(ledger);
    expect(request).toMatchObject({ status: "requested", pointsCostSnapshot: 40 });
    expect(balance(ledger, "child-1")).toBe(50);
  });

  it("refuses when the balance is too low or the cost is not a positive whole number", () => {
    expect(code(() => requested(ledgerWith(10)))).toBe("insufficient_balance");
    expect(code(() => requested(ledgerWith(100), 0))).toBe("invalid_request");
    expect(code(() => requested(ledgerWith(100), -5))).toBe("invalid_request");
    expect(code(() => requested(ledgerWith(100), 2.5))).toBe("invalid_request");
  });
});

describe("approval", () => {
  it("deducts exactly once, on approval, with one debit entry", () => {
    const ledger = ledgerWith(50);
    const { redemption, debit } = approveRedemption(requested(ledger), { actor: parent, now: T1, ledger, debitEntryId: "debit-1" });
    expect(redemption).toMatchObject({ status: "approved", debitLedgerEntryId: "debit-1", decidedAt: T1 });
    expect(debit).toMatchObject({ amount: -40, reasonCode: "reward_redemption", origin: "redemption", sourceEventId: "redemption:red-1:debit" });
    const after = appendEntries(ledger, [debit]);
    expect(balance(after, "child-1")).toBe(10);
    expect(summariseLedger(after, "child-1").redeemed).toBe(40);
  });

  it("cannot be applied twice: a second approval is an invalid transition and a replayed debit is rejected", () => {
    const ledger = ledgerWith(90);
    const request = requested(ledger);
    const { redemption, debit } = approveRedemption(request, { actor: parent, now: T1, ledger, debitEntryId: "debit-1" });
    const after = appendEntries(ledger, [debit]);
    expect(code(() => approveRedemption(redemption, { actor: parent, now: T1, ledger: after, debitEntryId: "debit-2" }))).toBe("invalid_transition");
    const replay = approveRedemption(request, { actor: parent, now: T1, ledger: after, debitEntryId: "debit-2" });
    expect(code(() => appendEntries(after, [replay.debit]))).toBe("duplicate_source_event");
    expect(balance(after, "child-1")).toBe(50);
  });

  it("is refused when the balance is no longer enough at approval time", () => {
    const ledger = ledgerWith(50);
    const request = requested(ledger);
    const spend: LedgerEntry = { id: "spend", childId: "child-1", amount: -30, reasonCode: "reward_redemption", origin: "redemption", sourceEventId: "other-redemption", createdAt: T0 };
    const later = appendEntries(ledger, [spend]);
    expect(code(() => approveRedemption(request, { actor: parent, now: T1, ledger: later, debitEntryId: "d" }))).toBe("insufficient_balance");
  });

  it("only the owning parent can approve, reject, fulfil or reverse", () => {
    const ledger = ledgerWith(50);
    const request = requested(ledger);
    expect(code(() => approveRedemption(request, { actor: otherParent, now: T1, ledger, debitEntryId: "d" }))).toBe("not_authorised");
    expect(code(() => approveRedemption(request, { actor: child, now: T1, ledger, debitEntryId: "d" }))).toBe("not_authorised");
    expect(code(() => rejectRedemption(request, { actor: otherParent, now: T1 }))).toBe("not_authorised");
    const { redemption } = approveRedemption(request, { actor: parent, now: T1, ledger, debitEntryId: "d" });
    expect(code(() => fulfilRedemption(redemption, { actor: otherParent, now: T2 }))).toBe("not_authorised");
    expect(code(() => reverseRedemption(redemption, { actor: otherParent, now: T2, refundEntryId: "r", reason: "x" }))).toBe("not_authorised");
  });
});

describe("rejection and cancellation", () => {
  it("reject keeps the request off the ledger and records the note", () => {
    const ledger = ledgerWith(50);
    const rejected = rejectRedemption(requested(ledger), { actor: parent, now: T1, note: "Not this week" });
    expect(rejected).toMatchObject({ status: "rejected", decisionNote: "Not this week", decidedAt: T1 });
    expect(rejected.debitLedgerEntryId).toBeUndefined();
    expect(balance(ledger, "child-1")).toBe(50);
  });

  it("only the child who asked can cancel, and only while requested", () => {
    const ledger = ledgerWith(50);
    const request = requested(ledger);
    expect(code(() => cancelRedemption(request, { actor: parent, now: T1 }))).toBe("not_authorised");
    expect(code(() => cancelRedemption(request, { actor: otherChild, now: T1 }))).toBe("not_authorised");
    expect(cancelRedemption(request, { actor: child, now: T1 }).status).toBe("cancelled");
    const { redemption } = approveRedemption(request, { actor: parent, now: T1, ledger, debitEntryId: "d" });
    expect(code(() => cancelRedemption(redemption, { actor: child, now: T2 }))).toBe("invalid_transition");
  });
});

describe("state machine", () => {
  it("allows requested -> approved -> fulfilled", () => {
    const ledger = ledgerWith(50);
    const { redemption } = approveRedemption(requested(ledger), { actor: parent, now: T1, ledger, debitEntryId: "d" });
    const fulfilled = fulfilRedemption(redemption, { actor: parent, now: T2 });
    expect(fulfilled).toMatchObject({ status: "fulfilled", fulfilledAt: T2 });
  });

  it("refuses every other transition", () => {
    const ledger = ledgerWith(200);
    const request = requested(ledger);
    const approved = approveRedemption(request, { actor: parent, now: T1, ledger, debitEntryId: "d" }).redemption;
    const fulfilled = fulfilRedemption(approved, { actor: parent, now: T2 });
    const rejected = rejectRedemption(request, { actor: parent, now: T1 });
    const cancelled = cancelRedemption(request, { actor: child, now: T1 });

    expect(code(() => fulfilRedemption(request, { actor: parent, now: T1 }))).toBe("invalid_transition");
    expect(code(() => rejectRedemption(approved, { actor: parent, now: T2 }))).toBe("invalid_transition");
    for (const terminal of [rejected, cancelled]) {
      expect(code(() => approveRedemption(terminal, { actor: parent, now: T2, ledger, debitEntryId: "d2" }))).toBe("invalid_transition");
      expect(code(() => fulfilRedemption(terminal, { actor: parent, now: T2 }))).toBe("invalid_transition");
      expect(code(() => reverseRedemption(terminal, { actor: parent, now: T2, refundEntryId: "r", reason: "x" }))).toBe("invalid_transition");
    }
    expect(code(() => approveRedemption(fulfilled, { actor: parent, now: T2, ledger, debitEntryId: "d3" }))).toBe("invalid_transition");
    expect(code(() => rejectRedemption(fulfilled, { actor: parent, now: T2 }))).toBe("invalid_transition");
    expect(code(() => cancelRedemption(fulfilled, { actor: child, now: T2 }))).toBe("invalid_transition");
  });

  it("returns new objects and never mutates the request", () => {
    const ledger = ledgerWith(50);
    const request = requested(ledger);
    const snapshot = structuredClone(request);
    approveRedemption(request, { actor: parent, now: T1, ledger, debitEntryId: "d" });
    expect(request).toEqual(snapshot);
  });
});

describe("reversal and refund", () => {
  it("refunds with a compensating entry, keeps the debit, and cancels the request", () => {
    const ledger = ledgerWith(50);
    const approved = approveRedemption(requested(ledger), { actor: parent, now: T1, ledger, debitEntryId: "debit-1" });
    const afterDebit = appendEntries(ledger, [approved.debit]);
    const reversed = reverseRedemption(approved.redemption, { actor: parent, now: T2, refundEntryId: "refund-1", reason: "Could not arrange it" });
    expect(reversed.refund).toMatchObject({ amount: 40, reasonCode: "reward_refund", compensatesEntryId: "debit-1", sourceEventId: "redemption:red-1:refund" });
    expect(reversed.redemption).toMatchObject({ status: "cancelled", refundLedgerEntryId: "refund-1", debitLedgerEntryId: "debit-1" });
    const afterRefund = appendEntries(afterDebit, [reversed.refund]);
    expect(afterRefund).toHaveLength(3);
    expect(afterRefund[1]).toEqual(approved.debit);
    expect(balance(afterRefund, "child-1")).toBe(50);
    const summary = summariseLedger(afterRefund, "child-1");
    expect(summary).toMatchObject({ redeemed: 40, refunded: 40, balance: 50 });
  });

  it("can also reverse a fulfilled reward, but only once", () => {
    const ledger = ledgerWith(50);
    const approved = approveRedemption(requested(ledger), { actor: parent, now: T1, ledger, debitEntryId: "debit-1" });
    const fulfilled = fulfilRedemption(approved.redemption, { actor: parent, now: T2 });
    const reversed = reverseRedemption(fulfilled, { actor: parent, now: T2, refundEntryId: "refund-1", reason: "Returned" });
    const after = appendEntries(appendEntries(ledger, [approved.debit]), [reversed.refund]);
    expect(code(() => reverseRedemption(reversed.redemption, { actor: parent, now: T2, refundEntryId: "refund-2", reason: "again" }))).toBe("invalid_transition");
    const replay = reverseRedemption(fulfilled, { actor: parent, now: T2, refundEntryId: "refund-2", reason: "again" });
    expect(code(() => appendEntries(after, [replay.refund]))).toBe("duplicate_source_event");
  });
});

describe("manual bonus and redemption together", () => {
  it("lets a parent bonus fund a redemption while staying separate from learning points", () => {
    const bonus = createManualParentBonus({ id: "bonus", childId: "child-1", points: 30, reason: "Kindness", sourceEventId: "bonus-form", createdAt: T0 });
    const ledger = appendEntries(ledgerWith(20), [bonus]);
    const approved = approveRedemption(requested(ledger, 45), { actor: parent, now: T1, ledger, debitEntryId: "d" });
    const after = appendEntries(ledger, [approved.debit]);
    expect(summariseLedger(after, "child-1")).toMatchObject({ learningEarned: 20, manualParentBonus: 30, redeemed: 45, balance: 5 });
  });
});
