/*
 * The tenant API's request pipeline against a real PostgreSQL: tenant from subdomain, sessions, role and site
 * checks, the per-request tenant transaction and audit. Probe routes stand in for feature routes until there are
 * real ones. Every route needs three tests: another tenant cannot read it, the wrong role is refused, audit is
 * written.
 */
import { Controller, Get, InternalServerErrorException, Module, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  auditLog, breakGlassGrants, departments, employees, legalEntities, sessions, sites, tenants, userSiteScopes, users, type Db,
} from '@yutis/db';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule, createApp } from '../src/app.js';
import { EmployeeOnly, StaffOnly } from '../src/auth/access.js';
import { assertSiteAccess } from '../src/auth/site-access.js';
import { loadConfig } from '../src/config.js';
import { recordAudit } from '../src/core/audit.js';
import { Ctx, staff, type RequestContext } from '../src/core/context.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

@Controller('probe')
class ProbeController {
  /** Like a future "employee's exam results" route: health data, site-scoped, audited. */
  @Get('health/:employeeId')
  @StaffOnly({ data: 'health', feature: 'employees' })
  async health(@Ctx() ctx: RequestContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    const [e] = await ctx.tx.select().from(employees).where(eq(employees.id, employeeId));
    if (!e) throw new NotFoundException();
    await assertSiteAccess(ctx.tx, staff(ctx), e.siteId);
    await recordAudit(ctx, { action: 'read', subjectTable: 'employees', subjectId: e.id, employeeId: e.id, dataCategory: 'health' });
    return { employeeId: e.id };
  }

  @Get('admin')
  @StaffOnly({ feature: 'tenant-admin' })
  admin() {
    return { ok: true };
  }

  @Get('portal')
  @EmployeeOnly()
  portal() {
    return { ok: true };
  }

  @Get('undeclared')
  undeclared() {
    return { leaked: true };
  }

  @Post('fail')
  @StaffOnly()
  async fail(@Ctx() ctx: RequestContext) {
    await recordAudit(ctx, { action: 'update', reason: 'probe-fail' });
    throw new InternalServerErrorException();
  }

  @Get('crash')
  @StaffOnly()
  crash() {
    throw new Error('duplicate key value violates unique constraint, Key (emp_no)=(E001)');
  }
}

let db: TestDatabase;
let owner: Db;
let app: NestFastifyApplication;
const ids = {
  acme: '', globex: '', s1: '', s2: '', eS1: '', eS2: '', eGlobex: '', nurse: '', hr: '', admin: '',
};

async function seedTenant(slug: string, status: 'active' | 'suspended' = 'active') {
  const [t] = await owner.insert(tenants).values({ slug, name: `${slug} 股份有限公司`, status }).returning();
  const tenantId = t!.id;
  const [le] = await owner.insert(legalEntities).values({ tenantId, code: 'L1', name: `${slug} 股份有限公司` }).returning();
  const [s1, s2] = await owner.insert(sites).values([
    { tenantId, legalEntityId: le!.id, code: 'S1', name: '桃園廠' },
    { tenantId, legalEntityId: le!.id, code: 'S2', name: '新竹廠' },
  ]).returning();
  const [d1, d2] = await owner.insert(departments).values([
    { tenantId, siteId: s1!.id, name: '製造一課' },
    { tenantId, siteId: s2!.id, name: '製造二課' },
  ]).returning();
  const employee = (empNo: string, site: typeof s1, dept: typeof d1, extra: Partial<typeof employees.$inferInsert> = {}) => ({
    tenantId, empNo, name: `${slug} ${empNo}`, sex: '女' as const, birthDate: '1990-01-01', legalEntityId: le!.id, siteId: site!.id, departmentId: dept!.id, ...extra,
  });
  const [e1, e2] = await owner.insert(employees).values([
    employee('E001', s1, d1, { email: `e001@${slug}.test`, phone: `09${slug.length}0000001` }),
    employee('E002', s2, d2, { status: '離職', email: `e002@${slug}.test` }),
  ]).returning();
  return { tenantId, s1: s1!.id, s2: s2!.id, e1: e1!.id, e2: e2!.id };
}

const config = () => loadConfig({
  NODE_ENV: 'test', APP_DATABASE_URL: db.appUrl, TENANT_BASE_DOMAIN: 'care.test', COOKIE_SECURE: 'false', AUTH_DEV_SIGN_IN: 'true',
});

