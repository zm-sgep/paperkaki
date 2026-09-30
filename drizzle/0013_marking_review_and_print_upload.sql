CREATE TABLE "marking_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_response_id" uuid NOT NULL,
	"marking_decision_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"max_score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marking_reviews_score_range" CHECK ("marking_reviews"."score" BETWEEN 0 AND "marking_reviews"."max_score")
);
--> statement-breakpoint
CREATE TABLE "print_upload_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paper_id" uuid NOT NULL,
	"parent_profile_id" uuid NOT NULL,
	"attempt_id" uuid,
	"position" integer NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"mime" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"problem" text,
	"detected_page" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_upload_pages_key" UNIQUE("bucket","object_key"),
	CONSTRAINT "print_upload_pages_problem" CHECK ("print_upload_pages"."problem" IS NULL OR "print_upload_pages"."problem" IN ('blurry', 'rotated', 'small')),
	CONSTRAINT "print_upload_pages_position" CHECK ("print_upload_pages"."position" >= 1),
	CONSTRAINT "print_upload_pages_key_not_url" CHECK ("print_upload_pages"."object_key" !~* '^[a-z][a-z0-9+.-]*://')
);
--> statement-breakpoint
ALTER TABLE "marking_decisions" DROP CONSTRAINT "marking_decisions_response_key";--> statement-breakpoint
ALTER TABLE "marking_decisions" DROP CONSTRAINT "marking_decisions_method";--> statement-breakpoint
ALTER TABLE "attempt_sessions" ADD COLUMN "marking_stage" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "attempt_sessions" ADD COLUMN "marked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attempt_sessions" ADD COLUMN "parent_result_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attempt_sessions" ADD COLUMN "child_result_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attempt_sessions" ADD COLUMN "mistakes_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marking_decisions" ADD COLUMN "seq" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "marking_decisions_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "marking_decisions" ADD COLUMN "prompt_version" text;--> statement-breakpoint
ALTER TABLE "marking_decisions" ADD COLUMN "error_type" text;--> statement-breakpoint
ALTER TABLE "marking_reviews" ADD CONSTRAINT "marking_reviews_attempt_response_id_attempt_responses_id_fk" FOREIGN KEY ("attempt_response_id") REFERENCES "public"."attempt_responses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marking_reviews" ADD CONSTRAINT "marking_reviews_marking_decision_id_marking_decisions_id_fk" FOREIGN KEY ("marking_decision_id") REFERENCES "public"."marking_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marking_reviews" ADD CONSTRAINT "marking_reviews_reviewer_id_parent_profiles_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_upload_pages" ADD CONSTRAINT "print_upload_pages_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_upload_pages" ADD CONSTRAINT "print_upload_pages_parent_profile_id_parent_profiles_id_fk" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_upload_pages" ADD CONSTRAINT "print_upload_pages_attempt_id_attempt_sessions_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_marking_reviews_response" ON "marking_reviews" USING btree ("attempt_response_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_print_upload_pages_draft" ON "print_upload_pages" USING btree ("paper_id","parent_profile_id","position");--> statement-breakpoint
CREATE INDEX "idx_print_upload_pages_attempt" ON "print_upload_pages" USING btree ("attempt_id","position");--> statement-breakpoint
CREATE INDEX "idx_marking_decisions_response" ON "marking_decisions" USING btree ("attempt_response_id","seq");--> statement-breakpoint
ALTER TABLE "attempt_sessions" ADD CONSTRAINT "attempt_sessions_marking_stage" CHECK ("attempt_sessions"."marking_stage" IN ('none', 'reading', 'marking', 'preparing', 'done', 'failed'));--> statement-breakpoint
ALTER TABLE "attempt_sessions" ADD CONSTRAINT "attempt_sessions_marked_matches_status" CHECK (("attempt_sessions"."status" = 'marked') = ("attempt_sessions"."marked_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "marking_decisions" ADD CONSTRAINT "marking_decisions_error_type" CHECK ("marking_decisions"."error_type" IS NULL OR "marking_decisions"."error_type" IN ('calculation', 'method', 'misread', 'incomplete', 'other'));--> statement-breakpoint
ALTER TABLE "marking_decisions" ADD CONSTRAINT "marking_decisions_method" CHECK ("marking_decisions"."method" IN ('deterministic', 'needs_review', 'ai_assisted'));--> statement-breakpoint
-- Written by hand: drizzle-kit does not model data fixes or triggers.
--
-- Papers handed in before marking stages existed: automatic marking had already finished, and a paper
-- with no answer waiting for a person is marked.
UPDATE "attempt_sessions" SET "marking_stage" = 'done' WHERE "status" IN ('submitted', 'marked');--> statement-breakpoint
UPDATE "attempt_sessions" a SET "status" = 'marked', "marked_at" = a."submitted_at"
WHERE a."status" = 'submitted'
  AND NOT EXISTS (
    SELECT 1 FROM "attempt_responses" r
    JOIN "marking_decisions" d ON d."attempt_response_id" = r."id"
    WHERE r."attempt_id" = a."id" AND d."final_score" IS NULL
  );--> statement-breakpoint

-- A parent's review is history: it is added, never changed or removed.
CREATE FUNCTION marking_reviews_guard_row() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'marking review % is history; add a new review instead', OLD.id
    USING ERRCODE = 'restrict_violation';
END
$$;--> statement-breakpoint

CREATE TRIGGER marking_reviews_guard_row
  BEFORE UPDATE OR DELETE ON "marking_reviews"
  FOR EACH ROW EXECUTE FUNCTION marking_reviews_guard_row();--> statement-breakpoint

-- A marking decision is never deleted, and after it is written only its final score may change (when a
-- person decides). A new decision about the same answer is a new row.
CREATE FUNCTION marking_decisions_guard_row() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'marking decision % cannot be deleted', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - 'final_score') IS DISTINCT FROM (to_jsonb(OLD) - 'final_score') THEN
    RAISE EXCEPTION 'marking decision % is history; only its final score may change', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER marking_decisions_guard_row
  BEFORE UPDATE OR DELETE ON "marking_decisions"
  FOR EACH ROW EXECUTE FUNCTION marking_decisions_guard_row();
