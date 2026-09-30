import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  assessmentScopeItems,
  assessments,
  children,
  parentRewards,
  pointLedger,
  rewardDecisions,
  rewardPolicies,
  rewardRedemptions,
  type NewPointLedgerRow,
  type ParentRewardRow,
  type PointLedgerRow,
  type RewardDecisionRow,
  type RewardPolicyRow,
  type RewardRedemptionRow,
} from "./schema";

/**
 * Persistence for Learning Points and parent rewards. The ledger is append-only (a trigger enforces it), so
 * nothing here updates or deletes a ledger row. Reads that start from a reward or a request also take the
 * owner, so a wrong id and someone else's id look the same: nothing.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

// --- Policy ---------------------------------------------------------------

/** The policy in force at `at`: active, started, not ended; the newest start wins. */
export async function getActivePolicyRow(db: Database, at: Date): Promise<RewardPolicyRow | null> {
  const [row] = await db
    .select()
    .from(rewardPolicies)
    .where(
      and(
        eq(rewardPolicies.status, "active"),
        or(isNull(rewardPolicies.effectiveFrom), lte(rewardPolicies.effectiveFrom, at)),
        or(isNull(rewardPolicies.effectiveTo), sql`${rewardPolicies.effectiveTo} > ${at}`),
      ),
    )
    .orderBy(sql`${rewardPolicies.effectiveFrom} DESC NULLS LAST`, desc(rewardPolicies.createdAt))
    .limit(1);
  return row ?? null;
}

// --- Ledger ---------------------------------------------------------------

/** Serialises point movements for one child (an approval and an award cannot interleave). Call inside a transaction. */
export async function lockChildPoints(db: Database, childId: string): Promise<void> {
  await db.select({ id: children.id }).from(children).where(eq(children.id, childId)).for("update");
}

/** Adds one entry. Returns null when this child already has an entry for the source event (a repeat, not an error). */
export async function insertLedgerEntry(db: Database, row: NewPointLedgerRow): Promise<PointLedgerRow | null> {
  const [stored] = await db.insert(pointLedger).values(row).onConflictDoNothing({ target: [pointLedger.childId, pointLedger.sourceEventId] }).returning();
  return stored ?? null;
}

export async function getBalance(db: Database, childId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${pointLedger.amount}), 0)::int` })
    .from(pointLedger)
    .where(eq(pointLedger.childId, childId));
  return row?.total ?? 0;
}

export async function getLedgerEntryBySource(db: Database, childId: string, sourceEventId: string): Promise<PointLedgerRow | null> {
  const [row] = await db
    .select()
    .from(pointLedger)
    .where(and(eq(pointLedger.childId, childId), eq(pointLedger.sourceEventId, sourceEventId)))
    .limit(1);
  return row ?? null;
}

/** A child's entries, newest first. */
export async function listLedgerEntries(db: Database, childId: string, options: { since?: Date; limit?: number } = {}): Promise<PointLedgerRow[]> {
  const query = db
    .select()
    .from(pointLedger)
    .where(options.since ? and(eq(pointLedger.childId, childId), gte(pointLedger.createdAt, options.since)) : eq(pointLedger.childId, childId))
    .orderBy(desc(pointLedger.createdAt), desc(pointLedger.id));
  return options.limit ? query.limit(options.limit) : query;
}

/** True when this child was already paid the one-time mastery bonus for the scope. */
export async function hasFirstMasteryBonus(db: Database, childId: string, scopeKey: string): Promise<boolean> {
  const rows = await db
    .select({ id: pointLedger.id })
    .from(pointLedger)
    .where(
      and(
        eq(pointLedger.childId, childId),
        eq(pointLedger.origin, "learning"),
        sql`${pointLedger.calculation} -> 'reasonCodes' ? 'first_mastery'`,
        sql`${pointLedger.calculation} ->> 'scopeKey' = ${scopeKey}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// --- Decisions ------------------------------------------------------------

export type NewRewardDecision = typeof rewardDecisions.$inferInsert;

export async function insertDecision(db: Database, row: NewRewardDecision): Promise<RewardDecisionRow | null> {
  const [stored] = await db.insert(rewardDecisions).values(row).onConflictDoNothing({ target: [rewardDecisions.childId, rewardDecisions.sourceEventId] }).returning();
  return stored ?? null;
}

export async function getDecision(db: Database, childId: string, sourceEventId: string): Promise<RewardDecisionRow | null> {
  const [row] = await db
    .select()
    .from(rewardDecisions)
    .where(and(eq(rewardDecisions.childId, childId), eq(rewardDecisions.sourceEventId, sourceEventId)))
    .limit(1);
  return row ?? null;
}

export async function getLatestDecision(db: Database, childId: string, since: Date): Promise<RewardDecisionRow | null> {
  const [row] = await db
    .select()
    .from(rewardDecisions)
    .where(and(eq(rewardDecisions.childId, childId), gte(rewardDecisions.createdAt, since)))
    .orderBy(desc(rewardDecisions.createdAt), desc(rewardDecisions.id))
    .limit(1);
  return row ?? null;
}

