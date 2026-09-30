CREATE TYPE "public"."attempt_mode" AS ENUM('ipad', 'print_upload');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('assigned', 'in_progress', 'submitted', 'marked');--> statement-breakpoint
CREATE TABLE "attempt_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"paper_question_id" uuid NOT NULL,
	"selected_option" text,
	"typed_answer" text,
	"typed_unit" text,
	"strokes" jsonb,
	"flagged" boolean DEFAULT false NOT NULL,
	"last_saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handwriting_bucket" text,
	"handwriting_key" text,
	CONSTRAINT "attempt_responses_question_key" UNIQUE("attempt_id","paper_question_id"),
	CONSTRAINT "attempt_responses_option" CHECK ("attempt_responses"."selected_option" IS NULL OR "attempt_responses"."selected_option" IN ('A', 'B', 'C', 'D')),
	CONSTRAINT "attempt_responses_typed_length" CHECK ("attempt_responses"."typed_answer" IS NULL OR char_length("attempt_responses"."typed_answer") <= 500),
	CONSTRAINT "attempt_responses_handwriting_key_not_url" CHECK ("attempt_responses"."handwriting_key" IS NULL OR "attempt_responses"."handwriting_key" !~* '^[a-z][a-z0-9+.-]*://')
);
--> statement-breakpoint
CREATE TABLE "attempt_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paper_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"mode" "attempt_mode" NOT NULL,
	"status" "attempt_status" DEFAULT 'assigned' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"time_limit_seconds" integer NOT NULL,
	"elapsed_seconds" integer DEFAULT 0 NOT NULL,
	"over_time_seconds" integer DEFAULT 0 NOT NULL,
	"current_position" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_sessions_limit_positive" CHECK ("attempt_sessions"."time_limit_seconds" > 0),
	CONSTRAINT "attempt_sessions_seconds" CHECK ("attempt_sessions"."elapsed_seconds" >= 0 AND "attempt_sessions"."over_time_seconds" >= 0),
	CONSTRAINT "attempt_sessions_position" CHECK ("attempt_sessions"."current_position" >= 1),
	CONSTRAINT "attempt_sessions_started_matches_status" CHECK (("attempt_sessions"."status" = 'assigned') = ("attempt_sessions"."started_at" IS NULL)),
	CONSTRAINT "attempt_sessions_submitted_matches_status" CHECK (("attempt_sessions"."status" IN ('submitted', 'marked')) = ("attempt_sessions"."submitted_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "marking_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_response_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"max_score" integer NOT NULL,
	"method" text NOT NULL,
	"confidence" text NOT NULL,
	"reason" text NOT NULL,
	"review_required" boolean NOT NULL,
	"final_score" integer,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marking_decisions_response_key" UNIQUE("attempt_response_id"),
	CONSTRAINT "marking_decisions_method" CHECK ("marking_decisions"."method" IN ('deterministic', 'needs_review')),
	CONSTRAINT "marking_decisions_confidence" CHECK ("marking_decisions"."confidence" IN ('high', 'low')),
	CONSTRAINT "marking_decisions_score_range" CHECK ("marking_decisions"."score" BETWEEN 0 AND "marking_decisions"."max_score"),
	CONSTRAINT "marking_decisions_final_range" CHECK ("marking_decisions"."final_score" IS NULL OR "marking_decisions"."final_score" BETWEEN 0 AND "marking_decisions"."max_score"),
	CONSTRAINT "marking_decisions_final_when_settled" CHECK ("marking_decisions"."review_required" OR "marking_decisions"."final_score" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "paper_questions" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "paper_questions" ADD CONSTRAINT "paper_questions_id_key" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "attempt_responses" ADD CONSTRAINT "attempt_responses_attempt_id_attempt_sessions_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_responses" ADD CONSTRAINT "attempt_responses_paper_question_id_paper_questions_id_fk" FOREIGN KEY ("paper_question_id") REFERENCES "public"."paper_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_sessions" ADD CONSTRAINT "attempt_sessions_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_sessions" ADD CONSTRAINT "attempt_sessions_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_sessions" ADD CONSTRAINT "attempt_sessions_created_by_parent_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marking_decisions" ADD CONSTRAINT "marking_decisions_attempt_response_id_attempt_responses_id_fk" FOREIGN KEY ("attempt_response_id") REFERENCES "public"."attempt_responses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attempt_responses_question" ON "attempt_responses" USING btree ("paper_question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_sessions_open_key" ON "attempt_sessions" USING btree ("paper_id","child_id") WHERE "attempt_sessions"."status" in ('assigned', 'in_progress');--> statement-breakpoint
CREATE INDEX "idx_attempt_sessions_child" ON "attempt_sessions" USING btree ("child_id","status");--> statement-breakpoint
CREATE INDEX "idx_attempt_sessions_paper" ON "attempt_sessions" USING btree ("paper_id");
