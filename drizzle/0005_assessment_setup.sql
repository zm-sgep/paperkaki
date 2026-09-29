CREATE TYPE "public"."child_level" AS ENUM('P1', 'P2', 'P3', 'P4', 'P5', 'P6');--> statement-breakpoint
CREATE TYPE "public"."assessment_status" AS ENUM('draft', 'scope_confirmed');--> statement-breakpoint
CREATE TYPE "public"."assessment_type" AS ENUM('wa1', 'wa2', 'wa3', 'end_of_year', 'class_test', 'other');--> statement-breakpoint
CREATE TYPE "public"."assessment_difficulty" AS ENUM('easier', 'balanced', 'harder');--> statement-breakpoint
CREATE TYPE "public"."assessment_requirements_source" AS ENUM('recommended', 'parent');--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_profile_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"level" "child_level" NOT NULL,
	"school_name" text,
	"academic_year" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "children_nickname_length" CHECK (char_length("children"."nickname") BETWEEN 1 AND 30),
	CONSTRAINT "children_academic_year_range" CHECK ("children"."academic_year" BETWEEN 2020 AND 2100)
);
--> statement-breakpoint
CREATE TABLE "assessment_blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"spec" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_blueprints_version_key" UNIQUE("assessment_id","version"),
	CONSTRAINT "assessment_blueprints_version_positive" CHECK ("assessment_blueprints"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "assessment_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"total_marks" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"difficulty" "assessment_difficulty" NOT NULL,
	"source" "assessment_requirements_source" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_requirements_assessment_key" UNIQUE("assessment_id"),
	CONSTRAINT "assessment_requirements_marks_range" CHECK ("assessment_requirements"."total_marks" BETWEEN 10 AND 60),
	CONSTRAINT "assessment_requirements_minutes_range" CHECK ("assessment_requirements"."duration_minutes" BETWEEN 15 AND 120)
);
--> statement-breakpoint
CREATE TABLE "assessment_scope_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"outcome_id" uuid NOT NULL,
	CONSTRAINT "assessment_scope_items_outcome_key" UNIQUE("assessment_id","outcome_id")
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"level" text NOT NULL,
	"assessment_type" "assessment_type" NOT NULL,
	"name" text NOT NULL,
	"date" date NOT NULL,
	"status" "assessment_status" DEFAULT 'draft' NOT NULL,
	"scope_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessments_name_length" CHECK (char_length("assessments"."name") BETWEEN 1 AND 40),
	CONSTRAINT "assessments_confirmed_has_time" CHECK (("assessments"."status" = 'scope_confirmed') = ("assessments"."scope_confirmed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "blueprint_scope_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blueprint_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"target_marks" integer NOT NULL,
	"section_a_marks" integer NOT NULL,
	"section_b_marks" integer NOT NULL,
	CONSTRAINT "blueprint_scope_items_topic_key" UNIQUE("blueprint_id","topic_id"),
	CONSTRAINT "blueprint_scope_items_marks_add_up" CHECK ("blueprint_scope_items"."section_a_marks" + "blueprint_scope_items"."section_b_marks" = "blueprint_scope_items"."target_marks")
);
--> statement-breakpoint
ALTER TABLE "parent_profiles" ADD COLUMN "last_selected_child_id" uuid;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_parent_profile_id_parent_profiles_id_fk" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_blueprints" ADD CONSTRAINT "assessment_blueprints_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_requirements" ADD CONSTRAINT "assessment_requirements_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scope_items" ADD CONSTRAINT "assessment_scope_items_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scope_items" ADD CONSTRAINT "assessment_scope_items_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scope_items" ADD CONSTRAINT "assessment_scope_items_outcome_id_curriculum_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."curriculum_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_curriculum_version_id_curriculum_versions_id_fk" FOREIGN KEY ("curriculum_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_scope_items" ADD CONSTRAINT "blueprint_scope_items_blueprint_id_assessment_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."assessment_blueprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_scope_items" ADD CONSTRAINT "blueprint_scope_items_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_children_parent" ON "children" USING btree ("parent_profile_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_assessment_scope_items_topic" ON "assessment_scope_items" USING btree ("assessment_id","topic_id");--> statement-breakpoint
CREATE INDEX "idx_assessments_child_date" ON "assessments" USING btree ("child_id","date");--> statement-breakpoint
ALTER TABLE "parent_profiles" ADD CONSTRAINT "parent_profiles_last_selected_child_id_children_id_fk" FOREIGN KEY ("last_selected_child_id") REFERENCES "public"."children"("id") ON DELETE set null ON UPDATE no action;