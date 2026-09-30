CREATE TABLE "practice_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"question_id" uuid NOT NULL,
	"outcome_id" uuid NOT NULL,
	"added_as" text DEFAULT 'planned' NOT NULL,
	"selected_option" text,
	"typed_answer" text,
	"typed_unit" text,
	"score" integer,
	"max_score" integer NOT NULL,
	"result" text,
	"hint_shown" boolean DEFAULT false NOT NULL,
	"solution_shown" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp with time zone,
	CONSTRAINT "practice_responses_added_as" CHECK ("practice_responses"."added_as" IN ('planned', 'similar')),
	CONSTRAINT "practice_responses_option" CHECK ("practice_responses"."selected_option" IS NULL OR "practice_responses"."selected_option" IN ('A', 'B', 'C', 'D')),
	CONSTRAINT "practice_responses_typed_length" CHECK ("practice_responses"."typed_answer" IS NULL OR char_length("practice_responses"."typed_answer") <= 500),
	CONSTRAINT "practice_responses_result" CHECK ("practice_responses"."result" IS NULL OR "practice_responses"."result" IN ('right', 'wrong', 'unclear')),
	CONSTRAINT "practice_responses_score_range" CHECK ("practice_responses"."score" IS NULL OR "practice_responses"."score" BETWEEN 0 AND "practice_responses"."max_score"),
	CONSTRAINT "practice_responses_answered_matches_result" CHECK (("practice_responses"."answered_at" IS NULL) = ("practice_responses"."result" IS NULL)),
	CONSTRAINT "practice_responses_position" CHECK ("practice_responses"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "practice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"focus_kind" text NOT NULL,
	"topic_id" uuid NOT NULL,
	"outcome_id" uuid,
	"focus_label" text NOT NULL,
	"origin" text NOT NULL,
	"seed" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_sessions_focus_kind" CHECK ("practice_sessions"."focus_kind" IN ('topic', 'outcome')),
	CONSTRAINT "practice_sessions_focus_outcome" CHECK (("practice_sessions"."focus_kind" = 'outcome') = ("practice_sessions"."outcome_id" IS NOT NULL)),
	CONSTRAINT "practice_sessions_origin" CHECK ("practice_sessions"."origin" IN ('recommended', 'suggested', 'chosen', 'similar')),
	CONSTRAINT "practice_sessions_status" CHECK ("practice_sessions"."status" IN ('in_progress', 'completed')),
	CONSTRAINT "practice_sessions_completed_matches_status" CHECK (("practice_sessions"."status" = 'completed') = ("practice_sessions"."completed_at" IS NOT NULL)),
	CONSTRAINT "practice_sessions_seconds" CHECK ("practice_sessions"."active_seconds" >= 0),
	CONSTRAINT "practice_sessions_minutes" CHECK ("practice_sessions"."minutes" IS NULL OR "practice_sessions"."minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "practice_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"suggested_by" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_suggestions_status" CHECK ("practice_suggestions"."status" IN ('pending', 'started', 'replaced'))
);
--> statement-breakpoint
ALTER TABLE "practice_responses" ADD CONSTRAINT "practice_responses_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_responses" ADD CONSTRAINT "practice_responses_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_responses" ADD CONSTRAINT "practice_responses_outcome_id_curriculum_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."curriculum_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_outcome_id_curriculum_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."curriculum_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_suggestions" ADD CONSTRAINT "practice_suggestions_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_suggestions" ADD CONSTRAINT "practice_suggestions_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_suggestions" ADD CONSTRAINT "practice_suggestions_suggested_by_parent_profiles_id_fk" FOREIGN KEY ("suggested_by") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_suggestions" ADD CONSTRAINT "practice_suggestions_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "practice_responses_position_key" ON "practice_responses" USING btree ("session_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_responses_question_key" ON "practice_responses" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE INDEX "idx_practice_responses_question" ON "practice_responses" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_sessions_open_key" ON "practice_sessions" USING btree ("child_id") WHERE "practice_sessions"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "idx_practice_sessions_child" ON "practice_sessions" USING btree ("child_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_suggestions_pending_key" ON "practice_suggestions" USING btree ("child_id") WHERE "practice_suggestions"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_practice_suggestions_child" ON "practice_suggestions" USING btree ("child_id","created_at");--> statement-breakpoint
ALTER TABLE "mastery_evidence" ADD CONSTRAINT "mastery_evidence_practice_session_id_practice_sessions_id_fk" FOREIGN KEY ("practice_session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_evidence" ADD CONSTRAINT "mastery_evidence_practice_response_id_practice_responses_id_fk" FOREIGN KEY ("practice_response_id") REFERENCES "public"."practice_responses"("id") ON DELETE restrict ON UPDATE no action;