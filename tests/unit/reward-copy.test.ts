import { describe, expect, it } from "vitest";
import {
  earnedLine,
  earnedSummary,
  historyLabel,
  morePointsText,
  nearestReward,
  pointsHeadline,
  progressToward,
  rewardSymbol,
  singaporeWeekStart,
  unavailableReason,
  weeklyLimitReached,
} from "@/domain/rewards";

describe("Learning Points wording", () => {
  it("writes the line a child sees after a meaningful activity", () => {
    expect(earnedLine(14, ["improvement", "mistake_review"], { topicLabel: "Fractions", mistakeCount: 2 })).toBe(
      "+14 Learning Points · You improved in Fractions and reviewed two mistakes.",
    );
  });

  it("says Point when there is one, and keeps to two reasons", () => {
    expect(pointsHeadline(1)).toBe("+1 Learning Point");
    expect(earnedSummary(["first_mastery", "improvement", "mistake_review", "activity_completion"], { topicLabel: "Money" })).toBe(
      "You got really secure in Money and improved in Money.",
    );
  });

  it("names a single mistake and works without a topic", () => {
    expect(earnedSummary(["mistake_review"], { mistakeCount: 1 })).toBe("You reviewed one mistake.");
    expect(earnedSummary(["activity_completion"])).toBe("You worked hard.");
    expect(earnedSummary(["improvement"], { subject: "your mock" })).toBe("You improved in your mock.");
  });

  it("never uses the words a family should not see", () => {
    const text = [
      earnedSummary(["first_mastery", "weak_area_recovery"], { topicLabel: "Fractions" }),
      earnedSummary(["retention", "stretch_challenge"], { topicLabel: "Fractions" }),
      earnedSummary(["healthy_variety", "mistake_review"], { topicLabel: "Fractions", mistakeCount: 3 }),
    ].join(" ");
    expect(text).not.toMatch(/master(y|ed)\b|multiplier|penalt|farm|decay|%/i);
  });

  it("describes history entries in plain words", () => {
    expect(historyLabel({ origin: "parent_bonus", reasonCode: "manual_parent_bonus", note: "Helped with the shopping" })).toBe("Bonus: Helped with the shopping");
    expect(historyLabel({ origin: "redemption", reasonCode: "reward_redemption", note: undefined }, { rewardTitle: "Ice cream" })).toBe("Used for Ice cream");
  });
});

describe("the reward catalogue rules", () => {
  it("says how many more points are needed", () => {
    expect(morePointsText(8, 20)).toBe("12 more points");
    expect(morePointsText(19, 20)).toBe("1 more point");
    expect(morePointsText(20, 20)).toBeNull();
    expect(progressToward(5, 20)).toBe(0.25);
    expect(progressToward(50, 20)).toBe(1);
  });

  it("checks availability by day", () => {
    const reward = { active: true, availableFrom: "2026-10-01", availableUntil: "2026-10-31" };
    expect(unavailableReason(reward, "2026-09-30")).toBe("not_yet");
    expect(unavailableReason(reward, "2026-10-01")).toBeNull();
    expect(unavailableReason(reward, "2026-10-31")).toBeNull();
    expect(unavailableReason(reward, "2026-11-01")).toBe("ended");
    expect(unavailableReason({ ...reward, active: false }, "2026-10-05")).toBe("retired");
  });

  it("applies a weekly limit and finds the start of the Singapore week", () => {
    expect(weeklyLimitReached(1, 2)).toBe(false);
    expect(weeklyLimitReached(2, 2)).toBe(true);
    expect(weeklyLimitReached(9, null)).toBe(false);
    expect(singaporeWeekStart("2026-09-30")).toBe("2026-09-28");
    expect(singaporeWeekStart("2026-09-28")).toBe("2026-09-28");
    expect(singaporeWeekStart("2026-10-04")).toBe("2026-09-28");
  });

  it("picks the nearest reward to work towards", () => {
    const rewards = [{ cost: 50 }, { cost: 10 }, { cost: 25 }];
    expect(nearestReward(rewards, 12)).toEqual({ cost: 25 });
    expect(nearestReward(rewards, 100)).toEqual({ cost: 10 });
    expect(nearestReward([], 5)).toBeUndefined();
  });

  it("falls back to the default picture for an unknown one", () => {
    expect(rewardSymbol("treat")).toBe("🍦");
    expect(rewardSymbol("nonsense")).toBe(rewardSymbol("gift"));
  });
});
