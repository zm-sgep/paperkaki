import { activityRewardOf, awardForMockResult, awardForPractice, awardSafely, getActivityReward, mockResultEventId, practiceEventId, type ActivityReward } from "@/application/rewards";
import { todayInSingapore } from "@/domain/assessments/dates";
import {
  PARENT_REASON_LABELS,
  earnedSummary,
  historyLabel,
  morePointsText,
  nearestReward,
  progressToward,
  rewardSymbol,
  singaporeWeekStart,
  unavailableReason,
  weeklyLimitReached,
  type RedemptionStatus,
  type RewardReason,
  type SummaryDetails,
} from "@/domain/rewards";
import type { Database } from "@/repositories/postgres/client";
import { getReadyDb } from "@/repositories/postgres/ready";
import {
  countRequestsSince,
  getBalance,
  getLatestDecision,
  listLedgerEntries,
  listParentRewards,
  listRedemptionsForChildren,
} from "@/repositories/postgres/rewards";
import type { ParentRewardRow, PointLedgerRow, RewardRedemptionRow } from "@/repositories/postgres/schema";
import type { CurrentChild } from "./current-child";
import { getParentChildren } from "./children";

/**
 * What the Rewards screens and the small "points" glances show, for the child and for the parent. Everything
 * is read from the ledger and the catalogue; nothing here decides a point. Only the caller's own child, own
 * rewards and own requests are ever returned.
 */

type Context = { db?: Database; now?: Date };

async function resolveDb(context: Context): Promise<Database> {
  return context.db ?? (await getReadyDb());
}

const dayFormat = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" });
const shortDay = (date: Date): string => dayFormat.format(date);

/** How long the "+14 Learning Points" line stays on Today after an activity. */
const RECENT_LINE_MINUTES = 45;

// ---------------------------------------------------------------------------
// Ledger helpers
// ---------------------------------------------------------------------------

type LedgerCalculation = { breakdown?: { reason: RewardReason; points: number }[]; details?: SummaryDetails };

function calculationOf(row: PointLedgerRow): LedgerCalculation {
  return (row.calculation ?? {}) as LedgerCalculation;
}

/** One ledger row in a family's words. */
function historyLine(row: PointLedgerRow, rewardTitles: ReadonlyMap<string, string>): string {
  const details = calculationOf(row).details;
  const redemptionId = row.origin === "redemption" ? row.sourceId : null;
  const learning = row.origin === "learning" ? calculationOf(row).breakdown?.map((item) => item.reason) : undefined;
  if (learning && learning.length > 0) return earnedSummary(learning, details ?? {}).replace(/\.$/, "");
  return historyLabel(
    { origin: row.origin as "learning", reasonCode: row.reasonCode as RewardReason, note: row.note ?? undefined },
    { ...(redemptionId && rewardTitles.get(redemptionId) ? { rewardTitle: rewardTitles.get(redemptionId) as string } : {}) },
  );
}

// ---------------------------------------------------------------------------
// The child
// ---------------------------------------------------------------------------

export type ChildRewardCard = {
  id: string;
  title: string;
  description: string | null;
  symbol: string;
  cost: number;
  /** "12 more points", or null once the child has enough. */
  moreText: string | null;
  /** 0..1 */
  progress: number;
  /** "ready": can be asked for; "waiting": already asked; "more": not enough points yet; "limit": asked enough this week. */
  state: "ready" | "waiting" | "more" | "limit";
};

export type ChildRequestRow = {
  id: string;
  title: string;
  symbol: string;
  status: RedemptionStatus;
  /** Plain words: never a code. */
  statusText: string;
  dayText: string;
  canTakeBack: boolean;
};

export type ChildRewards = {
  balance: number;
  rewards: ChildRewardCard[];
  requests: ChildRequestRow[];
  recent: { label: string; amount: number; dayText: string }[];
  /** True until the child has asked for anything: the first ask explains that a parent decides. */
  firstAsk: boolean;
};