// --- Catalogue ------------------------------------------------------------

export type NewParentReward = typeof parentRewards.$inferInsert;

export async function insertParentReward(db: Database, row: NewParentReward): Promise<ParentRewardRow> {
  const [stored] = await db.insert(parentRewards).values(row).returning();
  if (!stored) throw new Error("Reward was not stored.");
  return stored;
}

export async function getOwnedReward(db: Database, parentProfileId: string, rewardId: string): Promise<ParentRewardRow | null> {
  if (!isUuid(rewardId)) return null;
  const [row] = await db
    .select()
    .from(parentRewards)
    .where(and(eq(parentRewards.id, rewardId), eq(parentRewards.parentProfileId, parentProfileId)))
    .limit(1);
  return row ?? null;
}

export async function getRewardById(db: Database, rewardId: string): Promise<ParentRewardRow | null> {
  if (!isUuid(rewardId)) return null;
  const [row] = await db.select().from(parentRewards).where(eq(parentRewards.id, rewardId)).limit(1);
  return row ?? null;
}

export async function updateOwnedReward(
  db: Database,
  parentProfileId: string,
  rewardId: string,
  values: Partial<Omit<NewParentReward, "id" | "parentProfileId" | "createdAt">>,
): Promise<ParentRewardRow | null> {
  const [row] = await db
    .update(parentRewards)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(parentRewards.id, rewardId), eq(parentRewards.parentProfileId, parentProfileId)))
    .returning();
  return row ?? null;
}

/** A parent's rewards, oldest first: active ones and retired ones. */
export async function listParentRewards(db: Database, parentProfileId: string): Promise<ParentRewardRow[]> {
  return db.select().from(parentRewards).where(eq(parentRewards.parentProfileId, parentProfileId)).orderBy(asc(parentRewards.cost), asc(parentRewards.createdAt));
}

// --- Redemptions ----------------------------------------------------------

export type NewRedemption = typeof rewardRedemptions.$inferInsert;

export async function insertRedemption(db: Database, row: NewRedemption): Promise<RewardRedemptionRow | null> {
  const [stored] = await db.insert(rewardRedemptions).values(row).onConflictDoNothing().returning();
  return stored ?? null;
}

export async function getRedemption(db: Database, redemptionId: string): Promise<RewardRedemptionRow | null> {
  if (!isUuid(redemptionId)) return null;
  const [row] = await db.select().from(rewardRedemptions).where(eq(rewardRedemptions.id, redemptionId)).limit(1);
  return row ?? null;
}

/** Locks the request row for the rest of the transaction, so two taps decide it once. */
export async function lockRedemption(db: Database, redemptionId: string): Promise<RewardRedemptionRow | null> {
  if (!isUuid(redemptionId)) return null;
  const [row] = await db.select().from(rewardRedemptions).where(eq(rewardRedemptions.id, redemptionId)).for("update");
  return row ?? null;
}

export async function updateRedemption(
  db: Database,
  redemptionId: string,
  values: Partial<Omit<NewRedemption, "id" | "rewardId" | "childId" | "ownerParentId">>,
): Promise<RewardRedemptionRow> {
  const [row] = await db.update(rewardRedemptions).set(values).where(eq(rewardRedemptions.id, redemptionId)).returning();
  if (!row) throw new Error("Request was not found.");
  return row;
}

/** Requests of these children, newest first. */
export async function listRedemptionsForChildren(db: Database, childIds: readonly string[], statuses?: readonly string[]): Promise<RewardRedemptionRow[]> {
  if (childIds.length === 0) return [];
  return db
    .select()
    .from(rewardRedemptions)
    .where(
      statuses
        ? and(inArray(rewardRedemptions.childId, [...childIds]), inArray(rewardRedemptions.status, [...statuses]))
        : inArray(rewardRedemptions.childId, [...childIds]),
    )
    .orderBy(desc(rewardRedemptions.requestedAt), desc(rewardRedemptions.id));
}

/** How many requests this child has made for a reward since `since`, not counting rejected or taken-back ones. */
export async function countRequestsSince(db: Database, childId: string, rewardId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rewardRedemptions)
    .where(
      and(
        eq(rewardRedemptions.childId, childId),
        eq(rewardRedemptions.rewardId, rewardId),
        gte(rewardRedemptions.requestedAt, since),
        inArray(rewardRedemptions.status, ["requested", "approved", "fulfilled"]),
      ),
    );
  return row?.count ?? 0;
}

// --- Context lookups --------------------------------------------------------

/** The skills of the child's assessments that are still to come and have their topics confirmed. */
export async function listUpcomingScopeOutcomeIds(db: Database, childId: string, today: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ outcomeId: assessmentScopeItems.outcomeId })
    .from(assessmentScopeItems)
    .innerJoin(assessments, eq(assessments.id, assessmentScopeItems.assessmentId))
    .where(and(eq(assessments.childId, childId), eq(assessments.status, "scope_confirmed"), gte(assessments.date, today)));
  return rows.map((row) => row.outcomeId);
}
