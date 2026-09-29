CREATE TABLE "school_paper_formats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"assessment_type" "assessment_type" NOT NULL,
	"format" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_paper_formats_child_type_key" UNIQUE("child_id","assessment_type")
);
--> statement-breakpoint
ALTER TABLE "blueprint_scope_items" DROP CONSTRAINT "blueprint_scope_items_marks_add_up";--> statement-breakpoint
ALTER TABLE "paper_questions" DROP CONSTRAINT "paper_questions_section";--> statement-breakpoint
ALTER TABLE "assessment_requirements" ADD COLUMN "paper_format" jsonb;--> statement-breakpoint
ALTER TABLE "school_paper_formats" ADD CONSTRAINT "school_paper_formats_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_scope_items" DROP COLUMN "section_a_marks";--> statement-breakpoint
ALTER TABLE "blueprint_scope_items" DROP COLUMN "section_b_marks";--> statement-breakpoint
ALTER TABLE "paper_questions" ADD CONSTRAINT "paper_questions_section" CHECK ("paper_questions"."section_code" ~ '^[A-H]$');