-- The platform API's role. It manages customers, not employees: it may use tenants, the platform tables, plans,
-- subscriptions and usage counters, and a few SECURITY DEFINER functions that return counts or copy defaults.
-- It has no privilege on any employee, health or programme table, and default privileges never give it new tables.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yutis_platform') THEN CREATE ROLE yutis_platform NOLOGIN; END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO yutis_platform;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON tenants, plans, tenant_subscriptions, platform_users, default_templates TO yutis_platform;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON announcements TO yutis_platform;
--> statement-breakpoint
GRANT SELECT ON usage_counters, support_access_grants TO yutis_platform;
--> statement-breakpoint
GRANT SELECT, INSERT ON platform_audit_log TO yutis_platform;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE platform_audit_log_id_seq TO yutis_platform;
--> statement-breakpoint
CREATE POLICY platform_all ON tenants TO yutis_platform USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY platform_all ON tenant_subscriptions TO yutis_platform USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY platform_all ON usage_counters TO yutis_platform USING (true);
--> statement-breakpoint

-- Platform tables are not tenant data: the tenant API's default privileges on new tables are taken back.
REVOKE ALL ON platform_users, announcements, platform_audit_log, default_templates FROM yutis_app;
--> statement-breakpoint
REVOKE ALL ON SEQUENCE platform_audit_log_id_seq FROM yutis_app;
--> statement-breakpoint
-- Tenant admins grant and revoke support access in their own tenant; the platform only reads the grants.
REVOKE DELETE, TRUNCATE ON support_access_grants FROM yutis_app;
--> statement-breakpoint
ALTER TABLE support_access_grants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON support_access_grants USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE POLICY platform_all ON support_access_grants TO yutis_platform USING (true);
--> statement-breakpoint
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant_settings USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY platform_all ON announcements TO yutis_platform USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY platform_all ON platform_audit_log TO yutis_platform USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE TRIGGER platform_audit_log_no_change BEFORE UPDATE OR DELETE ON platform_audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
--> statement-breakpoint
CREATE TRIGGER platform_audit_log_no_truncate BEFORE TRUNCATE ON platform_audit_log FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();
--> statement-breakpoint

-- What a tenant back office shows: current announcements for everyone or for this tenant. Read-only for yutis_app.
CREATE VIEW tenant_announcements WITH (security_barrier) AS
  SELECT a.id, a.kind, a.title, a.body, a.publish_at, a.expires_at FROM announcements a
  WHERE app_tenant_id() IS NOT NULL AND (a.tenant_id IS NULL OR a.tenant_id = app_tenant_id())
    AND a.publish_at <= now() AND (a.expires_at IS NULL OR a.expires_at > now());
--> statement-breakpoint
REVOKE ALL ON tenant_announcements FROM yutis_app;
--> statement-breakpoint
GRANT SELECT ON tenant_announcements TO yutis_app;
--> statement-breakpoint

-- Usage for the platform, as counts only (用量). One row per tenant; no row-level data leaves the database.
CREATE FUNCTION tenant_counts(p_period date)
  RETURNS TABLE (tenant_id uuid, active_employees bigint, staff_accounts bigint, exams_in_period bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT t.id,
    (SELECT count(*) FROM public.employees e WHERE e.tenant_id = t.id AND e.status = '在職'),
    (SELECT count(*) FROM public.users u WHERE u.tenant_id = t.id AND u.active),
    (SELECT count(*) FROM public.health_exams h WHERE h.tenant_id = t.id
       AND h.exam_date >= date_trunc('month', p_period) AND h.exam_date < date_trunc('month', p_period) + interval '1 month')
  FROM public.tenants t
$$;
--> statement-breakpoint

-- Onboarding: copy the active default templates into a new tenant. Refuses a tenant that already has any of them,
-- so the platform cannot use it to write into an existing tenant's data.
CREATE FUNCTION apply_default_templates(p_tenant uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  rules public.default_templates;
  rule_set uuid;
  missing text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant) THEN
    RAISE EXCEPTION 'tenant % does not exist', p_tenant;
  END IF;
  IF EXISTS (SELECT 1 FROM public.grading_rule_sets WHERE tenant_id = p_tenant)
     OR EXISTS (SELECT 1 FROM public.phrases WHERE tenant_id = p_tenant)
     OR EXISTS (SELECT 1 FROM public.tenant_settings WHERE tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'tenant % already has templates; defaults are only copied at onboarding', p_tenant;
  END IF;
  SELECT string_agg(k::text, ', ') INTO missing FROM unnest(enum_range(NULL::public.template_kind)) k
    WHERE NOT EXISTS (SELECT 1 FROM public.default_templates d WHERE d.kind = k AND d.active);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'no active default template for: %', missing USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO rules FROM public.default_templates WHERE kind = 'grading_rules' AND active;
  INSERT INTO public.grading_rule_sets (tenant_id, version, status, effective_from, note)
    VALUES (p_tenant, 1, 'published', current_date, format('平台預設範本 v%s', rules.version))
    RETURNING id INTO rule_set;
  INSERT INTO public.grading_rules (tenant_id, rule_set_id, item_code, name, sex, unit, value_type, levels, source)
    SELECT p_tenant, rule_set, r->>'code', r->>'name', r->>'sex', coalesce(r->>'unit', ''), coalesce(r->>'type', 'number'), r->'levels', r->>'src'
    FROM jsonb_array_elements(rules.content) r;

  INSERT INTO public.phrases (tenant_id, category, text)
    SELECT p_tenant, p->>'cat', p->>'text'
    FROM public.default_templates d, jsonb_array_elements(d.content) p WHERE d.kind = 'phrases' AND d.active;

  INSERT INTO public.tenant_settings (tenant_id, key, value)
    SELECT p_tenant, d.kind::text, d.content FROM public.default_templates d
    WHERE d.kind IN ('sign_off_roles', 'survey_versions') AND d.active;
END $$;
--> statement-breakpoint

-- Onboarding: create the tenant's first tenant admin (the invitation). Only while the tenant has none, so the
-- platform cannot add itself to an existing tenant.
CREATE FUNCTION invite_tenant_admin(p_tenant uuid, p_email text, p_name text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  admin_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE tenant_id = p_tenant AND role = '租戶管理員') THEN
    RAISE EXCEPTION 'tenant % already has a tenant admin', p_tenant;
  END IF;
  INSERT INTO public.users (tenant_id, email, name, role) VALUES (p_tenant, lower(p_email), p_name, '租戶管理員')
    RETURNING id INTO admin_id;
  RETURN admin_id;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION tenant_counts(date), apply_default_templates(uuid), invite_tenant_admin(uuid, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION tenant_counts(date), apply_default_templates(uuid), invite_tenant_admin(uuid, text, text) TO yutis_platform;
