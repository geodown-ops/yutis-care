ALTER TABLE phrases ADD CONSTRAINT phrases_kind CHECK (kind IS NULL OR kind IN ('改善', '建議'));
--> statement-breakpoint

-- Same as in 0007, now keeping each phrase's 改善／建議 kind.
CREATE OR REPLACE FUNCTION apply_default_templates(p_tenant uuid) RETURNS void
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

  INSERT INTO public.phrases (tenant_id, category, text, kind)
    SELECT p_tenant, p->>'cat', p->>'text', p->>'kind'
    FROM public.default_templates d, jsonb_array_elements(d.content) p WHERE d.kind = 'phrases' AND d.active;

  INSERT INTO public.tenant_settings (tenant_id, key, value)
    SELECT p_tenant, d.kind::text, d.content FROM public.default_templates d
    WHERE d.kind IN ('sign_off_roles', 'survey_versions') AND d.active;
END $$;
--> statement-breakpoint

-- The tenant admins of one tenant, for the platform's tenant detail page (租戶管理員名單). Only these four fields of
-- users with the 租戶管理員 role; the platform still has no access to the accounts table.
CREATE FUNCTION tenant_admins(p_tenant uuid)
  RETURNS TABLE (name text, email text, active boolean, last_sign_in_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT u.name, u.email, u.active, u.last_sign_in_at FROM public.users u
  WHERE u.tenant_id = p_tenant AND u.role = '租戶管理員' ORDER BY u.name
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION tenant_admins(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION tenant_admins(uuid) TO yutis_platform;
