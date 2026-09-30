CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"status" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_runs_status" CHECK ("ai_runs"."status" IN ('succeeded', 'failed')),
	CONSTRAINT "ai_runs_duration" CHECK ("ai_runs"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE INDEX "idx_ai_runs_created" ON "ai_runs" USING btree ("created_at");