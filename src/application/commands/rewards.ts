import { randomUUID } from "node:crypto";
import { InputError, NotFoundError } from "@/application/errors";
import type { CurrentChild } from "@/application/queries/current-child";
import { todayInSingapore } from "@/domain/assessments/dates";
import {
  RedemptionError,
  approveRedemption,
  cancelRedemption,
  createManualParentBonus,
  fulfilRedemption,
  rejectRedemption,
  requestRedemption,
  singaporeWeekStart,
  unavailableReason,
  weeklyLimitReached,
  type LedgerEntry,
  type MasteryState,
  type Redemption,
  type RedemptionActor,
  type RewardReason,
} from "@/domain/rewards";
import { recordAuditEvent } from "@/lib/audit";
import { getOwnedChild } from "@/repositories/postgres/assessments";
import type { Database } from "@/repositories/postgres/client";
import {
  countRequestsSince,
  getOwnedReward,
  getRewardById,
  insertLedgerEntry,
  insertParentReward,
  insertRedemption,
  listLedgerEntries,
  listRedemptionsForChildren,
  lockChildPoints,
  lockRedemption,
  updateOwnedReward,
  updateRedemption,
} from "@/repositories/postgres/rewards";
import type { PointLedgerRow, RewardRedemptionRow } from "@/repositories/postgres/schema";
import { BonusInputSchema, RewardInputSchema } from "@/schemas/rewards";
import { fieldErrorsOf } from "@/schemas/assessment-setup";
import { resolveCommandDb, type CommandContext } from "./children";

/**
 * Parent rewards and redemptions (Milestone 11). The parent defines what a reward is and decides every
 * request; the child only asks. Points are checked when a child asks and again when the parent approves, and
 * are taken off only on approval, in the same transaction as the ledger entry. The state machine and the
 * ledger rules live in src/domain/rewards; this module loads, checks ownership, calls them and stores.
 *
 * Anything that is not the caller's is "not found". A request already decided does nothing a second time.
 */

const iso = (date: Date): string => date.toISOString();

export function ledgerRowToEntry(row: PointLedgerRow): LedgerEntry {
  return {
    id: row.id,
    childId: row.childId,
    amount: row.amount,
    reasonCode: row.reasonCode as RewardReason,
    origin: row.origin as LedgerEntry["origin"],
    sourceEventId: row.sourceEventId,
    ...(row.policyVersion ? { policyVersion: row.policyVersion } : {}),
    ...(row.masteryBefore ? { masteryBefore: row.masteryBefore as MasteryState } : {}),
    ...(row.masteryAfter ? { masteryAfter: row.masteryAfter as MasteryState } : {}),
    ...(row.note ? { note: row.note } : {}),
    ...(row.compensatesEntryId ? { compensatesEntryId: row.compensatesEntryId } : {}),
    createdAt: iso(row.createdAt),
  };
}

function redemptionOf(row: RewardRedemptionRow): Redemption {
  return {
    id: row.id,
    rewardId: row.rewardId,
    childId: row.childId,
    ownerParentId: row.ownerParentId,
    status: row.status as Redemption["status"],
    pointsCostSnapshot: row.pointsCostSnapshot,
    requestedAt: iso(row.requestedAt),
    ...(row.decidedAt ? { decidedAt: iso(row.decidedAt) } : {}),
    ...(row.fulfilledAt ? { fulfilledAt: iso(row.fulfilledAt) } : {}),
    ...(row.decisionNote ? { decisionNote: row.decisionNote } : {}),
    ...(row.debitLedgerEntryId ? { debitLedgerEntryId: row.debitLedgerEntryId } : {}),
    ...(row.refundLedgerEntryId ? { refundLedgerEntryId: row.refundLedgerEntryId } : {}),
  };
}

