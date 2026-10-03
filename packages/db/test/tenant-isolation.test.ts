/*
 * Integration tests against a real PostgreSQL 16. DATABASE_URL must point at a server where the user can
 * create databases and roles (CI provides one; locally `docker compose up -d db`). Each run uses a fresh database.
 */
import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  announcements, auditLog, createDb, defaultTemplates, departments, employees, gradingRules, gradingRuleSets, healthExams, legalEntities, phrases, plans,
  runMigrations, sessions, sites, tenantBySlug, tenants, tenantSettings, tenantSubscriptions, usageCounters, users, withTenant, type Db,
} from '../src/index.js';

const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) throw new Error('DATABASE_URL is required for @yutis/db tests (see README: docker compose up -d db)');

const suffix = randomBytes(4).toString('hex');
const dbName = `yutis_test_${suffix}`;
const appRole = `yutis_test_app_${suffix}`;
const appPassword = randomBytes(12).toString('hex');
const platformRole = `yutis_test_platform_${suffix}`;
const platformPassword = randomBytes(12).toString('hex');

let admin: pg.Pool, ownerPool: pg.Pool, appPool: pg.Pool, platformPool: pg.Pool;
let owner: Db, app: Db, platform: Db;
const T = { a: '', b: '' };
const E = { a: '', b: '' };

/** Drizzle wraps driver errors as "Failed query: …"; the PostgreSQL message is on `cause`. */
async function pgError(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (e) { const err = e as Error & { cause?: Error }; return err.cause?.message ?? err.message; }
  throw new Error('expected the query to fail');
}

const urlFor = (user?: string, password?: string) => {
  const u = new URL(adminUrl);
  u.pathname = `/${dbName}`;
  if (user) { u.username = user; u.password = password ?? ''; }
  return u.toString();
};

async function seedTenant(slug: string) {
  const [t] = await owner.insert(tenants).values({ slug, name: slug }).returning();
  const tenantId = t!.id;
  const [le] = await owner.insert(legalEntities).values({ tenantId, code: 'L1', name: `${slug} 股份有限公司` }).returning();
  const [s] = await owner.insert(sites).values({ tenantId, legalEntityId: le!.id, code: 'S1', name: '桃園廠' }).returning();
  const [d] = await owner.insert(departments).values({ tenantId, siteId: s!.id, name: '製造一課' }).returning();
  const [e] = await owner.insert(employees).values({
    tenantId, empNo: 'E001', name: `${slug} 員工`, sex: '女', birthDate: '1990-01-01', legalEntityId: le!.id, siteId: s!.id, departmentId: d!.id,
  }).returning();
  return { tenantId, employeeId: e!.id, siteId: s!.id, legalEntityId: le!.id, departmentId: d!.id };
}

beforeAll(async () => {
  admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
  await admin.query(`create database ${dbName}`);
  ownerPool = new pg.Pool({ connectionString: urlFor(), max: 2 });
  owner = createDb(ownerPool);
  await runMigrations(owner);
  await admin.query(`create role ${appRole} login password '${appPassword}' in role yutis_app`);
  appPool = new pg.Pool({ connectionString: urlFor(appRole, appPassword), max: 2 });
  app = createDb(appPool);
  await admin.query(`create role ${platformRole} login password '${platformPassword}' in role yutis_platform`);
  platformPool = new pg.Pool({ connectionString: urlFor(platformRole, platformPassword), max: 2 });
  platform = createDb(platformPool);
  const a = await seedTenant('acme'), b = await seedTenant('globex');
  T.a = a.tenantId; T.b = b.tenantId; E.a = a.employeeId; E.b = b.employeeId;
});

