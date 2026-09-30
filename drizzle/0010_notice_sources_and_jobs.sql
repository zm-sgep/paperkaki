CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."assessment_source_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "assessment_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_profile_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"assessment_id" uuid,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"extra_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mime" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_size" integer NOT NULL,
	"page_count" integer NOT NULL,
	"status" "assessment_source_status" DEFAULT 'queued' NOT NULL,
	"failure_code" text,
	"extraction" jsonb,
	"prompt_version" text,
	"file_deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_sources_sha256" CHECK ("assessment_sources"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "assessment_sources_pages" CHECK ("assessment_sources"."page_count" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_attempts_range" CHECK ("jobs"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "assessment_sources" ADD CONSTRAINT "assessment_sources_parent_profile_id_parent_profiles_id_fk" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sources" ADD CONSTRAINT "assessment_sources_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sources" ADD CONSTRAINT "assessment_sources_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assessment_sources_parent" ON "assessment_sources" USING btree ("parent_profile_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_status_created" ON "jobs" USING btree ("status","created_at");