/** A domain refusal, in words for the screen. */
function inputErrorOf(error: RedemptionError): InputError | NotFoundError {
  switch (error.code) {
    case "insufficient_balance":
      return new InputError({ form: "There aren't enough points for this yet." });
    case "invalid_transition":
      return new InputError({ form: "This request has already been dealt with." });
    case "not_authorised":
      return new NotFoundError();
    case "invalid_request":
      return new InputError({ form: "This reward can't be asked for." });
  }
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

export async function createReward(parentProfileId: string, raw: unknown, context: CommandContext = {}): Promise<{ rewardId: string }> {
  const db = await resolveCommandDb(context);
  const parsed = RewardInputSchema.safeParse(raw);
  if (!parsed.success) throw new InputError(fieldErrorsOf(parsed.error));
  const input = parsed.data;
  if (input.childId && !(await getOwnedChild(db, parentProfileId, input.childId))) throw new NotFoundError();
  return db.transaction(async (tx) => {
    const reward = await insertParentReward(tx, {
      parentProfileId,
      childId: input.childId,
      title: input.title,
      description: input.description,
      cost: input.cost,
      icon: input.icon,
      weeklyLimit: input.weeklyLimit,
      availableFrom: input.availableFrom,
      availableUntil: input.availableUntil,
    });
    await recordAuditEvent(tx, {
      action: "reward.created",
      entityType: "reward",
      entityId: reward.id,
      actorProfileId: parentProfileId,
      metadata: { cost: reward.cost },
      requestId: context.requestId ?? null,
    });
    return { rewardId: reward.id };
  });
}

/** Edits a reward. Requests already made keep the name and cost they were made with. */
export async function updateReward(parentProfileId: string, rewardId: string, raw: unknown, context: CommandContext = {}): Promise<void> {
  const db = await resolveCommandDb(context);
  const parsed = RewardInputSchema.safeParse(raw);
  if (!parsed.success) throw new InputError(fieldErrorsOf(parsed.error));
  const input = parsed.data;
  if (!(await getOwnedReward(db, parentProfileId, rewardId))) throw new NotFoundError();
  if (input.childId && !(await getOwnedChild(db, parentProfileId, input.childId))) throw new NotFoundError();
  await db.transaction(async (tx) => {
    await updateOwnedReward(tx, parentProfileId, rewardId, {
      childId: input.childId,
      title: input.title,
      description: input.description,
      cost: input.cost,
      icon: input.icon,
      weeklyLimit: input.weeklyLimit,
      availableFrom: input.availableFrom,
      availableUntil: input.availableUntil,
    });
    await recordAuditEvent(tx, {
      action: "reward.updated",
      entityType: "reward",
      entityId: rewardId,
      actorProfileId: parentProfileId,
      metadata: { cost: input.cost },
      requestId: context.requestId ?? null,
    });
  });
}

/** Retires a reward (no longer offered) or brings it back. History is kept either way. */
export async function setRewardActive(parentProfileId: string, rewardId: string, active: boolean, context: CommandContext = {}): Promise<void> {
  const db = await resolveCommandDb(context);
  const reward = await getOwnedReward(db, parentProfileId, rewardId);
  if (!reward) throw new NotFoundError();
  if (reward.active === active) return;
  await db.transaction(async (tx) => {
    await updateOwnedReward(tx, parentProfileId, rewardId, { active });
    await recordAuditEvent(tx, {
      action: active ? "reward.restored" : "reward.retired",
      entityType: "reward",
      entityId: rewardId,
      actorProfileId: parentProfileId,
      requestId: context.requestId ?? null,
    });
  });
}

// ---------------------------------------------------------------------------
// Bonus points
// ---------------------------------------------------------------------------

/**
 * "Give bonus points": a parent's own gift, with a required reason. It is its own kind of entry, never
 * counted as learning. `submissionId` makes a double tap give once.
 */
export async function giveBonus(
  parentProfileId: string,
  childId: string,
  raw: unknown,
  submissionId: string,
  context: CommandContext = {},
): Promise<{ given: boolean; points: number }> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  const parsed = BonusInputSchema.safeParse(raw);
  if (!parsed.success) throw new InputError(fieldErrorsOf(parsed.error));
  const child = await getOwnedChild(db, parentProfileId, childId);
  if (!child || child.archivedAt) throw new NotFoundError();
  const key = /^[0-9a-f-]{36}$/i.test(submissionId) ? submissionId : randomUUID();
  const entry = createManualParentBonus({
    id: randomUUID(),
    childId,
    points: parsed.data.points,
    reason: parsed.data.reason,
    sourceEventId: `parent-bonus:${key}`,
    createdAt: iso(now),
  });
  return db.transaction(async (tx) => {
    await lockChildPoints(tx, childId);
    const stored = await insertLedgerEntry(tx, {
      id: entry.id,
      childId,
      amount: entry.amount,
      origin: entry.origin,
      reasonCode: entry.reasonCode,
      sourceType: "parent",
      sourceId: parentProfileId,
      sourceEventId: entry.sourceEventId,
      note: entry.note ?? null,
      createdAt: now,
    });
    if (!stored) return { given: false, points: parsed.data.points };
    await recordAuditEvent(tx, {
      action: "reward.bonus_given",
      entityType: "child",
      entityId: childId,
      actorProfileId: parentProfileId,
      metadata: { points: parsed.data.points },
      requestId: context.requestId ?? null,
    });
    return { given: true, points: parsed.data.points };
  });
}