function call(slug: string | null, method: 'GET' | 'POST', url: string, opts: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return app.inject({
    method, url,
    headers: { host: slug ? `${slug}.care.test` : 'api-abc123-de.a.run.app', ...(opts.cookie ? { cookie: opts.cookie } : {}), ...opts.headers },
    ...(opts.body === undefined ? {} : { payload: opts.body as object }),
  });
}

async function signIn(slug: string, token: string, as: 'staff' | 'employee' = 'staff'): Promise<string> {
  const res = await call(slug, 'POST', '/api/auth/sign-in', { body: { token, as } });
  expect(res.statusCode, res.body).toBe(204);
  const cookie = res.cookies.find(c => c.name === 'yutis_session');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  return `yutis_session=${cookie!.value}`;
}

const auditRows = (tenantId: string) => owner.select().from(auditLog).where(eq(auditLog.tenantId, tenantId)).orderBy(auditLog.id);

beforeAll(async () => {
  db = await createTestDatabase();
  owner = db.owner;
  const a = await seedTenant('acme'), g = await seedTenant('globex');
  await seedTenant('dormant', 'suspended');
  Object.assign(ids, { acme: a.tenantId, globex: g.tenantId, s1: a.s1, s2: a.s2, eS1: a.e1, eS2: a.e2, eGlobex: g.e1 });
  const [nurse, hr, admin] = await owner.insert(users).values([
    { tenantId: a.tenantId, email: 'nurse@acme.test', name: '王護理師', role: '職護' },
    { tenantId: a.tenantId, email: 'hr@acme.test', name: '李人資', role: '人資' },
    { tenantId: a.tenantId, email: 'admin@acme.test', name: '陳管理員', role: '租戶管理員' },
    { tenantId: a.tenantId, email: 'gone@acme.test', name: '已停用', role: '職護', active: false },
    { tenantId: g.tenantId, email: 'nurse@globex.test', name: '張護理師', role: '職護' },
  ]).returning();
  Object.assign(ids, { nurse: nurse!.id, hr: hr!.id, admin: admin!.id });
  await owner.insert(userSiteScopes).values([
    { tenantId: a.tenantId, userId: nurse!.id, siteId: a.s1 },
    { tenantId: a.tenantId, userId: hr!.id, siteId: a.s1 },
  ]);

  @Module({ imports: [AppModule.forRoot(config())], controllers: [ProbeController] })
  class TestRoot {}
  app = await createApp(config(), { module: { module: TestRoot }, logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
  await db?.drop();
});

describe('tenant from subdomain', () => {
  it('returns the tenant for its subdomain, before sign-in', async () => {
    const res = await call('acme', 'GET', '/api/tenant');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: ids.acme, name: 'acme 股份有限公司', subdomain: 'acme', logoUrl: null, loginMethods: ['dev'] });
  });

  it.each([['nobody'], ['admin'], ['www'], ['a.acme']])('refuses %s', async slug => {
    const res = await call(slug, 'GET', '/api/tenant');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ status: 404, code: 'unknown_tenant', message: 'Unknown tenant' });
  });

  it('refuses the bare product domain and foreign hosts', async () => {
    expect((await call(null, 'GET', '/api/tenant', { headers: { host: 'care.test' } })).statusCode).toBe(404);
    expect((await call(null, 'GET', '/api/tenant', { headers: { host: 'acme.evil.test' } })).statusCode).toBe(404);
  });

  it('refuses a suspended tenant', async () => {
    const res = await call('dormant', 'GET', '/api/tenant');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'tenant_inactive' });
  });

  it('answers health checks on any host', async () => {
    const res = await call(null, 'GET', '/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

describe('sign-in and sessions', () => {
  it('signs in invited staff, binds the provider account and audits it', async () => {
    const before = (await auditRows(ids.acme)).length;
    const cookie = await signIn('acme', 'nurse@acme.test');
    const [u] = await owner.select().from(users).where(eq(users.id, ids.nurse));
    expect([u!.idpIssuer, u!.idpSubject]).toEqual(['dev', 'nurse@acme.test']);
    expect(u!.lastSignInAt).not.toBeNull();
    const rows = await auditRows(ids.acme);
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)).toMatchObject({ action: 'sign_in', actorUserId: ids.nurse, ip: '127.0.0.1' });
    expect((await call('acme', 'GET', '/api/me', { cookie })).statusCode).toBe(200);
  });

  it('stores only a hash of the session token', async () => {
    const cookie = await signIn('acme', 'hr@acme.test');
    const token = cookie.split('=')[1]!;
    const rows = await owner.select().from(sessions).where(eq(sessions.userId, ids.hr));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => !r.tokenHash.toString('utf8').includes(token) && r.tokenHash.length === 32)).toBe(true);
  });

  it('refuses people who were not invited, disabled accounts and other tenants\' staff', async () => {
    for (const token of ['stranger@acme.test', 'gone@acme.test', 'nurse@globex.test']) {
      expect((await call('acme', 'POST', '/api/auth/sign-in', { body: { token, as: 'staff' } })).statusCode).toBe(401);
    }
  });

  it('signs in current employees by phone or email, not former ones', async () => {
    const [e] = await owner.select().from(employees).where(eq(employees.id, ids.eS1));
    const cookie = await signIn('acme', e!.phone!, 'employee');
    expect((await call('acme', 'GET', '/api/me', { cookie })).json()).toMatchObject({ kind: 'employee', id: ids.eS1, lang: 'zh' });
    expect((await call('acme', 'POST', '/api/auth/sign-in', { body: { token: 'e002@acme.test', as: 'employee' } })).statusCode).toBe(401);
  });

  it('rejects malformed sign-in requests', async () => {
    const res = await call('acme', 'POST', '/api/auth/sign-in', { body: { token: 'nurse@acme.test' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ status: 400, code: 'validation_failed', issues: [expect.objectContaining({ path: ['as'] })] });
  });

  it('signs out', async () => {
    const cookie = await signIn('acme', 'nurse@acme.test');
    expect((await call('acme', 'POST', '/api/auth/sign-out', { cookie })).statusCode).toBe(204);
    expect((await call('acme', 'GET', '/api/me', { cookie })).statusCode).toBe(401);
  });

  it('expires idle and old sessions', async () => {
    const idle = await signIn('acme', 'nurse@acme.test');
    const old = await signIn('acme', 'hr@acme.test');
    await owner.update(sessions).set({ lastSeenAt: sql`now() - interval '16 minutes'` }).where(eq(sessions.userId, ids.nurse));
    await owner.update(sessions).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(sessions.userId, ids.hr));
    expect((await call('acme', 'GET', '/api/me', { cookie: idle })).statusCode).toBe(401);
    expect((await call('acme', 'GET', '/api/me', { cookie: old })).statusCode).toBe(401);
  });

  it('refuses state-changing requests from another origin', async () => {
    const cookie = await signIn('acme', 'nurse@acme.test');
    const evil = { origin: 'http://globex.care.test' };
    const res = await call('acme', 'POST', '/api/auth/sign-out', { cookie, headers: evil });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'cross_origin' });
    expect((await call('acme', 'POST', '/api/auth/sign-out', { cookie, headers: { 'sec-fetch-site': 'same-site' } })).statusCode).toBe(403);
    expect((await call('acme', 'POST', '/api/auth/sign-out', { cookie, headers: { origin: 'http://acme.care.test' } })).statusCode).toBe(204);
  });
});

