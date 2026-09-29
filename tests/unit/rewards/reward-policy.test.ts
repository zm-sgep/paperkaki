import { describe, expect, it } from "vitest";
import { REWARD_POLICY_V1, validateRewardPolicy, type RewardPolicy } from "@/domain/rewards";

describe("REWARD_POLICY_V1", () => {
  it("is versioned and matches the spec's starting values", () => {
    expect(REWARD_POLICY_V1.version).toBe("rewards-v1");
    expect(REWARD_POLICY_V1.basePoints).toEqual({
      short_practice: 5,
      targeted_practice: 10,
      mock: 18,
      mistake_review: 6,
      retention_check: 6,
    });
    expect(REWARD_POLICY_V1.masteryNeedMultiplier).toEqual({
      not_started: 1.2,
      learning: 1.6,
      developing: 1.4,
      almost_mastered: 1.2,
      mastered: 0.3,
      retained: 0.2,
    });
    expect(REWARD_POLICY_V1.difficultyMultiplier).toEqual({ basic: 1.0, standard: 1.15, challenging: 1.3 });
    expect(REWARD_POLICY_V1.repeatAttempt).toBe(0.15);
    expect(REWARD_POLICY_V1.improvement.bonusMax).toBe(0.5);
    expect(REWARD_POLICY_V1.varietyBonus).toBe(0.15);
    expect(REWARD_POLICY_V1.retention.bonus).toBe(0.35);
    expect(REWARD_POLICY_V1.masteryBonus).toBe(12);
    expect(REWARD_POLICY_V1.sameFamilyDecay).toEqual([1.0, 0.6, 0.25, 0.1]);
    expect(REWARD_POLICY_V1.masteredTopicSessionDecay).toEqual([1.0, 0.35, 0.1, 0.0]);
  });

  it("is valid and deeply immutable", () => {
    expect(validateRewardPolicy(REWARD_POLICY_V1)).toEqual([]);
    expect(Object.isFrozen(REWARD_POLICY_V1)).toBe(true);
    expect(Object.isFrozen(REWARD_POLICY_V1.basePoints)).toBe(true);
    expect(Object.isFrozen(REWARD_POLICY_V1.sameFamilyDecay)).toBe(true);
    expect(() => {
      (REWARD_POLICY_V1.basePoints as Record<string, number>).mock = 99;
    }).toThrow();
  });
});

describe("validateRewardPolicy", () => {
  const edit = (change: (policy: RewardPolicy) => void): string[] => {
    const copy = structuredClone(REWARD_POLICY_V1) as RewardPolicy;
    change(copy);
    return validateRewardPolicy(copy);
  };

  it("rejects negative, non-finite and out-of-range values", () => {
    expect(edit((p) => { p.basePoints.mock = -1; })).toHaveLength(1);
    expect(edit((p) => { p.varietyBonus = Number.NaN; })).toHaveLength(1);
    expect(edit((p) => { p.repeatAttempt = 1.5; })).not.toHaveLength(0);
    expect(edit((p) => { p.cooldown.multiplier = 2; })).toHaveLength(1);
  });

  it("requires a whole-number mastery bonus, a version and caps at or above base points", () => {
    expect(edit((p) => { p.masteryBonus = 1.5; })).toHaveLength(1);
    expect(edit((p) => { p.version = " "; })).toHaveLength(1);
    expect(edit((p) => { p.activityCap.mock = 1; })).toHaveLength(1);
  });

  it("requires decay lists to start at 1, be non-empty and never increase", () => {
    expect(edit((p) => { p.sameFamilyDecay = []; })).not.toHaveLength(0);
    expect(edit((p) => { p.sameFamilyDecay = [0.9, 0.5]; })).toHaveLength(1);
    expect(edit((p) => { p.masteredTopicSessionDecay = [1, 0.2, 0.5]; })).toHaveLength(1);
  });
});