// ---------------------------------------------------------------------------
// The child asks
// ---------------------------------------------------------------------------

export type RequestOutcome = { status: "requested" | "already_waiting"; redemptionId: string };

/** "Ask for this": checks the reward is on offer and the points are there, and sends the request to the parent. Nothing is taken off yet. */
export async function requestReward(child: CurrentChild, rewardId: string, context: CommandContext = {}): Promise<RequestOutcome> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  const reward = await getRewardById(db, rewardId);
  // Only the child's own parent's rewards, and only ones offered to this child.
  if (!reward || reward.parentProfileId !== child.parentProfileId || (reward.childId !== null && reward.childId !== child.childId)) throw new NotFoundError();
  const today = todayInSingapore(now);
  if (unavailableReason(reward, today) !== null) throw new InputError({ form: "This reward isn't available right now." });
  if (weeklyLimitReached(await countRequestsSince(db, child.childId, reward.id, startOfWeek(today)), reward.weeklyLimit)) {
    throw new InputError({ form: "You've already asked for this one this week. You can ask again next week." });
  }

  return db.transaction(async (tx) => {
    await lockChildPoints(tx, child.childId);
    const ledger = (await listLedgerEntries(tx, child.childId)).map(ledgerRowToEntry);
    let redemption: Redemption;
    try {
      redemption = requestRedemption({
        id: randomUUID(),
        rewardId: reward.id,
        childId: child.childId,
        ownerParentId: reward.parentProfileId,
        pointsCost: reward.cost,
        now: iso(now),
        ledger,
      });
    } catch (error) {
      if (error instanceof RedemptionError) throw inputErrorOf(error);
      throw error;
    }
    const stored = await insertRedemption(tx, {
      id: redemption.id,
      rewardId: reward.id,
      childId: child.childId,
      ownerParentId: reward.parentProfileId,
      status: "requested",
      pointsCostSnapshot: redemption.pointsCostSnapshot,
      titleSnapshot: reward.title,
      iconSnapshot: reward.icon,
      requestedAt: now,
    });
    if (!stored) {
      // Already waiting on this reward (a second tap): that request is the answer.
      const waiting = (await listWaiting(tx, child.childId, reward.id)) ?? redemption.id;
      return { status: "already_waiting" as const, redemptionId: waiting };
    }
    await recordAuditEvent(tx, {
      action: "reward.requested",
      entityType: "redemption",
      entityId: stored.id,
      actorProfileId: child.parentProfileId,
      metadata: { rewardId: reward.id, cost: redemption.pointsCostSnapshot },
      requestId: context.requestId ?? null,
    });
    return { status: "requested" as const, redemptionId: stored.id };
  });
}

function startOfWeek(today: string): Date {
  return new Date(`${singaporeWeekStart(today)}T00:00:00+08:00`);
}

async function listWaiting(db: Database, childId: string, rewardId: string): Promise<string | null> {
  const rows = await listRedemptionsForChildren(db, [childId], ["requested"]);
  return rows.find((row) => row.rewardId === rewardId)?.id ?? null;
}

/** The child takes a waiting request back. No points move. */
export async function cancelRequest(child: CurrentChild, redemptionId: string, context: CommandContext = {}): Promise<void> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  await db.transaction(async (tx) => {
    const row = await lockRedemption(tx, redemptionId);
    if (!row || row.childId !== child.childId) throw new NotFoundError();
    if (row.status === "cancelled") return;
    let next: Redemption;
    try {
      next = cancelRedemption(redemptionOf(row), { actor: { role: "child", childId: child.childId }, now: iso(now) });
    } catch (error) {
      if (error instanceof RedemptionError) throw inputErrorOf(error);
      throw error;
    }
    await updateRedemption(tx, row.id, { status: next.status, decidedAt: now });
    await recordAuditEvent(tx, {
      action: "reward.request_cancelled",
      entityType: "redemption",
      entityId: row.id,
      actorProfileId: child.parentProfileId,
      requestId: context.requestId ?? null,
    });
  });
}

