CREATE TYPE "public"."paper_status" AS ENUM('generated', 'retired');--> statement-breakpoint
CREATE TABLE "paper_questions" (
	"paper_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"section_code" text NOT NULL,
	"question_id" uuid NOT NULL,
	"marks" integer NOT NULL,
	CONSTRAINT "paper_questions_pkey" PRIMARY KEY("paper_id","position"),
	CONSTRAINT "paper_questions_question_key" UNIQUE("paper_id","question_id"),
	CONSTRAINT "paper_questions_position_positive" CHECK ("paper_questions"."position" >= 1),
	CONSTRAINT "paper_questions_marks_positive" CHECK ("paper_questions"."marks" > 0),
	CONSTRAINT "paper_questions_section" CHECK ("paper_questions"."section_code" IN ('A', 'B'))
);
--> statement-breakpoint
CREATE TABLE "papers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"blueprint_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" "paper_status" DEFAULT 'generated' NOT NULL,
	"seed" text NOT NULL,
	"request_key" text NOT NULL,
	"selection_report" jsonb NOT NULL,
	"student_pdf_bucket" text NOT NULL,
	"student_pdf_key" text NOT NULL,
	"answer_pdf_bucket" text NOT NULL,
	"answer_pdf_key" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "papers_assessment_number_key" UNIQUE("assessment_id","number"),
	CONSTRAINT "papers_request_key_key" UNIQUE("request_key"),
	CONSTRAINT "papers_number_positive" CHECK ("papers"."number" >= 1),
	CONSTRAINT "papers_keys_not_urls" CHECK ("papers"."student_pdf_key" !~* '^[a-z][a-z0-9+.-]*://' AND "papers"."answer_pdf_key" !~* '^[a-z][a-z0-9+.-]*://')
);
--> statement-breakpoint
ALTER TABLE "paper_questions" ADD CONSTRAINT "paper_questions_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_questions" ADD CONSTRAINT "paper_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papers" ADD CONSTRAINT "papers_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papers" ADD CONSTRAINT "papers_blueprint_id_assessment_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."assessment_blueprints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papers" ADD CONSTRAINT "papers_created_by_parent_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_paper_questions_question" ON "paper_questions" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_papers_assessment" ON "papers" USING btree ("assessment_id","number");