ALTER TABLE "interviews" ADD COLUMN "next_interview" boolean;--> statement-breakpoint
-- An interview that already has a next date was planned with one.
UPDATE "interviews" SET "next_interview" = true WHERE "next_on" IS NOT NULL;
