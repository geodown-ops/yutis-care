-- Wrapped data keys: the tenant API and worker may read and create their own tenant's, never change or delete them.
ALTER TABLE tenant_keys ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant_keys USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON tenant_keys FROM yutis_app;
