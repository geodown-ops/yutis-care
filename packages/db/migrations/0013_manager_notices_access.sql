ALTER TABLE manager_notices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON manager_notices USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