describe('GET /api/me', () => {
  it('requires sign-in', async () => {
    const res = await call('acme', 'GET', '/api/me');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ status: 401, code: 'unauthorized', message: 'Unauthorized' });
  });

  it('returns role, sites, data categories and features', async () => {
    const cookie = await signIn('acme', 'nurse@acme.test');
    const me = (await call('acme', 'GET', '/api/me', { cookie })).json();
    expect(me).toMatchObject({ kind: 'staff', id: ids.nurse, role: '職護', email: 'nurse@acme.test', breakGlassSites: [] });
    expect(me.sites).toEqual([{ id: ids.s1, code: 'S1', name: '桃園廠' }]);
    expect(me.dataCategories).toEqual(['identity', 'work', 'health', 'medical']);
    expect(me.features).toContain('cases');
    expect(me.features).not.toContain('tenant-admin');

    const hr = (await call('acme', 'GET', '/api/me', { cookie: await signIn('acme', 'hr@acme.test') })).json();
    expect(hr.dataCategories).toEqual(['identity', 'work']);
  });

  it('cannot be read on another tenant with this tenant\'s session', async () => {
    const cookie = await signIn('acme', 'nurse@acme.test');
    expect((await call('globex', 'GET', '/api/me', { cookie })).statusCode).toBe(401);
  });
});

