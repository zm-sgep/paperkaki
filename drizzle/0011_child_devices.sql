CREATE TABLE "child_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"parent_profile_id" uuid NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "child_devices_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "child_devices_label_length" CHECK (char_length("child_devices"."label") BETWEEN 1 AND 80),
	CONSTRAINT "child_devices_token_hash_shape" CHECK ("child_devices"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "child_pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"parent_profile_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"wrong_tries" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "child_pairing_codes_wrong_tries" CHECK ("child_pairing_codes"."wrong_tries" >= 0)
);
--> statement-breakpoint
ALTER TABLE "child_devices" ADD CONSTRAINT "child_devices_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_devices" ADD CONSTRAINT "child_devices_parent_profile_id_parent_profiles_id_fk" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_pairing_codes" ADD CONSTRAINT "child_pairing_codes_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_pairing_codes" ADD CONSTRAINT "child_pairing_codes_parent_profile_id_parent_profiles_id_fk" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."parent_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_child_devices_child" ON "child_devices" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "idx_child_devices_parent" ON "child_devices" USING btree ("parent_profile_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_child_pairing_codes_hash" ON "child_pairing_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "idx_child_pairing_codes_child" ON "child_pairing_codes" USING btree ("child_id");