/** Pool.end() resolves before the sockets close; dropping the database under a closing client crashes the run. */
async function waitForDisconnect() {
  for (let i = 0; i < 100; i++) {
    const { rows } = await admin.query<{ n: number }>('select count(*)::int as n from pg_stat_activity where datname = $1', [dbName]);
    if (rows[0]!.n === 0) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

afterAll(async () => {
  await appPool?.end();
  await platformPool?.end();
  await ownerPool?.end();
  if (admin) await waitForDisconnect();
  await admin?.query(`drop database if exists ${dbName} with (force)`);
  await admin?.query(`drop role if exists ${appRole}`);
  await admin?.query(`drop role if exists ${platformRole}`);
  await admin?.end();
});

describe('tenant isolation (Row-Level Security)', () => {
  it('shows nothing when no tenant is set', async () => {
    expect(await app.select().from(employees)).toHaveLength(0);
    expect(await app.select().from(tenants)).toHaveLength(0);
  });

  it("shows only the current tenant's rows", async () => {
    const rows = await withTenant(app, T.a, tx => tx.select().from(employees));
    expect(rows.map(r => r.id)).toEqual([E.a]);
    const own = await withTenant(app, T.a, tx => tx.select().from(tenants));
    expect(own.map(r => r.id)).toEqual([T.a]);
  });

  it("cannot read another tenant's row even by id", async () => {
    const rows = await withTenant(app, T.a, tx => tx.select().from(employees).where(eq(employees.id, E.b)));
    expect(rows).toHaveLength(0);
  });

  it('does not leak the tenant setting past the transaction', async () => {
    await withTenant(app, T.a, tx => tx.select().from(employees));
    expect(await app.select().from(employees)).toHaveLength(0);
  });

  it("rejects writing a row into another tenant", async () => {
    const [b] = await owner.select().from(employees).where(eq(employees.id, E.b));
    expect(await pgError(withTenant(app, T.a, tx => tx.insert(employees).values({ ...b!, id: undefined, empNo: 'E999' } as typeof employees.$inferInsert)))).toMatch(/row-level security/);
  });

  it("cannot update or delete another tenant's rows", async () => {
    const upd = await withTenant(app, T.a, tx => tx.update(employees).set({ name: 'x' }).where(eq(employees.id, E.b)).returning());
    expect(upd).toHaveLength(0);
    const del = await withTenant(app, T.a, tx => tx.delete(employees).where(eq(employees.id, E.b)).returning());
    expect(del).toHaveLength(0);
    const [b] = await owner.select().from(employees).where(eq(employees.id, E.b));
    expect(b!.name).toBe('globex 員工');
  });

  it("rejects a reference to another tenant's row, even from the table owner", async () => {
    const [rs] = await owner.insert(gradingRuleSets).values({ tenantId: T.a, version: 1 }).returning();
    expect(await pgError(owner.insert(healthExams).values({
      tenantId: T.a, employeeId: E.b, examDate: '2026-09-01', kind: '年度健檢', ruleSetId: rs!.id, gradeTotal: 0, gradeMax: 0,
    }))).toMatch(/foreign key/);
  });

  it('cannot create tenants from a tenant session', async () => {
    expect(await pgError(withTenant(app, T.a, tx => tx.insert(tenants).values({ slug: 'evil', name: 'evil' })))).toMatch(/permission denied/);
  });

  it('finds a tenant by exact subdomain before any tenant is set, and nothing else', async () => {
    expect(await tenantBySlug(app, 'acme')).toEqual({ id: T.a, slug: 'acme', name: 'acme', status: 'active' });
    expect(await tenantBySlug(app, 'nobody')).toBeUndefined();
    expect(await tenantBySlug(app, '%')).toBeUndefined();
  });

  it("does not find another tenant's session", async () => {
    const tokenHash = randomBytes(32);
    await withTenant(app, T.a, tx => tx.insert(sessions).values({ tenantId: T.a, tokenHash, employeeId: E.a, expiresAt: new Date(Date.now() + 60_000) }));
    expect(await withTenant(app, T.a, tx => tx.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)))).toHaveLength(1);
    expect(await withTenant(app, T.b, tx => tx.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)))).toHaveLength(0);
    expect(await pgError(withTenant(app, T.a, tx => tx.insert(sessions).values({ tenantId: T.a, tokenHash: randomBytes(32), employeeId: E.b, expiresAt: new Date() })))).toMatch(/foreign key/);
  });

  it('protects every tenant-owned table', async () => {
    const { rows } = await ownerPool.query<{ table_name: string; rowsecurity: boolean; policies: string }>(`
      select c.table_name, t.rowsecurity, count(p.policyname)::text as policies
      from information_schema.columns c
      join pg_tables t on t.schemaname = c.table_schema and t.tablename = c.table_name
      left join pg_policies p on p.schemaname = c.table_schema and p.tablename = c.table_name
      where c.table_schema = 'public' and c.column_name = 'tenant_id'
      group by c.table_name, t.rowsecurity`);
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.filter(r => !r.rowsecurity || r.policies === '0').map(r => r.table_name)).toEqual([]);
  });
});

describe('audit log', () => {
  it('accepts inserts but no changes', async () => {
    const [row] = await withTenant(app, T.a, tx => tx.insert(auditLog).values({ tenantId: T.a, action: 'read', subjectTable: 'employees', subjectId: E.a, employeeId: E.a, dataCategory: 'health' }).returning());
    expect(row!.id).toBeGreaterThan(0);
    expect(await pgError(withTenant(app, T.a, tx => tx.update(auditLog).set({ reason: 'x' })))).toMatch(/permission denied/);
    expect(await pgError(withTenant(app, T.a, tx => tx.delete(auditLog)))).toMatch(/permission denied/);
    expect(await pgError(owner.delete(auditLog))).toMatch(/append-only/);
    expect(await pgError(owner.execute(sql`truncate audit_log`))).toMatch(/append-only/);
  });

  it("is isolated per tenant like everything else", async () => {
    expect(await withTenant(app, T.b, tx => tx.select().from(auditLog))).toHaveLength(0);
  });
});

