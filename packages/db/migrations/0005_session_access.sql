-- Sessions are tenant data like everything else: a cookie presented on another tenant's subdomain finds no row.
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON sessions USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint

-- The tenant API has to find the tenant from the request's subdomain before it knows which tenant to scope to,
-- and RLS hides every tenants row until app.tenant_id is set. This function (running as the table owner) returns
-- only what the sign-in page shows anyway, for one exact slug; it cannot list tenants.
CREATE FUNCTION tenant_by_slug(p_slug text) RETURNS TABLE (id uuid, slug text, name text, status text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT t.id, t.slug, t.name, t.status FROM public.tenants t WHERE t.slug = p_slug
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION tenant_by_slug(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION tenant_by_slug(text) TO yutis_app;
