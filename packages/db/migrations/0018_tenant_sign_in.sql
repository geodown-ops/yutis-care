-- The sign-in page also needs the tenant's Identity Platform tenant id (the browser passes it to the sign-in SDK, and
-- the API checks ID tokens against it). Like the rest of tenant_by_slug's columns, it is not secret.
DROP FUNCTION tenant_by_slug(text);
--> statement-breakpoint
CREATE FUNCTION tenant_by_slug(p_slug text) RETURNS TABLE (id uuid, slug text, name text, status text, idp_tenant_id text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT t.id, t.slug, t.name, t.status, t.idp_tenant_id FROM public.tenants t WHERE t.slug = p_slug
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION tenant_by_slug(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION tenant_by_slug(text) TO yutis_app;
