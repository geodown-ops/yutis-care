ALTER TABLE "phrases" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_tenant_id_site_id_name_unique" UNIQUE("tenant_id","site_id","name");--> statement-breakpoint
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_tenant_id_code_unique" UNIQUE("tenant_id","code");--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_tenant_id_code_unique" UNIQUE("tenant_id","code");