const STATUS_TEXT: Record<RedemptionStatus, string> = {
  requested: "Waiting for your grown-up",
  approved: "Your grown-up said yes",
  fulfilled: "Given. Enjoy!",
  rejected: "Not this time",
  cancelled: "Taken back",
};

function isOffered(reward: ParentRewardRow, childId: string, today: string): boolean {
  return (reward.childId === null || reward.childId === childId) && unavailableReason(reward, today) === null;
}

function titlesOf(rows: readonly PointLedgerRow[], redemptions: readonly RewardRedemptionRow[]): Map<string, string> {
  const wanted = new Set(rows.flatMap((row) => (row.origin === "redemption" && row.sourceId ? [row.sourceId] : [])));
  return new Map(redemptions.filter((redemption) => wanted.has(redemption.id)).map((redemption) => [redemption.id, redemption.titleSnapshot]));
}

/** The child's Rewards screen. */
export async function getChildRewards(child: CurrentChild, context: Context = {}): Promise<ChildRewards> {
  const db = await resolveDb(context);
  const now = context.now ?? new Date();
  const today = todayInSingapore(now);
  const weekStart = new Date(`${singaporeWeekStart(today)}T00:00:00+08:00`);
  const [balance, catalogue, redemptions, ledger] = await Promise.all([
    getBalance(db, child.childId),
    listParentRewards(db, child.parentProfileId),
    listRedemptionsForChildren(db, [child.childId]),
    listLedgerEntries(db, child.childId, { limit: 6 }),
  ]);
  const waiting = new Set(redemptions.filter((redemption) => redemption.status === "requested").map((redemption) => redemption.rewardId));
  const cards: ChildRewardCard[] = [];
  for (const reward of catalogue.filter((entry) => isOffered(entry, child.childId, today))) {
    const limited = weeklyLimitReached(await countRequestsSince(db, child.childId, reward.id, weekStart), reward.weeklyLimit);
    const more = morePointsText(balance, reward.cost);
    cards.push({
      id: reward.id,
      title: reward.title,
      description: reward.description,
      symbol: rewardSymbol(reward.icon),
      cost: reward.cost,
      moreText: more,
      progress: progressToward(balance, reward.cost),
      state: waiting.has(reward.id) ? "waiting" : limited ? "limit" : more ? "more" : "ready",
    });
  }
  const titles = titlesOf(ledger, redemptions);
  return {
    balance,
    rewards: cards.sort((a, b) => a.cost - b.cost),
    requests: redemptions.slice(0, 8).map((redemption) => ({
      id: redemption.id,
      title: redemption.titleSnapshot,
      symbol: rewardSymbol(redemption.iconSnapshot),
      status: redemption.status as RedemptionStatus,
      statusText: STATUS_TEXT[redemption.status as RedemptionStatus],
      dayText: shortDay(redemption.requestedAt),
      canTakeBack: redemption.status === "requested",
    })),
    recent: ledger.map((row) => ({ label: historyLine(row, titles), amount: row.amount, dayText: shortDay(row.createdAt) })),
    firstAsk: redemptions.length === 0,
  };
}

export type PointsGlance = {
  balance: number;
  /** "Ice cream: 12 more points", or "You can ask for Ice cream". Null when the parent has no rewards on offer. */
  nearest: { title: string; symbol: string; text: string } | null;
  /** The line for what was just earned, shown briefly on Today. Null when nothing was earned lately. */
  justEarned: string | null;
};

/** Points and the nearest reward, for Today's quiet secondary line. */
export async function getPointsGlance(child: CurrentChild, context: Context = {}): Promise<PointsGlance> {
  const db = await resolveDb(context);
  const now = context.now ?? new Date();
  const today = todayInSingapore(now);
  const [balance, catalogue, latest] = await Promise.all([
    getBalance(db, child.childId),
    listParentRewards(db, child.parentProfileId),
    getLatestDecision(db, child.childId, new Date(now.getTime() - RECENT_LINE_MINUTES * 60_000)),
  ]);
  const offered = catalogue.filter((reward) => isOffered(reward, child.childId, today));
  const near = nearestReward(offered, balance);
  const earned = latest && latest.points > 0 ? activityRewardOf(latest).line : null;
  return {
    balance,
    nearest: near
      ? { title: near.title, symbol: rewardSymbol(near.icon), text: morePointsText(balance, near.cost) ?? "You can ask for this now" }
      : null,
    justEarned: earned,
  };
}

