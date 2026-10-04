ALTER TABLE "ergo_surveys" ADD COLUMN "tracking" jsonb;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "guidance_enc" "bytea";--> statement-breakpoint
ALTER TABLE "workload_assessments" ADD COLUMN "reminders" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workload_assessments" ADD COLUMN "last_reminded_at" timestamp with time zone;