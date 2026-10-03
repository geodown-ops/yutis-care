-- Tenant data like every other table created after 0001.
ALTER TABLE exam_import_mappings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON exam_import_mappings USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