describe('billing extension points', () => {
  it('lets a tenant read its own subscription but not change it or see others', async () => {
    const [plan] = await owner.insert(plans).values({ code: 'standard', name: '標準方案' }).returning();
    await owner.insert(tenantSubscriptions).values([
      { tenantId: T.a, planId: plan!.id, status: 'active', seatLimit: 500, startsOn: '2026-10-01' },
      { tenantId: T.b, planId: plan!.id, startsOn: '2026-10-01' },
    ]);
    const own = await withTenant(app, T.a, tx => tx.select().from(tenantSubscriptions));
    expect(own.map(r => r.tenantId)).toEqual([T.a]);
    expect(await withTenant(app, T.a, tx => tx.select().from(plans))).toHaveLength(1);
    expect(await pgError(withTenant(app, T.a, tx => tx.update(tenantSubscriptions).set({ seatLimit: 9999 })))).toMatch(/permission denied/);
    expect(await pgError(withTenant(app, T.a, tx => tx.insert(plans).values({ code: 'free', name: 'free' })))).toMatch(/permission denied/);
  });

  it('counts usage per tenant and month, and never deletes it', async () => {
    const bump = (tenantId: string) => withTenant(app, tenantId, tx => tx.insert(usageCounters)
      .values({ tenantId, period: '2026-10-01', metric: 'sms_sent', quantity: 1 })
      .onConflictDoUpdate({ target: [usageCounters.tenantId, usageCounters.period, usageCounters.metric], set: { quantity: sql`${usageCounters.quantity} + 1` } }));
    await bump(T.a); await bump(T.a);
    const [row] = await withTenant(app, T.a, tx => tx.select().from(usageCounters));
    expect(row!.quantity).toBe(2);
    expect(await withTenant(app, T.b, tx => tx.select().from(usageCounters))).toHaveLength(0);
    expect(await pgError(withTenant(app, T.a, tx => tx.insert(usageCounters).values({ tenantId: T.b, period: '2026-10-01', metric: 'sms_sent' })))).toMatch(/row-level security/);
    expect(await pgError(withTenant(app, T.a, tx => tx.delete(usageCounters)))).toMatch(/permission denied/);
    expect(await pgError(owner.insert(usageCounters).values({ tenantId: T.a, period: '2026-10-15', metric: 'sms_sent' }))).toMatch(/usage_counters_period_is_month/);
  });
});

