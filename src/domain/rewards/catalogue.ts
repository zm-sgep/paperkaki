/**
 * The parent's reward catalogue: the small built-in icon set, availability and the wording of progress
 * (spec sections 9 and 10). Pure rules; the parent decides what the rewards are and the app suggests none.
 */

/** Icons a parent can pick from. A small fixed set: no uploads, nothing to moderate. */
export const REWARD_ICONS = {
  gift: { label: "Gift", symbol: "🎁" },
  treat: { label: "Treat", symbol: "🍦" },
  outing: { label: "Outing", symbol: "🎢" },
  screen: { label: "Screen time", symbol: "📺" },
  game: { label: "Game", symbol: "🎲" },
  book: { label: "Book", symbol: "📚" },
  sport: { label: "Sport", symbol: "⚽" },
  star: { label: "Star", symbol: "⭐" },
} as const;

export type RewardIcon = keyof typeof REWARD_ICONS;
export const REWARD_ICON_KEYS = Object.keys(REWARD_ICONS) as RewardIcon[];
export const DEFAULT_REWARD_ICON: RewardIcon = "gift";

export function isRewardIcon(value: string): value is RewardIcon {
  return Object.hasOwn(REWARD_ICONS, value);
}

export function rewardSymbol(icon: string): string {
  return isRewardIcon(icon) ? REWARD_ICONS[icon].symbol : REWARD_ICONS[DEFAULT_REWARD_ICON].symbol;
}

export type Availability = {
  active: boolean;
  /** Singapore calendar days, "YYYY-MM-DD". Compares correctly as text. */
  availableFrom: string | null;
  availableUntil: string | null;
};

export type Unavailable = "retired" | "not_yet" | "ended";

/** Why a reward cannot be asked for today, or null when it can. */
export function unavailableReason(reward: Availability, today: string): Unavailable | null {
  if (!reward.active) return "retired";
  if (reward.availableFrom !== null && today < reward.availableFrom) return "not_yet";
  if (reward.availableUntil !== null && today > reward.availableUntil) return "ended";
  return null;
}

/** "12 more points", "1 more point", or null when the child already has enough. */
export function morePointsText(balance: number, cost: number): string | null {
  const missing = cost - balance;
  if (missing <= 0) return null;
  return `${missing} more ${missing === 1 ? "point" : "points"}`;
}

/** 0..1, for a progress bar. Never above 1. */
export function progressToward(balance: number, cost: number): number {
  if (cost <= 0) return 1;
  return Math.min(1, Math.max(0, balance / cost));
}

/** True once the child has made as many requests this week as the limit allows. */
export function weeklyLimitReached(requestsThisWeek: number, limit: number | null): boolean {
  return limit !== null && requestsThisWeek >= limit;
}

/** The Monday that began the Singapore week containing `day`, "YYYY-MM-DD". */
export function singaporeWeekStart(day: string): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(year, month - 1, date));
  const sinceMonday = (probe.getUTCDay() + 6) % 7;
  probe.setUTCDate(probe.getUTCDate() - sinceMonday);
  return probe.toISOString().slice(0, 10);
}

/**
 * The nearest reward to work towards: the cheapest one the child has not yet reached, else the cheapest
 * overall. Only rewards that can be asked for are considered.
 */
export function nearestReward<T extends { cost: number }>(rewards: readonly T[], balance: number): T | undefined {
  const sorted = [...rewards].sort((a, b) => a.cost - b.cost);
  return sorted.find((reward) => reward.cost > balance) ?? sorted[0];
}
