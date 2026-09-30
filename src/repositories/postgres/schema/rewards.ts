import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { children, parentProfiles } from "./identity";

// Schema files use relative imports only: drizzle-kit loads them without the @/ alias.

/**
 * Learning Points and parent rewards (docs/DATA_MODEL.md section 11, docs/GAMIFICATION_REWARDS_SPEC.md,
 * ADR-0006).
 *
 * `reward_policies` holds the versioned numbers the RewardEngine reads. A published policy is never edited:
 * a change is a new version (a trigger keeps `version` and `policy` fixed once a row exists).
 *
 * `point_ledger` is the authoritative, append-only record of points. The balance is the sum of its rows. A
 * trigger (see the migration) rejects every UPDATE and DELETE, so a correction is a new compensating row.
 * `UNIQUE (child_id, source_event_id)` makes every automated award idempotent.
 *
 * `reward_decisions` records what the engine decided for one activity, including a zero-point decision and
 * the redirect it produced, so the child's end screen can be shown again and a retry never awards twice.
 *
 * `parent_rewards` and `reward_redemptions` are the parent's catalogue and the child's requests. Points are
 * deducted only when the parent approves, in the same transaction as the debit ledger row.
 */

export const rewardPolicies = pgTable(
  "reward_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: text("version").notNull(),
    status: text("status").notNull().default("draft"),
    policy: jsonb("policy").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    changeNotes: text("change_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("reward_policies_version_key").on(table.version),
    check("reward_policies_status", sql`${table.status} IN ('draft', 'active', 'retired')`),
    check("reward_policies_window", sql`${table.effectiveTo} IS NULL OR ${table.effectiveFrom} IS NULL OR ${table.effectiveTo} > ${table.effectiveFrom}`),
  ],
);

export const pointLedger = pgTable(
  "point_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "restrict" }),
    /** Positive earns, negative spends. Never zero. */
    amount: integer("amount").notNull(),
    origin: text("origin").notNull(),
    reasonCode: text("reason_code").notNull(),
    /** What caused it: "practice_session", "mistake_review", "mock_attempt", "redemption" or "parent". */
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    /** The idempotency key, unique per child. Required for every entry. */
    sourceEventId: text("source_event_id").notNull(),
    /** Required for learning entries: the policy the amount was worked out with. */
    policyVersion: text("policy_version"),
    masteryBefore: text("mastery_before"),
    masteryAfter: text("mastery_after"),
    /** The full calculation, for transparency (PRD 15.12). */
    calculation: jsonb("calculation"),
    /** A parent's reason for a bonus, or the reason for a correction or refund. */
    note: text("note"),
    /** Set on a compensating entry: the entry it reverses. At most one reversal each. */
    compensatesEntryId: uuid("compensates_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("point_ledger_child_source_event_key").on(table.childId, table.sourceEventId),
    uniqueIndex("point_ledger_compensates_key")
      .on(table.compensatesEntryId)
      .where(sql`${table.compensatesEntryId} IS NOT NULL`),
    index("idx_point_ledger_child_time").on(table.childId, table.createdAt),
    check("point_ledger_amount", sql`${table.amount} <> 0`),
    check("point_ledger_origin", sql`${table.origin} IN ('learning', 'parent_bonus', 'redemption', 'correction')`),
    check("point_ledger_source_event", sql`char_length(${table.sourceEventId}) > 0`),
    check("point_ledger_learning_policy", sql`${table.origin} <> 'learning' OR (${table.policyVersion} IS NOT NULL AND ${table.amount} > 0)`),
    check("point_ledger_bonus_note", sql`${table.origin} <> 'parent_bonus' OR (${table.amount} > 0 AND ${table.note} IS NOT NULL AND char_length(btrim(${table.note})) > 0)`),
  ],
);

