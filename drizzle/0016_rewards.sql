CREATE TABLE "parent_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_profile_id" uuid NOT NULL,
	"child_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"cost" integer NOT NULL,
	"icon" text DEFAULT 'gift' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"weekly_limit" integer,
	"available_from" date,
	"available_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parent_rewards_cost" CHECK ("parent_rewards"."cost" > 0),
	CONSTRAINT "parent_rewards_title_length" CHECK (char_length(btrim("parent_rewards"."title")) BETWEEN 1 AND 60),
	CONSTRAINT "parent_rewards_description_length" CHECK ("parent_rewards"."description" IS NULL OR char_length("parent_rewards"."description") <= 200),
	CONSTRAINT "parent_rewards_limit" CHECK ("parent_rewards"."weekly_limit" IS NULL OR "parent_rewards"."weekly_limit" > 0),
	CONSTRAINT "parent_rewards_dates" CHECK ("parent_rewards"."available_from" IS NULL OR "parent_rewards"."available_until" IS NULL OR "parent_rewards"."available_until" >= "parent_rewards"."available_from")
);
--> statement-breakpoint
CREATE TABLE "point_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"origin" text NOT NULL,
	"reason_code" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"source_event_id" text NOT NULL,
	"policy_version" text,
	"mastery_before" text,
	"mastery_after" text,
	"calculation" jsonb,
	"note" text,
	"compensates_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_ledger_amount" CHECK ("point_ledger"."amount" <> 0),
	CONSTRAINT "point_ledger_origin" CHECK ("point_ledger"."origin" IN ('learning', 'parent_bonus', 'redemption', 'correction')),
	CONSTRAINT "point_ledger_source_event" CHECK (char_length("point_ledger"."source_event_id") > 0),
	CONSTRAINT "point_ledger_learning_policy" CHECK ("point_ledger"."origin" <> 'learning' OR ("point_ledger"."policy_version" IS NOT NULL AND "point_ledger"."amount" > 0)),
	CONSTRAINT "point_ledger_bonus_note" CHECK ("point_ledger"."origin" <> 'parent_bonus' OR ("point_ledger"."amount" > 0 AND "point_ledger"."note" IS NOT NULL AND char_length(btrim("point_ledger"."note")) > 0))
);
--> statement-breakpoint
CREATE TABLE "reward_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"source_event_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"activity_type" text NOT NULL,
	"points" integer NOT NULL,
	"reason_codes" jsonb NOT NULL,
	"breakdown" jsonb NOT NULL,
	"redirect" jsonb,
	"details" jsonb NOT NULL,
	"policy_version" text NOT NULL,
	"ledger_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_decisions_points" CHECK ("reward_decisions"."points" >= 0),
	CONSTRAINT "reward_decisions_paid" CHECK (("reward_decisions"."points" > 0) = ("reward_decisions"."ledger_entry_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "reward_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"policy" jsonb NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"change_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_policies_status" CHECK ("reward_policies"."status" IN ('draft', 'active', 'retired')),
	CONSTRAINT "reward_policies_window" CHECK ("reward_policies"."effective_to" IS NULL OR "reward_policies"."effective_from" IS NULL OR "reward_policies"."effective_to" > "reward_policies"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "reward_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reward_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"owner_parent_id" uuid NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"points_cost_snapshot" integer NOT NULL,
	"title_snapshot" text NOT NULL,
	"icon_snapshot" text DEFAULT 'gift' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"decision_note" text,
	"debit_ledger_entry_id" uuid,
	"refund_ledger_entry_id" uuid,
	CONSTRAINT "reward_redemptions_status" CHECK ("reward_redemptions"."status" IN ('requested', 'approved', 'rejected', 'fulfilled', 'cancelled')),
	CONSTRAINT "reward_redemptions_cost" CHECK ("reward_redemptions"."points_cost_snapshot" > 0),
	CONSTRAINT "reward_redemptions_debit_when_approved" CHECK ("reward_redemptions"."status" NOT IN ('approved', 'fulfilled') OR "reward_redemptions"."debit_ledger_entry_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "parent_rewards" ADD CONSTRAINT "parent_rewards_parent_profile_id_parent_profiles_id_fk" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_rewards" ADD CONSTRAINT "parent_rewards_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_decisions" ADD CONSTRAINT "reward_decisions_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_decisions" ADD CONSTRAINT "reward_decisions_ledger_entry_id_point_ledger_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."point_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_reward_id_parent_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."parent_rewards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_owner_parent_id_parent_profiles_id_fk" FOREIGN KEY ("owner_parent_id") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_debit_ledger_entry_id_point_ledger_id_fk" FOREIGN KEY ("debit_ledger_entry_id") REFERENCES "public"."point_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_refund_ledger_entry_id_point_ledger_id_fk" FOREIGN KEY ("refund_ledger_entry_id") REFERENCES "public"."point_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_parent_rewards_parent" ON "parent_rewards" USING btree ("parent_profile_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "point_ledger_child_source_event_key" ON "point_ledger" USING btree ("child_id","source_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "point_ledger_compensates_key" ON "point_ledger" USING btree ("compensates_entry_id") WHERE "point_ledger"."compensates_entry_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_point_ledger_child_time" ON "point_ledger" USING btree ("child_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_decisions_child_source_event_key" ON "reward_decisions" USING btree ("child_id","source_event_id");--> statement-breakpoint
CREATE INDEX "idx_reward_decisions_child_time" ON "reward_decisions" USING btree ("child_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_policies_version_key" ON "reward_policies" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_redemptions_waiting_key" ON "reward_redemptions" USING btree ("child_id","reward_id") WHERE "reward_redemptions"."status" = 'requested';--> statement-breakpoint
CREATE INDEX "idx_reward_redemptions_child" ON "reward_redemptions" USING btree ("child_id","status");--> statement-breakpoint
CREATE INDEX "idx_reward_redemptions_owner" ON "reward_redemptions" USING btree ("owner_parent_id","status");--> statement-breakpoint

-- Written by hand: drizzle-kit does not model triggers or seed rows. Statements are split by the breakpoint marker.

-- The point ledger is append-only (ADR-0006): no UPDATE, no DELETE. A correction is a new compensating row.
CREATE FUNCTION point_ledger_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the point ledger is append-only; % is not allowed (add a compensating entry instead)', TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;--> statement-breakpoint

CREATE TRIGGER point_ledger_append_only
  BEFORE UPDATE OR DELETE ON point_ledger
  FOR EACH ROW EXECUTE FUNCTION point_ledger_append_only();--> statement-breakpoint

-- A published reward policy is a historical record: its version and numbers never change. Only its
-- status and dates may move (draft -> active -> retired). It is never deleted.
CREATE FUNCTION reward_policies_guard_row() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'reward policy % cannot be deleted; policies are historical records', OLD.version
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version OR NEW.policy IS DISTINCT FROM OLD.policy THEN
    RAISE EXCEPTION 'reward policy % is frozen; add a new version instead', OLD.version
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER reward_policies_guard_row
  BEFORE UPDATE OR DELETE ON reward_policies
  FOR EACH ROW EXECUTE FUNCTION reward_policies_guard_row();--> statement-breakpoint

-- Seed: rewards-v1, the same numbers as REWARD_POLICY_V1 (a test keeps the two equal).
INSERT INTO reward_policies (version, status, policy, effective_from, change_notes)
VALUES ('rewards-v1', 'active', '{"version":"rewards-v1","basePoints":{"short_practice":5,"targeted_practice":10,"mock":18,"mistake_review":6,"retention_check":6},"activityCap":{"short_practice":12,"targeted_practice":30,"mock":45,"mistake_review":12,"retention_check":15},"masteryNeedMultiplier":{"not_started":1.2,"learning":1.6,"developing":1.4,"almost_mastered":1.2,"mastered":0.3,"retained":0.2},"difficultyMultiplier":{"basic":1,"standard":1.15,"challenging":1.3},"firstMeaningfulAttempt":1,"repeatAttempt":0.15,"accuracy":{"minFactor":0.6,"fullCreditAt":0.7},"improvement":{"minGain":0.05,"scale":1,"bonusMax":0.5},"weakAreaRecovery":{"weakStates":["learning","developing"],"minGain":0.2,"minAccuracy":0.6,"bonus":0.25},"varietyBonus":0.15,"retention":{"bonus":0.35,"minAccuracy":0.7,"needMultiplier":1},"stretch":{"minDifficulty":"challenging","needMultiplier":0.8,"minAccuracy":0.5},"mistakeReviewNeedMultiplier":1,"masteryBonus":12,"sameFamilyDecay":[1,0.6,0.25,0.1],"masteredTopicSessionDecay":[1,0.35,0.1,0],"masteredDifficultyFloor":{"minDifficulty":"standard","belowFloorMultiplier":0.5},"cooldown":{"windowMinutes":30,"multiplier":0.25},"lowEffortMultiplier":0,"lowYieldNudgeAtMostPoints":3}'::jsonb, TIMESTAMPTZ '2026-01-01 00:00:00+00', 'First policy: reward growth, review and retention; repeated easy work earns sharply less.');
