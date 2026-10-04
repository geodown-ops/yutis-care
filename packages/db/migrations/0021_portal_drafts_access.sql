ALTER TABLE portal_drafts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON portal_drafts USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
