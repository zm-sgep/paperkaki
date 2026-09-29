CREATE TYPE "public"."question_cognitive_demand" AS ENUM('recall', 'application', 'reasoning');--> statement-breakpoint
CREATE TYPE "public"."question_difficulty" AS ENUM('basic', 'standard', 'challenging');--> statement-breakpoint
CREATE TYPE "public"."question_kind" AS ENUM('mcq', 'number', 'fraction', 'text');--> statement-breakpoint
CREATE TYPE "public"."question_provenance" AS ENUM('original_human', 'original_ai', 'licensed', 'public_domain', 'organisation_owned');--> statement-breakpoint
CREATE TYPE "public"."question_review_decision" AS ENUM('approved', 'changes_requested', 'retired');--> statement-breakpoint
CREATE TYPE "public"."question_role" AS ENUM('primary', 'secondary', 'prerequisite');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('draft', 'in_review', 'approved', 'retired');--> statement-breakpoint
CREATE TABLE "question_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"bucket" text DEFAULT 'question-assets' NOT NULL,
	"object_key" text NOT NULL,
	"alt" text NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_assets_object_key" UNIQUE("question_id","bucket","object_key"),
	CONSTRAINT "question_assets_not_url" CHECK ("question_assets"."object_key" !~* '^[a-z][a-z0-9+.-]*://')
);
--> statement-breakpoint
CREATE TABLE "question_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_families_version_code_key" UNIQUE("curriculum_version_id","code")
);
--> statement-breakpoint
CREATE TABLE "question_outcomes" (
	"question_id" uuid NOT NULL,
	"outcome_id" uuid NOT NULL,
	"role" "question_role" NOT NULL,
	CONSTRAINT "question_outcomes_pkey_key" UNIQUE("question_id","outcome_id")
);
--> statement-breakpoint
CREATE TABLE "question_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"decision" "question_review_decision" NOT NULL,
	"checklist" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "question_status" DEFAULT 'draft' NOT NULL,
	"level" text NOT NULL,
	"subject" text NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"question_type" "question_kind" NOT NULL,
	"difficulty" "question_difficulty" NOT NULL,
	"cognitive_demand" "question_cognitive_demand" NOT NULL,
	"marks" integer NOT NULL,
	"estimated_seconds" integer NOT NULL,
	"content" jsonb NOT NULL,
	"answer" jsonb NOT NULL,
	"verification" jsonb NOT NULL,
	"worked_solution" jsonb NOT NULL,
	"marking_scheme" jsonb NOT NULL,
	"provenance" "question_provenance" NOT NULL,
	"supersedes_question_id" uuid,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_family_version_key" UNIQUE("family_id","version"),
	CONSTRAINT "questions_version_positive" CHECK ("questions"."version" >= 1),
	CONSTRAINT "questions_marks_positive" CHECK ("questions"."marks" > 0),
	CONSTRAINT "questions_estimated_seconds_positive" CHECK ("questions"."estimated_seconds" > 0),
	CONSTRAINT "questions_approved_has_time" CHECK ("questions"."status" <> 'approved' OR "questions"."approved_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "question_assets" ADD CONSTRAINT "question_assets_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_families" ADD CONSTRAINT "question_families_curriculum_version_id_curriculum_versions_id_fk" FOREIGN KEY ("curriculum_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_outcomes" ADD CONSTRAINT "question_outcomes_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_outcomes" ADD CONSTRAINT "question_outcomes_outcome_id_curriculum_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."curriculum_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reviews" ADD CONSTRAINT "question_reviews_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reviews" ADD CONSTRAINT "question_reviews_reviewer_id_parent_profiles_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_family_id_question_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."question_families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_curriculum_version_id_curriculum_versions_id_fk" FOREIGN KEY ("curriculum_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_supersedes_question_id_questions_id_fk" FOREIGN KEY ("supersedes_question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_parent_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_approved_by_parent_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_question_outcomes_one_primary" ON "question_outcomes" USING btree ("question_id") WHERE "question_outcomes"."role" = 'primary';--> statement-breakpoint
CREATE INDEX "idx_question_outcomes_outcome" ON "question_outcomes" USING btree ("outcome_id","question_id");--> statement-breakpoint
CREATE INDEX "idx_question_reviews_question" ON "question_reviews" USING btree ("question_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_questions_generation" ON "questions" USING btree ("status","subject","level","curriculum_version_id");--> statement-breakpoint
CREATE INDEX "idx_questions_approved" ON "questions" USING btree ("curriculum_version_id","subject","level") WHERE "questions"."status" = 'approved';--> statement-breakpoint
CREATE INDEX "idx_questions_kind_difficulty" ON "questions" USING btree ("curriculum_version_id","question_type","difficulty");--> statement-breakpoint
CREATE INDEX "idx_questions_family" ON "questions" USING btree ("family_id");