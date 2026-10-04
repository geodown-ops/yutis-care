ALTER TABLE "violence_reviews" ADD COLUMN "site_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "violence_reviews" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "violence_reviews" ADD COLUMN "status" text DEFAULT '草稿' NOT NULL;--> statement-breakpoint
ALTER TABLE "violence_reviews" ADD CONSTRAINT "violence_reviews_site_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violence_reviews" ADD CONSTRAINT "violence_reviews_department_fk" FOREIGN KEY ("tenant_id","department_id") REFERENCES "public"."departments"("tenant_id","id") ON DELETE no action ON UPDATE no action;