// ---------------------------------------------------------------------------
// The parent decides
// ---------------------------------------------------------------------------

async function ownedRedemption(tx: Database, parentProfileId: string, redemptionId: string): Promise<RewardRedemptionRow> {
  const row = await lockRedemption(tx, redemptionId);
  if (!row || row.ownerParentId !== parentProfileId) throw new NotFoundError();
  return row;
}

const parentActor = (parentProfileId: string): RedemptionActor => ({ role: "parent", parentId: parentProfileId });

/**
 * Says yes. The balance is checked again against the ledger as it is now, and the points come off in the same
 * transaction as the status change. Approving twice takes them off once.
 */
export async function approveRequest(parentProfileId: string, redemptionId: string, context: CommandContext = {}): Promise<void> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  await db.transaction(async (tx) => {
    const row = await ownedRedemption(tx, parentProfileId, redemptionId);
    if (row.status === "approved" || row.status === "fulfilled") return;
    await lockChildPoints(tx, row.childId);
    const ledger = (await listLedgerEntries(tx, row.childId)).map(ledgerRowToEntry);
    let result: ReturnType<typeof approveRedemption>;
    try {
      result = approveRedemption(redemptionOf(row), { actor: parentActor(parentProfileId), now: iso(now), ledger, debitEntryId: randomUUID() });
    } catch (error) {
      if (error instanceof RedemptionError) throw inputErrorOf(error);
      throw error;
    }
    const { debit } = result;
    const stored = await insertLedgerEntry(tx, {
      id: debit.id,
      childId: row.childId,
      amount: debit.amount,
      origin: debit.origin,
      reasonCode: debit.reasonCode,
      sourceType: "redemption",
      sourceId: row.id,
      sourceEventId: debit.sourceEventId,
      calculation: debit.calculation ?? null,
      createdAt: now,
    });
    if (!stored) throw new InputError({ form: "This request has already been dealt with." });
    await updateRedemption(tx, row.id, { status: "approved", decidedAt: now, debitLedgerEntryId: stored.id });
    await recordAuditEvent(tx, {
      action: "reward.approved",
      entityType: "redemption",
      entityId: row.id,
      actorProfileId: parentProfileId,
      metadata: { cost: row.pointsCostSnapshot },
      requestId: context.requestId ?? null,
    });
  });
}

/** Says "not now". No points move. */
export async function rejectRequest(parentProfileId: string, redemptionId: string, context: CommandContext = {}): Promise<void> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  await db.transaction(async (tx) => {
    const row = await ownedRedemption(tx, parentProfileId, redemptionId);
    if (row.status === "rejected") return;
    let next: Redemption;
    try {
      next = rejectRedemption(redemptionOf(row), { actor: parentActor(parentProfileId), now: iso(now) });
    } catch (error) {
      if (error instanceof RedemptionError) throw inputErrorOf(error);
      throw error;
    }
    await updateRedemption(tx, row.id, { status: next.status, decidedAt: now });
    await recordAuditEvent(tx, {
      action: "reward.rejected",
      entityType: "redemption",
      entityId: row.id,
      actorProfileId: parentProfileId,
      requestId: context.requestId ?? null,
    });
  });
}

/** Marks the real-world reward as given. */
export async function fulfilRequest(parentProfileId: string, redemptionId: string, context: CommandContext = {}): Promise<void> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  await db.transaction(async (tx) => {
    const row = await ownedRedemption(tx, parentProfileId, redemptionId);
    if (row.status === "fulfilled") return;
    let next: Redemption;
    try {
      next = fulfilRedemption(redemptionOf(row), { actor: parentActor(parentProfileId), now: iso(now) });
    } catch (error) {
      if (error instanceof RedemptionError) throw inputErrorOf(error);
      throw error;
    }
    await updateRedemption(tx, row.id, { status: next.status, fulfilledAt: now });
    await recordAuditEvent(tx, {
      action: "reward.fulfilled",
      entityType: "redemption",
      entityId: row.id,
      actorProfileId: parentProfileId,
      requestId: context.requestId ?? null,
    });
  });
}