/** What a practice set earned, for its end screen. Tries again if awarding did not finish earlier. */
export async function getPracticeReward(child: CurrentChild, sessionId: string, context: Context = {}): Promise<ActivityReward | null> {
  const db = await resolveDb(context);
  const now = context.now ?? new Date();
  return (
    (await getActivityReward(db, child.childId, practiceEventId(sessionId))) ??
    (await awardSafely(() => awardForPractice(db, child.childId, sessionId, now), "practice"))
  );
}

/** What a marked mock earned, for its results screen. Tries again if awarding did not finish earlier. */
export async function getMockReward(child: CurrentChild, attemptId: string, context: Context = {}): Promise<ActivityReward | null> {
  const db = await resolveDb(context);
  const now = context.now ?? new Date();
  return (
    (await getActivityReward(db, child.childId, mockResultEventId(attemptId))) ??
    (await awardSafely(() => awardForMockResult(db, child.childId, attemptId, now), "mock-result"))
  );
}

// ---------------------------------------------------------------------------
// The parent
// ---------------------------------------------------------------------------

export type ParentRequestRow = {
  id: string;
  childNickname: string;
  title: string;
  symbol: string;
  cost: number;
  status: "requested" | "approved";
  dayText: string;
  /** False when the child has spent points since asking: approving would fail. */
  canApprove: boolean;
  balance: number;
};

export type ParentRewardRow2 = {
  id: string;
  title: string;
  description: string | null;
  symbol: string;
  icon: string;
  cost: number;
  active: boolean;
  /** "All children", or the child's name. */
  forText: string;
  childId: string | null;
  weeklyLimit: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  /** A short line for the list: "Up to 2 a week · until 20 Dec". */
  notes: string;
};

export type ParentRewards =
  | { kind: "no_child" }
  | {
      kind: "ok";
      child: { id: string; nickname: string };
      children: { id: string; nickname: string }[];
      balance: number;
      week: {
        learning: number;
        bonus: number;
        /** The biggest reasons this week in plain words. */
        topReasons: { label: string; points: number }[];
      };
      pending: ParentRequestRow[];
      awaiting: ParentRequestRow[];
      rewards: ParentRewardRow2[];
      retired: ParentRewardRow2[];
      history: { id: string; label: string; amount: number; dayText: string; kind: "learning" | "bonus" | "reward" | "other" }[];
      pendingCount: number;
    };

function notesOf(reward: ParentRewardRow): string {
  const parts: string[] = [];
  if (reward.weeklyLimit !== null) parts.push(`Up to ${reward.weeklyLimit} a week`);
  if (reward.availableFrom && reward.availableUntil) parts.push(`${reward.availableFrom} to ${reward.availableUntil}`);
  else if (reward.availableFrom) parts.push(`From ${reward.availableFrom}`);
  else if (reward.availableUntil) parts.push(`Until ${reward.availableUntil}`);
  return parts.join(" · ");
}