export const rewardDecisions = pgTable(
  "reward_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "restrict" }),
    sourceEventId: text("source_event_id").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    activityType: text("activity_type").notNull(),
    points: integer("points").notNull(),
    reasonCodes: jsonb("reason_codes").notNull(),
    breakdown: jsonb("breakdown").notNull(),
    /** The encouraging redirect the engine produced when yield was low, or null. */
    redirect: jsonb("redirect"),
    /** Plain-word context for the summary line: the topic in the child's words, and how many mistakes were reviewed. */
    details: jsonb("details").notNull(),
    policyVersion: text("policy_version").notNull(),
    /** The ledger row this decision paid, or null when it earned nothing. */
    ledgerEntryId: uuid("ledger_entry_id").references(() => pointLedger.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("reward_decisions_child_source_event_key").on(table.childId, table.sourceEventId),
    index("idx_reward_decisions_child_time").on(table.childId, table.createdAt),
    check("reward_decisions_points", sql`${table.points} >= 0`),
    check("reward_decisions_paid", sql`(${table.points} > 0) = (${table.ledgerEntryId} IS NOT NULL)`),
  ],
);

export const parentRewards = pgTable(
  "parent_rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentProfileId: uuid("parent_profile_id")
      .notNull()
      .references(() => parentProfiles.id, { onDelete: "restrict" }),
    /** Null: offered to all of the parent's children. */
    childId: uuid("child_id").references(() => children.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    cost: integer("cost").notNull(),
    /** One of the small built-in set (src/domain/rewards/catalogue.ts). */
    icon: text("icon").notNull().default("gift"),
    active: boolean("active").notNull().default(true),
    /** Most requests that can be made in one Singapore week, or null for no limit. */
    weeklyLimit: integer("weekly_limit"),
    availableFrom: date("available_from", { mode: "string" }),
    availableUntil: date("available_until", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_parent_rewards_parent").on(table.parentProfileId, table.createdAt),
    check("parent_rewards_cost", sql`${table.cost} > 0`),
    check("parent_rewards_title_length", sql`char_length(btrim(${table.title})) BETWEEN 1 AND 60`),
    check("parent_rewards_description_length", sql`${table.description} IS NULL OR char_length(${table.description}) <= 200`),
    check("parent_rewards_limit", sql`${table.weeklyLimit} IS NULL OR ${table.weeklyLimit} > 0`),
    check("parent_rewards_dates", sql`${table.availableFrom} IS NULL OR ${table.availableUntil} IS NULL OR ${table.availableUntil} >= ${table.availableFrom}`),
  ],
);

export const rewardRedemptions = pgTable(
  "reward_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rewardId: uuid("reward_id")
      .notNull()
      .references(() => parentRewards.id, { onDelete: "restrict" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "restrict" }),
    /** The parent who owns the reward and is the only one who may decide the request. */
    ownerParentId: uuid("owner_parent_id")
      .notNull()
      .references(() => parentProfiles.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("requested"),
    /** What the reward cost, and what it was called, when it was asked for: later edits change neither. */
    pointsCostSnapshot: integer("points_cost_snapshot").notNull(),
    titleSnapshot: text("title_snapshot").notNull(),
    iconSnapshot: text("icon_snapshot").notNull().default("gift"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    debitLedgerEntryId: uuid("debit_ledger_entry_id").references(() => pointLedger.id, { onDelete: "restrict" }),
    refundLedgerEntryId: uuid("refund_ledger_entry_id").references(() => pointLedger.id, { onDelete: "restrict" }),
  },
  (table) => [
    // A child has one waiting request per reward: asking again while it waits does nothing.
    uniqueIndex("reward_redemptions_waiting_key")
      .on(table.childId, table.rewardId)
      .where(sql`${table.status} = 'requested'`),
    index("idx_reward_redemptions_child").on(table.childId, table.status),
    index("idx_reward_redemptions_owner").on(table.ownerParentId, table.status),
    check("reward_redemptions_status", sql`${table.status} IN ('requested', 'approved', 'rejected', 'fulfilled', 'cancelled')`),
    check("reward_redemptions_cost", sql`${table.pointsCostSnapshot} > 0`),
    check("reward_redemptions_debit_when_approved", sql`${table.status} NOT IN ('approved', 'fulfilled') OR ${table.debitLedgerEntryId} IS NOT NULL`),
  ],
);

export type RewardPolicyRow = typeof rewardPolicies.$inferSelect;
export type PointLedgerRow = typeof pointLedger.$inferSelect;
export type NewPointLedgerRow = typeof pointLedger.$inferInsert;
export type RewardDecisionRow = typeof rewardDecisions.$inferSelect;
export type ParentRewardRow = typeof parentRewards.$inferSelect;
export type RewardRedemptionRow = typeof rewardRedemptions.$inferSelect;
