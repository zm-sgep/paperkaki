CREATE TABLE "mastery_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"outcome_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"question_type" "question_kind" NOT NULL,
	"difficulty" "question_difficulty" NOT NULL,
	"score_ratio" double precision NOT NULL,
	"first_attempt" boolean NOT NULL,
	"source_kind" text NOT NULL,
	"attempt_id" uuid,
	"attempt_response_id" uuid,
	"practice_session_id" uuid,
	"practice_response_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mastery_evidence_ratio" CHECK ("mastery_evidence"."score_ratio" BETWEEN 0 AND 1),
	CONSTRAINT "mastery_evidence_source_kind" CHECK ("mastery_evidence"."source_kind" IN ('mock', 'practice')),
	CONSTRAINT "mastery_evidence_one_source" CHECK (("mastery_evidence"."source_kind" = 'mock' AND "mastery_evidence"."attempt_id" IS NOT NULL AND "mastery_evidence"."attempt_response_id" IS NOT NULL AND "mastery_evidence"."practice_session_id" IS NULL AND "mastery_evidence"."practice_response_id" IS NULL)
        OR ("mastery_evidence"."source_kind" = 'practice' AND "mastery_evidence"."practice_session_id" IS NOT NULL AND "mastery_evidence"."practice_response_id" IS NOT NULL AND "mastery_evidence"."attempt_id" IS NULL AND "mastery_evidence"."attempt_response_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "mastery_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"outcome_id" uuid NOT NULL,
	"state" text NOT NULL,
	"evidence_count" integer NOT NULL,
	"sessions" integer NOT NULL,
	"last_practiced_at" timestamp with time zone,
	"mastered_at" timestamp with time zone,
	"review_due_at" timestamp with time zone,
	"recent_accuracy" double precision,
	"policy_version" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mastery_profiles_state" CHECK ("mastery_profiles"."state" IN ('not_started', 'learning', 'developing', 'almost_mastered', 'mastered', 'retained')),
	CONSTRAINT "mastery_profiles_counts" CHECK ("mastery_profiles"."evidence_count" >= 0 AND "mastery_profiles"."sessions" >= 0)
);
--> statement-breakpoint
ALTER TABLE "mastery_evidence" ADD CONSTRAINT "mastery_evidence_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_evidence" ADD CONSTRAINT "mastery_evidence_outcome_id_curriculum_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."curriculum_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_evidence" ADD CONSTRAINT "mastery_evidence_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_evidence" ADD CONSTRAINT "mastery_evidence_family_id_question_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."question_families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_evidence" ADD CONSTRAINT "mastery_evidence_attempt_id_attempt_sessions_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_evidence" ADD CONSTRAINT "mastery_evidence_attempt_response_id_attempt_responses_id_fk" FOREIGN KEY ("attempt_response_id") REFERENCES "public"."attempt_responses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_profiles" ADD CONSTRAINT "mastery_profiles_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_profiles" ADD CONSTRAINT "mastery_profiles_outcome_id_curriculum_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."curriculum_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mastery_evidence_attempt_response_key" ON "mastery_evidence" USING btree ("attempt_response_id") WHERE "mastery_evidence"."attempt_response_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mastery_evidence_practice_response_key" ON "mastery_evidence" USING btree ("practice_response_id") WHERE "mastery_evidence"."practice_response_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_mastery_evidence_child_outcome" ON "mastery_evidence" USING btree ("child_id","outcome_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_mastery_evidence_child_question" ON "mastery_evidence" USING btree ("child_id","question_id");--> statement-breakpoint
CREATE INDEX "idx_mastery_evidence_attempt" ON "mastery_evidence" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mastery_profiles_child_outcome_key" ON "mastery_profiles" USING btree ("child_id","outcome_id");