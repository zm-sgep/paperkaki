import { describe, expect, it } from "vitest";
import {
  LedgerError,
  REWARD_POLICY_V1,
  appendEntries,
  balance,
  calculateReward,
  compensatingEntry,
  createManualParentBonus,
  entryFromDecision,
  reconcileBalance,
  summariseLedger,
  type LedgerEntry,
} from "@/domain/rewards";
import { scenarioA, scenarioB } from "./fixtures";

const NOW = "2026-09-29T08:00:00.000Z";

let counter = 0;
function earned(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  counter += 1;
  return {
    id: `entry-${counter}`,
    childId: "child-1",
    amount: 10,
    reasonCode: "activity_completion",
    origin: "learning",
    sourceEventId: `event-${counter}`,
    policyVersion: "rewards-v1",
    createdAt: NOW,
    ...overrides,
  };
}

const errorCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof LedgerError ? error.code : "other";
  }
  return "none";
};

describe("appendEntries", () => {
  it("returns the old entries followed by the new ones without mutating either input", () => {
    const existing = [earned()];
    const added = [earned({ amount: 4 })];
    const snapshot = structuredClone({ existing, added });
    const result = appendEntries(existing, added);
    expect(result.map((entry) => entry.id)).toEqual([existing[0]!.id, added[0]!.id]);
    expect({ existing, added }).toEqual(snapshot);
    expect(result).not.toBe(existing);
  });

  it("keeps stored entries read-only", () => {
    const [stored] = appendEntries([], [earned()]);
    expect(Object.isFrozen(stored)).toBe(true);
    expect(() => {
      (stored as { amount: number }).amount = 999;
    }).toThrow();
  });

  it("rejects a duplicate source event for the same child (idempotency)", () => {
    const first = earned({ sourceEventId: "attempt-42" });
    const ledger = appendEntries([], [first]);
    expect(errorCode(() => appendEntries(ledger, [earned({ sourceEventId: "attempt-42" })]))).toBe("duplicate_source_event");
    expect(balance(ledger)).toBe(10);
  });

  it("rejects a duplicate inside one batch and applies nothing", () => {
    const existing = [earned()];
    const batch = [earned({ sourceEventId: "same" }), earned({ sourceEventId: "same" })];
    expect(errorCode(() => appendEntries(existing, batch))).toBe("duplicate_source_event");
    expect(existing).toHaveLength(1);
  });

  it("allows the same source event id for a different child", () => {
    const ledger = appendEntries([], [earned({ sourceEventId: "shared" })]);
    expect(() => appendEntries(ledger, [earned({ childId: "child-2", sourceEventId: "shared" })])).not.toThrow();
  });

  it("requires a source event id on every entry", () => {
    expect(errorCode(() => appendEntries([], [earned({ sourceEventId: "" })]))).toBe("invalid_entry");
  });

  it("rejects zero, fractional and wrongly signed amounts and learning entries without a policy version", () => {
    expect(errorCode(() => appendEntries([], [earned({ amount: 0 })]))).toBe("invalid_entry");
    expect(errorCode(() => appendEntries([], [earned({ amount: 2.5 })]))).toBe("invalid_entry");
    expect(errorCode(() => appendEntries([], [earned({ amount: -3 })]))).toBe("invalid_entry");
    expect(errorCode(() => appendEntries([], [earned({ policyVersion: undefined })]))).toBe("invalid_entry");
    expect(errorCode(() => appendEntries([], [earned({ reasonCode: "manual_parent_bonus" })]))).toBe("invalid_entry");
  });

  it("rejects a repeated entry id", () => {
    const first = earned();
    expect(errorCode(() => appendEntries([first], [earned({ id: first.id })]))).toBe("invalid_entry");
  });

  it("never lets a child's balance go below zero", () => {
    const ledger = appendEntries([], [earned({ amount: 5 })]);
    const debit = earned({ amount: -6, origin: "redemption", reasonCode: "reward_redemption", policyVersion: undefined });
    expect(errorCode(() => appendEntries(ledger, [debit]))).toBe("insufficient_balance");
  });
});

describe("balance and reconciliation", () => {
  it("balance is the sum of entries, per child when asked", () => {
    const ledger = appendEntries(
      [],
      [earned({ amount: 10 }), earned({ amount: 7 }), earned({ childId: "child-2", amount: 3 })],
    );
    expect(balance(ledger)).toBe(20);
    expect(balance(ledger, "child-1")).toBe(17);
    expect(balance(ledger, "child-2")).toBe(3);
    expect(balance([], "child-1")).toBe(0);
  });

  it("reconciles a cached balance against the ledger, which always wins", () => {
    const ledger = appendEntries([], [earned({ amount: 10 }), earned({ amount: 5 })]);
    expect(reconcileBalance(ledger, "child-1", 15)).toEqual({ matches: true, ledgerBalance: 15, difference: 0 });
    expect(reconcileBalance(ledger, "child-1", 18)).toEqual({ matches: false, ledgerBalance: 15, difference: 3 });
  });

  it("summary separates learning-earned points from manual parent bonuses", () => {
    const bonus = createManualParentBonus({
      id: "bonus-1", childId: "child-1", points: 20, reason: "Helped a sibling", sourceEventId: "form-1", createdAt: NOW,
    });
    const ledger = appendEntries([], [earned({ amount: 30 }), bonus]);
    expect(summariseLedger(ledger, "child-1")).toEqual({
      balance: 50, learningEarned: 30, manualParentBonus: 20, redeemed: 0, refunded: 0, corrections: 0,
    });
  });
});

