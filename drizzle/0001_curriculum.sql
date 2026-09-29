CREATE TYPE "public"."curriculum_version_status" AS ENUM('draft', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "public"."outcome_relationship_kind" AS ENUM('prerequisite', 'progression');--> statement-breakpoint
CREATE TYPE "public"."source_provenance" AS ENUM('official_moe', 'official_seab', 'official_school', 'parent_provided', 'historical_observation', 'system_inference');--> statement-breakpoint
CREATE TYPE "public"."verification_state" AS ENUM('unverified', 'verified');--> statement-breakpoint
CREATE TABLE "curriculum_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "curriculum_domains_version_code_key" UNIQUE("curriculum_version_id","code")
);
--> statement-breakpoint
CREATE TABLE "curriculum_outcome_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outcome_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"page_or_section" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_outcome_sources_link_key" UNIQUE NULLS NOT DISTINCT("outcome_id","source_id","page_or_section")
);
--> statement-breakpoint
CREATE TABLE "curriculum_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"code" text NOT NULL,
	"statement" text NOT NULL,
	"child_label" text NOT NULL,
	"level" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"verification" "verification_state" DEFAULT 'unverified' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	CONSTRAINT "curriculum_outcomes_version_code_key" UNIQUE("curriculum_version_id","code"),
	CONSTRAINT "curriculum_outcomes_verified_by_person" CHECK ("curriculum_outcomes"."verification" = 'unverified' OR ("curriculum_outcomes"."verified_by" IS NOT NULL AND "curriculum_outcomes"."verified_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "curriculum_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"parent_label" text NOT NULL,
	"level" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"scope_notes" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "curriculum_topics_version_code_key" UNIQUE("curriculum_version_id","code")
);
--> statement-breakpoint
CREATE TABLE "curriculum_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"levels" text[] NOT NULL,
	"status" "curriculum_version_status" DEFAULT 'draft' NOT NULL,
	"effective_from" date,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_versions_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "outcome_relationships" (
	"from_outcome_id" uuid NOT NULL,
	"to_outcome_id" uuid NOT NULL,
	"kind" "outcome_relationship_kind" NOT NULL,
	CONSTRAINT "outcome_relationships_pkey" PRIMARY KEY("from_outcome_id","to_outcome_id","kind"),
	CONSTRAINT "outcome_relationships_not_self" CHECK ("outcome_relationships"."from_outcome_id" <> "outcome_relationships"."to_outcome_id")
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"publisher" text NOT NULL,
	"url" text,
	"provenance" "source_provenance" NOT NULL,
	"verification" "verification_state" DEFAULT 'unverified' NOT NULL,
	"accessed_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_documents_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "subjects_code_key" UNIQUE("code"),
	CONSTRAINT "subjects_name_key" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "curriculum_domains" ADD CONSTRAINT "curriculum_domains_curriculum_version_id_curriculum_versions_id_fk" FOREIGN KEY ("curriculum_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_outcome_sources" ADD CONSTRAINT "curriculum_outcome_sources_outcome_id_curriculum_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."curriculum_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_outcome_sources" ADD CONSTRAINT "curriculum_outcome_sources_source_id_source_documents_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_outcomes" ADD CONSTRAINT "curriculum_outcomes_curriculum_version_id_curriculum_versions_id_fk" FOREIGN KEY ("curriculum_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_outcomes" ADD CONSTRAINT "curriculum_outcomes_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_outcomes" ADD CONSTRAINT "curriculum_outcomes_verified_by_parent_profiles_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_curriculum_version_id_curriculum_versions_id_fk" FOREIGN KEY ("curriculum_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_domain_id_curriculum_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."curriculum_domains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_published_by_parent_profiles_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_relationships" ADD CONSTRAINT "outcome_relationships_from_outcome_id_curriculum_outcomes_id_fk" FOREIGN KEY ("from_outcome_id") REFERENCES "public"."curriculum_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_relationships" ADD CONSTRAINT "outcome_relationships_to_outcome_id_curriculum_outcomes_id_fk" FOREIGN KEY ("to_outcome_id") REFERENCES "public"."curriculum_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_curriculum_outcome_sources_source" ON "curriculum_outcome_sources" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "idx_curriculum_outcomes_version_level" ON "curriculum_outcomes" USING btree ("curriculum_version_id","level");--> statement-breakpoint
CREATE INDEX "idx_curriculum_outcomes_topic_sort" ON "curriculum_outcomes" USING btree ("topic_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_curriculum_outcomes_code" ON "curriculum_outcomes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_curriculum_topics_version_level" ON "curriculum_topics" USING btree ("curriculum_version_id","level");--> statement-breakpoint
CREATE INDEX "idx_curriculum_topics_domain_sort" ON "curriculum_topics" USING btree ("domain_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_curriculum_versions_subject_status" ON "curriculum_versions" USING btree ("subject_id","status");--> statement-breakpoint
CREATE INDEX "idx_outcome_relationships_to" ON "outcome_relationships" USING btree ("to_outcome_id");