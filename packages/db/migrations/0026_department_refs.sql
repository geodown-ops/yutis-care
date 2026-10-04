ALTER TABLE "violence_checklists" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "violence_incidents" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "service_records" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "violence_checklists" ADD CONSTRAINT "violence_checklists_department_fk" FOREIGN KEY ("tenant_id","department_id") REFERENCES "public"."departments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violence_incidents" ADD CONSTRAINT "violence_incidents_department_fk" FOREIGN KEY ("tenant_id","department_id") REFERENCES "public"."departments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_department_fk" FOREIGN KEY ("tenant_id","department_id") REFERENCES "public"."departments"("tenant_id","id") ON DELETE no action ON UPDATE no action;