describe('permission pipeline', () => {
  it('lets clinical staff read health data in their site, and audits it in the same transaction', async () => {
    const cookie = await signIn('acme', 'nurse@acme.test');
    const res = await call('acme', 'GET', `/api/probe/health/${ids.eS1}`, { cookie });
    expect(res.statusCode, res.body).toBe(200);
    expect((await auditRows(ids.acme)).at(-1)).toMatchObject({
      action: 'read', actorUserId: ids.nurse, employeeId: ids.eS1, subjectTable: 'employees', dataCategory: 'health',
    });
  });

  it('refuses a role that may not see health data, without auditing a read', async () => {
    const cookie = await signIn('acme', 'hr@acme.test');
    const before = (await auditRows(ids.acme)).length;
    expect((await call('acme', 'GET', `/api/probe/health/${ids.eS1}`, { cookie })).statusCode).toBe(403);
    expect(await auditRows(ids.acme)).toHaveLength(before);
  });

  it('refuses employees outside the staff member\'s sites unless a break-glass grant is active', async () => {
    const cookie = await signIn('acme', 'nurse@acme.test');
    const outside = await call('acme', 'GET', `/api/probe/health/${ids.eS2}`, { cookie });
    expect(outside.statusCode).toBe(403);
    expect(outside.json()).toMatchObject({ code: 'outside_sites' });
    await owner.insert(breakGlassGrants).values({ tenantId: ids.acme, userId: ids.nurse, siteId: ids.s2, reason: '代理', expiresAt: sql`now() - interval '1 minute'` });
    expect((await call('acme', 'GET', `/api/probe/health/${ids.eS2}`, { cookie })).statusCode).toBe(403);
    await owner.insert(breakGlassGrants).values({ tenantId: ids.acme, userId: ids.nurse, siteId: ids.s2, reason: '代理', expiresAt: sql`now() + interval '1 hour'` });
    expect((await call('acme', 'GET', `/api/probe/health/${ids.eS2}`, { cookie })).statusCode).toBe(200);
    const me = (await call('acme', 'GET', '/api/me', { cookie })).json();
    expect(me.breakGlassSites.map((s: { code: string }) => s.code)).toEqual(['S2']);
    await owner.delete(breakGlassGrants).where(and(eq(breakGlassGrants.userId, ids.nurse)));
  });

  it("cannot reach another tenant's employee even by id", async () => {
    const cookie = await signIn('acme', 'nurse@acme.test');
    expect((await call('acme', 'GET', `/api/probe/health/${ids.eGlobex}`, { cookie })).statusCode).toBe(404);
    const globexAudit = await auditRows(ids.globex);
    expect(globexAudit.filter(r => r.actorUserId === ids.nurse)).toHaveLength(0);
  });

  it('checks features and principal kinds', async () => {
    const nurse = await signIn('acme', 'nurse@acme.test');
    const admin = await signIn('acme', 'admin@acme.test');
    const [e] = await owner.select().from(employees).where(eq(employees.id, ids.eS1));
    const employee = await signIn('acme', e!.email!, 'employee');
    expect((await call('acme', 'GET', '/api/probe/admin', { cookie: nurse })).statusCode).toBe(403);
    expect((await call('acme', 'GET', '/api/probe/admin', { cookie: admin })).statusCode).toBe(200);
    expect((await call('acme', 'GET', '/api/probe/admin', { cookie: employee })).statusCode).toBe(403);
    expect((await call('acme', 'GET', '/api/probe/portal', { cookie: nurse })).statusCode).toBe(403);
    expect((await call('acme', 'GET', '/api/probe/portal', { cookie: employee })).statusCode).toBe(200);
    expect((await call('acme', 'GET', `/api/probe/health/${ids.eS1}`, { cookie: admin })).statusCode).toBe(403);
  });

  it('refuses routes that declare no access rule', async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    expect((await call('acme', 'GET', '/api/probe/undeclared', { cookie })).statusCode).toBe(403);
  });

  it('never sends internal error details to the client', async () => {
    const cookie = await signIn('acme', 'nurse@acme.test');
    const res = await call('acme', 'GET', '/api/probe/crash', { cookie });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ status: 500, code: 'internal_error', message: 'Internal server error' });
  });

  it('rolls the audit row back with a failed request', async () => {
    const cookie = await signIn('acme', 'nurse@acme.test');
    expect((await call('acme', 'POST', '/api/probe/fail', { cookie })).statusCode).toBe(500);
    expect((await auditRows(ids.acme)).filter(r => r.reason === 'probe-fail')).toHaveLength(0);
  });
});