describe('platform role (yutis_platform)', () => {
  /** Everything the platform API may touch. Every other table, current or future, must stay closed to it. */
  const allowed = new Set(['tenants', 'plans', 'tenant_subscriptions', 'usage_counters', 'platform_users', 'default_templates', 'announcements', 'support_access_grants', 'platform_audit_log']);

  it('has no privilege on any employee, health or programme table', async () => {
    const { rows } = await ownerPool.query<{ name: string; any: boolean }>(`
      select c.relname as name, has_table_privilege($1, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as any
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')`, [platformRole]);
    expect(rows.length).toBeGreaterThan(40);
    expect(rows.filter(r => r.any && !allowed.has(r.name)).map(r => r.name)).toEqual([]);
  });

  it.each(['employees', 'health_exams', 'health_exam_results', 'assist_records', 'cases', 'ergo_surveys', 'workload_assessments', 'interviews',
    'maternal_cases', 'maternal_interviews', 'violence_incidents', 'audit_log', 'users', 'sessions', 'grading_rules', 'phrases', 'tenant_settings'])(
    'cannot read %s', async table => {
      expect(await pgError(platform.execute(sql.raw(`select * from ${table} limit 1`)))).toMatch(/permission denied/);
    });

  it('sees every tenant, and usage only as counts', async () => {
    expect((await platform.select().from(tenants)).map(t => t.slug)).toEqual(expect.arrayContaining(['acme', 'globex']));
    const { rows } = await platform.execute<{ tenant_id: string; active_employees: string }>(sql`select * from tenant_counts('2026-09-15')`);
    expect(rows.find(r => r.tenant_id === T.a)).toMatchObject({ active_employees: '1' });
  });

  it('cannot create a tenant with a reserved or malformed subdomain', async () => {
    for (const slug of ['admin', 'api', 'www', 'Bad', 'a.b', '-x']) {
      expect(await pgError(platform.insert(tenants).values({ slug, name: slug }))).toMatch(/tenants_slug_format/);
    }
  });

  it('copies default templates into a new tenant once', async () => {
    const [t] = await platform.insert(tenants).values({ slug: 'fresh', name: '新客戶' }).returning();
    expect(await pgError(platform.execute(sql`select apply_default_templates(${t!.id})`))).toMatch(/no active default template/);
    await platform.insert(defaultTemplates).values([
      { kind: 'grading_rules', version: 1, active: true, content: [{ code: 'B0111', name: '收縮壓', sex: '不限', unit: 'mmHg', src: 'manual', levels: [{ lv: 1, max: 140 }] }] },
      { kind: 'phrases', version: 1, active: true, content: [{ cat: '健康諮詢', text: '多喝水' }] },
      { kind: 'sign_off_roles', version: 1, active: true, content: ['勞工健康服務醫師'] },
      { kind: 'survey_versions', version: 1, active: true, content: { nmq: 'nmq-v1' } },
    ]);
    await platform.execute(sql`select apply_default_templates(${t!.id})`);
    const copied = await withTenant(app, t!.id, async tx => ({
      sets: await tx.select().from(gradingRuleSets), rules: await tx.select().from(gradingRules),
      phrases: await tx.select().from(phrases), settings: await tx.select().from(tenantSettings),
    }));
    expect(copied.sets).toMatchObject([{ version: 1, status: 'published' }]);
    expect(copied.rules).toMatchObject([{ itemCode: 'B0111', valueType: 'number', source: 'manual', levels: [{ lv: 1, max: 140 }] }]);
    expect(copied.phrases.map(p => p.text)).toEqual(['多喝水']);
    expect(copied.settings.map(x => x.key).sort()).toEqual(['sign_off_roles', 'survey_versions']);
    expect(await pgError(platform.execute(sql`select apply_default_templates(${t!.id})`))).toMatch(/already has templates/);
  });

  it('creates the first tenant admin only while there is none', async () => {
    const [t] = await platform.insert(tenants).values({ slug: 'newco', name: '新公司' }).returning();
    const { rows } = await platform.execute<{ id: string }>(sql`select invite_tenant_admin(${t!.id}, 'Boss@NewCo.test', '王大明') as id`);
    const [u] = await owner.select().from(users).where(eq(users.id, rows[0]!.id));
    expect(u).toMatchObject({ tenantId: t!.id, email: 'boss@newco.test', role: '租戶管理員' });
    expect(await pgError(platform.execute(sql`select invite_tenant_admin(${t!.id}, 'me@yutis.test', 'x')`))).toMatch(/already has a tenant admin/);
  });

  it('is not reachable from tenant sessions', async () => {
    for (const q of [sql`select tenant_counts(now()::date)`, sql`select invite_tenant_admin(${T.a}, 'x@x.test', 'x')`, sql`select apply_default_templates(${T.a})`]) {
      expect(await pgError(withTenant(app, T.a, tx => tx.execute(q)))).toMatch(/permission denied/);
    }
    for (const table of ['platform_users', 'announcements', 'platform_audit_log', 'default_templates']) {
      expect(await pgError(withTenant(app, T.a, tx => tx.execute(sql.raw(`select * from ${table}`))))).toMatch(/permission denied/);
    }
  });

  it('shows a tenant only current announcements for everyone or for it', async () => {
    await platform.insert(announcements).values([
      { title: '全體', body: '…' },
      { title: '只給 acme', body: '…', tenantId: T.a },
      { title: '只給 globex', body: '…', tenantId: T.b },
      { title: '已過期', body: '…', expiresAt: new Date(Date.now() - 1000) },
      { title: '未發布', body: '…', publishAt: new Date(Date.now() + 3_600_000) },
    ]);
    const { rows } = await withTenant(app, T.a, tx => tx.execute<{ title: string }>(sql`select title from tenant_announcements`));
    expect(rows.map(r => r.title).sort()).toEqual(['全體', '只給 acme'].sort());
    expect((await app.execute(sql`select * from tenant_announcements`)).rows).toHaveLength(0);
    expect(await pgError(withTenant(app, T.a, tx => tx.execute(sql`insert into tenant_announcements (title, body) values ('x', 'y')`)))).toMatch(/permission denied/);
  });

  it('keeps the platform audit log append-only', async () => {
    await platform.execute(sql`insert into platform_audit_log (actor_email, action) values ('ops@yutis.test', 'test')`);
    expect(await pgError(platform.execute(sql`update platform_audit_log set action = 'x'`))).toMatch(/permission denied/);
    expect(await pgError(owner.execute(sql`delete from platform_audit_log`))).toMatch(/append-only/);
  });
});
