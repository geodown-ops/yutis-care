-- Billing extension points (see src/schema/billing.ts). Plans and subscriptions are set by the platform
-- (as owner); a tenant session may read them but not change them. Usage counters are incremented by the
-- tenant API and worker for their own tenant and are never deleted.

REVOKE INSERT, UPDATE, DELETE ON plans FROM yutis_app;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON tenant_subscriptions FROM yutis_app;
--> statement-breakpoint
REVOKE DELETE ON usage_counters FROM yutis_app;
--> statement-breakpoint
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant_subscriptions USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON usage_counters USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
