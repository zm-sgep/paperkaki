/**
 * The words families read about Learning Points (UX_SPEC section 15, UX_PRINCIPLES sections 9 and 12).
 *
 * Reasons are shown in plain words, never as multipliers, factors or "farming" rules. A low award is never
 * described as a loss: the engine's own redirect line is shown instead. Nothing here decides a number.
 */
import type { LedgerEntry, LearningReason, RewardReason } from "./entities";

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function countWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

export function pointsText(points: number): string {
  return `${points} Learning ${points === 1 ? "Point" : "Points"}`;
}

/** "+14 Learning Points" */
export function pointsHeadline(points: number): string {
  return `+${pointsText(points)}`;
}

export type SummaryDetails = {
  /** The topic in the child's words, when the activity was about one. */
  topicLabel?: string | undefined;
  /** How many mistakes were gone through, for a mistake review. */
  mistakeCount?: number | undefined;
};

/** What the child did, as the end of "You ...": one short phrase per reason. */
function phraseFor(reason: LearningReason, details: SummaryDetails): string {
  const topic = details.topicLabel;
  switch (reason) {
    case "first_mastery":
      return topic ? `got really secure in ${topic}` : "got really secure in a skill";
    case "weak_area_recovery":
      return topic ? `bounced back in ${topic}` : "bounced back on something tricky";
    case "improvement":
      return topic ? `improved in ${topic}` : "improved";
    case "retention":
      return topic ? `remembered ${topic} after a break` : "remembered it after a break";
    case "stretch_challenge":
      return topic ? `took on a challenge in ${topic}` : "took on a challenge";
    case "mistake_review": {
      const count = details.mistakeCount;
      if (count === undefined || count <= 0) return "went back over your mistakes";
      return count === 1 ? "reviewed one mistake" : `reviewed ${countWord(count)} mistakes`;
    }
    case "healthy_variety":
      return topic ? `tried ${topic}, something new` : "tried something new";
    case "activity_completion":
      return topic ? `worked hard on ${topic}` : "worked hard";
  }
}

const LEARNING: readonly RewardReason[] = [
  "first_mastery",
  "weak_area_recovery",
  "improvement",
  "retention",
  "stretch_challenge",
  "mistake_review",
  "healthy_variety",
  "activity_completion",
];

/**
 * "You improved in Fractions and reviewed two mistakes." The two strongest reasons, in the engine's order
 * of importance; a reason that is not a learning reason is left out.
 */
export function earnedSummary(reasons: readonly RewardReason[], details: SummaryDetails = {}): string {
  const shown = LEARNING.filter((reason) => reasons.includes(reason)).slice(0, 2) as LearningReason[];
  if (shown.length === 0) return "You did some good learning.";
  return `You ${shown.map((reason) => phraseFor(reason, details)).join(" and ")}.`;
}

/** The one line after a meaningful activity: "+14 Learning Points · You improved in Fractions and reviewed two mistakes." */
export function earnedLine(points: number, reasons: readonly RewardReason[], details: SummaryDetails = {}): string {
  return `${pointsHeadline(points)} · ${earnedSummary(reasons, details)}`;
}

/** Reasons in a parent's words, for "what earned points this week". */
export const PARENT_REASON_LABELS: Record<RewardReason, string> = {
  activity_completion: "Finishing practice",
  improvement: "Improving",
  first_mastery: "Getting secure in a topic",
  weak_area_recovery: "Bouncing back on a weak topic",
  mistake_review: "Reviewing mistakes",
  retention: "Remembering after a break",
  healthy_variety: "Trying something new",
  stretch_challenge: "Taking on a challenge",
  manual_parent_bonus: "Bonus from you",
  reward_redemption: "Reward given",
  reward_refund: "Points returned",
  manual_correction: "Correction",
};

/** How one ledger entry reads in a history list. */
export function historyLabel(entry: Pick<LedgerEntry, "origin" | "reasonCode" | "note">, context: { rewardTitle?: string; topicLabel?: string } = {}): string {
  switch (entry.origin) {
    case "learning":
      return earnedSummary([entry.reasonCode], { topicLabel: context.topicLabel }).replace(/\.$/, "");
    case "parent_bonus":
      return entry.note ? `Bonus: ${entry.note}` : "Bonus from you";
    case "redemption":
      return entry.reasonCode === "reward_refund"
        ? `Points returned${context.rewardTitle ? ` for ${context.rewardTitle}` : ""}`
        : `Used for ${context.rewardTitle ?? "a reward"}`;
    case "correction":
      return entry.note ? `Correction: ${entry.note}` : "Correction";
  }
}