export async function getParentRewards(parentProfileId: string, context: Context = {}): Promise<ParentRewards> {
  const db = await resolveDb(context);
  const now = context.now ?? new Date();
  const { children, selectedChildId } = await getParentChildren(parentProfileId, { db });
  const selected = children.find((child) => child.id === selectedChildId) ?? children[0];
  if (!selected) return { kind: "no_child" };
  const nameOf = new Map(children.map((child) => [child.id, child.nickname]));
  const weekStart = new Date(`${singaporeWeekStart(todayInSingapore(now))}T00:00:00+08:00`);

  const [catalogue, redemptions, ledger] = await Promise.all([
    listParentRewards(db, parentProfileId),
    listRedemptionsForChildren(db, children.map((child) => child.id), ["requested", "approved"]),
    listLedgerEntries(db, selected.id),
  ]);
  const balance = ledger.reduce((sum, row) => sum + row.amount, 0);
  const balances = new Map<string, number>([[selected.id, balance]]);
  for (const child of children) if (!balances.has(child.id)) balances.set(child.id, await getBalance(db, child.id));

  const requestRow = (row: RewardRedemptionRow): ParentRequestRow => ({
    id: row.id,
    childNickname: nameOf.get(row.childId) ?? "Your child",
    title: row.titleSnapshot,
    symbol: rewardSymbol(row.iconSnapshot),
    cost: row.pointsCostSnapshot,
    status: row.status as "requested" | "approved",
    dayText: shortDay(row.requestedAt),
    balance: balances.get(row.childId) ?? 0,
    canApprove: (balances.get(row.childId) ?? 0) >= row.pointsCostSnapshot,
  });
  const pending = redemptions.filter((row) => row.status === "requested").map(requestRow);
  const awaiting = redemptions.filter((row) => row.status === "approved").map(requestRow);

  // This week's points, learning and bonuses kept apart, with what earned them in plain words.
  const thisWeek = ledger.filter((row) => row.createdAt >= weekStart);
  const byReason = new Map<string, number>();
  let learning = 0;
  let bonus = 0;
  for (const row of thisWeek) {
    if (row.origin === "learning") {
      learning += row.amount;
      const breakdown = calculationOf(row).breakdown ?? [{ reason: row.reasonCode as RewardReason, points: row.amount }];
      for (const item of breakdown) byReason.set(item.reason, (byReason.get(item.reason) ?? 0) + item.points);
    } else if (row.origin === "parent_bonus") bonus += row.amount;
  }
  const topReasons = [...byReason.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, points]) => ({ label: PARENT_REASON_LABELS[reason as RewardReason], points }));

  const allRedemptions = await listRedemptionsForChildren(db, [selected.id]);
  const titles = titlesOf(ledger, allRedemptions);
  const rewardRow = (reward: ParentRewardRow): ParentRewardRow2 => ({
    id: reward.id,
    title: reward.title,
    description: reward.description,
    symbol: rewardSymbol(reward.icon),
    icon: reward.icon,
    cost: reward.cost,
    active: reward.active,
    forText: reward.childId ? (nameOf.get(reward.childId) ?? "One child") : "All children",
    childId: reward.childId,
    weeklyLimit: reward.weeklyLimit,
    availableFrom: reward.availableFrom,
    availableUntil: reward.availableUntil,
    notes: notesOf(reward),
  });

  return {
    kind: "ok",
    child: selected,
    children,
    balance,
    week: { learning, bonus, topReasons },
    pending,
    awaiting,
    rewards: catalogue.filter((reward) => reward.active).map(rewardRow),
    retired: catalogue.filter((reward) => !reward.active).map(rewardRow),
    history: ledger.slice(0, 15).map((row) => ({
      id: row.id,
      label: historyLine(row, titles),
      amount: row.amount,
      dayText: shortDay(row.createdAt),
      kind: row.origin === "learning" ? "learning" : row.origin === "parent_bonus" ? "bonus" : row.origin === "redemption" ? "reward" : "other",
    })),
    pendingCount: pending.length,
  };
}

/** The oldest waiting request across the parent's children, for Home's quiet line. */
export async function getWaitingRequest(
  parentProfileId: string,
  context: Context = {},
): Promise<{ count: number; childNickname: string; title: string } | null> {
  const db = await resolveDb(context);
  const { children } = await getParentChildren(parentProfileId, { db });
  const rows = await listRedemptionsForChildren(db, children.map((child) => child.id), ["requested"]);
  const first = rows[rows.length - 1];
  if (!first) return null;
  return {
    count: rows.length,
    childNickname: children.find((child) => child.id === first.childId)?.nickname ?? "Your child",
    title: first.titleSnapshot,
  };
}

