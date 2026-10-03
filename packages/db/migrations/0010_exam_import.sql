CREATE TABLE "exam_import_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"clinic" text NOT NULL,
	"mapping" jsonb NOT NULL,
	CONSTRAINT "exam_import_mappings_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "exam_import_mappings_tenant_id_clinic_unique" UNIQUE("tenant_id","clinic")
);
--> statement-breakpoint
ALTER TABLE "exam_import_mappings" ADD CONSTRAINT "exam_import_mappings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_national_id_hash_unique" UNIQUE("tenant_id","national_id_hash");--> statement-breakpoint
ALTER TABLE "health_exams" ADD CONSTRAINT "health_exams_one_per_day" UNIQUE("tenant_id","employee_id","exam_date","kind");