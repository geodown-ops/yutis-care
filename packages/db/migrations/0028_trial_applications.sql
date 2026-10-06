CREATE TYPE "public"."trial_application_status" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
CREATE TABLE "trial_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "trial_application_status" DEFAULT 'pending' NOT NULL,
	"company_name" text NOT NULL,
	"tax_id" text NOT NULL,
	"employee_range" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_title" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"preferred_subdomain" text,
	"identity_provider" text,
	"consented_at" timestamp with time zone NOT NULL,
	"ip_hash" text NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"decline_reason" text,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trial_applications" ADD CONSTRAINT "trial_applications_decided_by_platform_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_applications" ADD CONSTRAINT "trial_applications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trial_applications_status_idx" ON "trial_applications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "trial_applications_ip_idx" ON "trial_applications" USING btree ("ip_hash","created_at");