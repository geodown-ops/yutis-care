ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON exports USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE retention_findings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON retention_findings USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint

-- The worker: everything yutis_app may do (always inside one tenant's scope), plus listing tenant ids so nightly jobs
-- can visit each tenant in turn. The tenant API cannot list tenants.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yutis_worker') THEN CREATE ROLE yutis_worker NOLOGIN IN ROLE yutis_app; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION worker_tenant_ids() RETURNS TABLE (id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT t.id FROM public.tenants t WHERE t.status = 'active'
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION worker_tenant_ids() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION worker_tenant_ids() TO yutis_worker;