describe("manual parent bonus", () => {
  const input = { id: "b1", childId: "child-1", points: 15, reason: "Great effort this week", sourceEventId: "form-9", createdAt: NOW };

  it("is marked as a parent bonus with its reason", () => {
    const entry = createManualParentBonus(input);
    expect(entry).toMatchObject({ origin: "parent_bonus", reasonCode: "manual_parent_bonus", amount: 15, note: "Great effort this week" });
    expect(entry.policyVersion).toBeUndefined();
  });

  it("needs a positive whole amount and a reason", () => {
    expect(errorCode(() => createManualParentBonus({ ...input, points: 0 }))).toBe("invalid_entry");
    expect(errorCode(() => createManualParentBonus({ ...input, points: -5 }))).toBe("invalid_entry");
    expect(errorCode(() => createManualParentBonus({ ...input, points: 1.5 }))).toBe("invalid_entry");
    expect(errorCode(() => createManualParentBonus({ ...input, reason: "  " }))).toBe("invalid_entry");
  });

  it("is idempotent on its source event id", () => {
    const ledger = appendEntries([], [createManualParentBonus(input)]);
    expect(errorCode(() => appendEntries(ledger, [createManualParentBonus({ ...input, id: "b2" })]))).toBe("duplicate_source_event");
  });
});

describe("corrections are compensating entries", () => {
  const meta = { id: "fix-1", sourceEventId: "fix-event-1", reason: "Awarded by mistake", createdAt: NOW };

  it("adds an opposite entry and leaves the original untouched", () => {
    const original = earned({ id: "orig", amount: 12 });
    const ledger = appendEntries([], [original]);
    const after = appendEntries(ledger, [compensatingEntry(original, meta)]);
    expect(after).toHaveLength(2);
    expect(after[0]).toEqual(original);
    expect(after[1]).toMatchObject({ amount: -12, origin: "correction", reasonCode: "manual_correction", compensatesEntryId: "orig" });
    expect(balance(after)).toBe(0);
  });

  it("can reverse an entry only once", () => {
    const original = earned({ id: "orig2", amount: 12 });
    const ledger = appendEntries([], [original, earned({ amount: 30 })]);
    const once = appendEntries(ledger, [compensatingEntry(original, meta)]);
    expect(errorCode(() => appendEntries(once, [compensatingEntry(original, { ...meta, id: "fix-2", sourceEventId: "fix-event-2" })]))).toBe(
      "duplicate_compensation",
    );
  });

  it("must point at a real entry and cancel it exactly", () => {
    const original = earned({ id: "orig3", amount: 12 });
    expect(errorCode(() => appendEntries([], [compensatingEntry(original, meta)]))).toBe("invalid_entry");
    const ledger = appendEntries([], [original]);
    expect(errorCode(() => appendEntries(ledger, [{ ...compensatingEntry(original, meta), amount: -5 }]))).toBe("invalid_entry");
  });

  it("cannot drive a balance negative", () => {
    const original = earned({ id: "orig4", amount: 12 });
    const spend = earned({ amount: -10, origin: "redemption", reasonCode: "reward_redemption", policyVersion: undefined });
    const ledger = appendEntries([], [original, spend]);
    expect(errorCode(() => appendEntries(ledger, [compensatingEntry(original, meta)]))).toBe("insufficient_balance");
  });
});

describe("entryFromDecision", () => {
  const policy = REWARD_POLICY_V1;

  it("stores the headline reason, policy version, mastery and the full calculation", () => {
    const context = scenarioA();
    const decision = calculateReward(context, policy);
    const entry = entryFromDecision(context, decision, { id: "e1", createdAt: NOW })!;
    expect(entry).toMatchObject({
      childId: "child-1",
      amount: decision.points,
      reasonCode: decision.reasonCodes[0],
      origin: "learning",
      sourceEventId: context.sourceEventId,
      policyVersion: "rewards-v1",
      masteryBefore: "developing",
      masteryAfter: "developing",
    });
    expect(entry.calculation).toMatchObject({ breakdown: decision.breakdown, multipliers: decision.multipliers, capped: false });
    expect(() => appendEntries([], [entry])).not.toThrow();
  });

  it("returns nothing for a zero-point decision, so the ledger never holds zero entries", () => {
    const context = scenarioB();
    expect(entryFromDecision(context, calculateReward(context, policy), { id: "e2", createdAt: NOW })).toBeUndefined();
  });

  it("makes duplicate awards impossible: a replayed event is rejected by the ledger", () => {
    const context = scenarioA();
    const decision = calculateReward(context, policy);
    const ledger = appendEntries([], [entryFromDecision(context, decision, { id: "e3", createdAt: NOW })!]);
    const replay = entryFromDecision(context, decision, { id: "e4", createdAt: NOW })!;
    expect(errorCode(() => appendEntries(ledger, [replay]))).toBe("duplicate_source_event");
    expect(balance(ledger)).toBe(decision.points);
  });
});
