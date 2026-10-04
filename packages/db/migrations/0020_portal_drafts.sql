CREATE TABLE "portal_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"employee_id" uuid NOT NULL,
	"task_kind" text NOT NULL,
	"task_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	CONSTRAINT "portal_drafts_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "portal_drafts_task_key" UNIQUE("tenant_id","employee_id","task_kind","task_id")
);
--> statement-breakpoint
ALTER TABLE "portal_drafts" ADD CONSTRAINT "portal_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_drafts" ADD CONSTRAINT "portal_drafts_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;