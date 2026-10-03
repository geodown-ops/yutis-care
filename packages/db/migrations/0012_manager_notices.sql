CREATE TABLE "manager_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"manager_user_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"subject_table" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"advice" text NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "manager_notices_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "manager_notices" ADD CONSTRAINT "manager_notices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_notices" ADD CONSTRAINT "manager_notices_manager_fk" FOREIGN KEY ("tenant_id","manager_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_notices" ADD CONSTRAINT "manager_notices_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manager_notices_manager_idx" ON "manager_notices" USING btree ("tenant_id","manager_user_id");