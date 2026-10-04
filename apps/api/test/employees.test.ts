/*
 * Employee directory against a real PostgreSQL: who may search and open employees, only within their sites (or a
 * break-glass grant), never another tenant's, and every employee returned is audited.
 */
import { randomBytes } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { auditLog, breakGlassGrants, departments, employees, legalEntities, sites, tenants, users, type Db } from '@yutis/db';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

let db: TestDatabase;
let owner: Db;
let app: NestFastifyApplication;
const ids = { acme: '', globex: '', s1: '', s2: '', d1: '', d2: '', lin: '', wu: '', far: '', globexEmp: '', hr: '' };

function call(slug: string, url: string, cookie?: string) {
  return app.inject({ method: 'GET', url, headers: { host: `${slug}.care.test`, ...(cookie ? { cookie } : {}) } });
}
const cookies = new Map<string, string>();
async function as(email: string, slug = 'acme'): Promise<string> {
  const key = `${slug}/${email}`;
  if (cookies.has(key)) return cookies.get(key)!;
  const res = await app.inject({ method: 'POST', url: '/api/auth/sign-in', headers: { host: `${slug}.care.test` }, payload: { token: email, as: 'staff' } });
  expect(res.statusCode, `${email}: ${res.body}`).toBe(204);
  const cookie = `yutis_session=${res.cookies.find(c => c.name === 'yutis_session')!.value}`;
  cookies.set(key, cookie);
  return cookie;
}
const reads = (employeeId: string) => owner.select().from(auditLog).where(and(eq(auditLog.employeeId, employeeId), eq(auditLog.subjectTable, 'employees')));

beforeAll(async () => {
  db = await createTestDatabase();
  owner = db.owner;
  const [acme, globex] = await owner.insert(tenants).values([{ slug: 'acme', name: 'Acme' }, { slug: 'globex', name: 'Globex' }]).returning();
  ids.acme = acme!.id; ids.globex = globex!.id;
  const [le, gle] = await owner.insert(legalEntities).values([
    { tenantId: ids.acme, code: 'L1', name: 'Acme' }, { tenantId: ids.globex, code: 'G1', name: 'Globex' },
  ]).returning();
  const [s1, s2, gs] = await owner.insert(sites).values([
    { tenantId: ids.acme, legalEntityId: le!.id, code: 'TY', name: '桃園廠' },
    { tenantId: ids.acme, legalEntityId: le!.id, code: 'HC', name: '新竹廠' },
    { tenantId: ids.globex, legalEntityId: gle!.id, code: 'TY', name: 'Globex 桃園廠' },
  ]).returning();
  ids.s1 = s1!.id; ids.s2 = s2!.id;
  const [d1, d2, d3, gd] = await owner.insert(departments).values([
    { tenantId: ids.acme, siteId: s1!.id, name: '製造一課' },
    { tenantId: ids.acme, siteId: s1!.id, name: '品保課' },
    { tenantId: ids.acme, siteId: s2!.id, name: '研發部' },
    { tenantId: ids.globex, siteId: gs!.id, name: '製造課' },
  ]).returning();
  ids.d1 = d1!.id; ids.d2 = d2!.id;
  const emp = (tenantId: string, empNo: string, name: string, legalEntityId: string, siteId: string, departmentId: string, extra: Partial<typeof employees.$inferInsert> = {}) => ({
    tenantId, empNo, name, sex: '男' as const, birthDate: '1985-05-05', legalEntityId, siteId, departmentId, ...extra,
  });
  const rows = await owner.insert(employees).values([
    emp(ids.acme, 'E100', '林志明', le!.id, s1!.id, d1!.id, { title: '技術員', shift: '常日班', nationalIdHash: 'h1', nationalIdMasked: 'A1•••••789' }),
    emp(ids.acme, 'E101', '吳建宏', le!.id, s1!.id, d2!.id, { status: '離職' }),
    emp(ids.acme, 'E102', '陳100%', le!.id, s1!.id, d2!.id),
    emp(ids.acme, 'E200', '黃淑芬', le!.id, s2!.id, d3!.id),
    emp(ids.globex, 'E100', 'Globex 員工', gle!.id, gs!.id, gd!.id),
  ]).returning();
  const idOf = (tenantId: string, empNo: string) => rows.find(r => r.tenantId === tenantId && r.empNo === empNo)!.id;
  ids.lin = idOf(ids.acme, 'E100'); ids.wu = idOf(ids.acme, 'E101'); ids.far = idOf(ids.acme, 'E200'); ids.globexEmp = idOf(ids.globex, 'E100');

  const staff = await owner.insert(users).values([
    { tenantId: ids.acme, email: 'nurse@acme.test', name: '王護理師', role: '職護' },
    { tenantId: ids.acme, email: 'doctor@acme.test', name: '張醫師', role: '職醫' },
    { tenantId: ids.acme, email: 'hr@acme.test', name: '李人資', role: '人資' },
    { tenantId: ids.acme, email: 'safety@acme.test', name: '職安衛', role: '職安衛人員' },
    { tenantId: ids.acme, email: 'manager@acme.test', name: '主管', role: '部門主管' },
    { tenantId: ids.acme, email: 'admin@acme.test', name: '管理員', role: '租戶管理員' },
    { tenantId: ids.globex, email: 'nurse@globex.test', name: 'Globex 護理師', role: '職護' },
  ]).returning();
  const id = (email: string) => staff.find(u => u.email === email)!.id;
  ids.hr = id('hr@acme.test');
  await owner.execute(sql`insert into user_site_scopes (tenant_id, user_id, site_id) values
    (${ids.acme}, ${id('nurse@acme.test')}, ${ids.s1}), (${ids.acme}, ${id('doctor@acme.test')}, ${ids.s1}), (${ids.acme}, ${id('doctor@acme.test')}, ${ids.s2}),
    (${ids.acme}, ${ids.hr}, ${ids.s1}), (${ids.acme}, ${id('safety@acme.test')}, ${ids.s1}), (${ids.acme}, ${id('manager@acme.test')}, ${ids.s1}),
    (${ids.globex}, ${id('nurse@globex.test')}, ${gs!.id})`);

  const config = loadConfig({
    NODE_ENV: 'test', APP_DATABASE_URL: db.appUrl, TENANT_BASE_DOMAIN: 'care.test', COOKIE_SECURE: 'false', AUTH_DEV_SIGN_IN: 'true',
    TENANT_CRYPTO_LOCAL_KEY: randomBytes(32).toString('base64'),
  });
  app = await createApp(config, { logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
  await db?.drop();
});

describe('GET /api/employees', () => {
  it('lists only the employees of the caller\'s sites, by employee number, with site and department', async () => {
    const res = await call('acme', '/api/employees', await as('nurse@acme.test'));
    expect(res.statusCode, res.body).toBe(200);
    const page = res.json();
    expect(page.total).toBe(3);
    expect(page.items.map((e: { empNo: string }) => e.empNo)).toEqual(['E100', 'E101', 'E102']);
    expect(page.items[0]).toEqual({
      id: ids.lin, empNo: 'E100', name: '林志明', sex: '男', birthDate: '1985-05-05',
      site: { id: ids.s1, code: 'TY', name: '桃園廠' }, department: { id: ids.d1, name: '製造一課' }, title: '技術員', shift: '常日班', status: '在職',
    });
    expect(page.items[0]).not.toHaveProperty('nationalIdMasked');
    const doctor = (await call('acme', '/api/employees', await as('doctor@acme.test'))).json();
    expect(doctor.items.map((e: { empNo: string }) => e.empNo)).toEqual(['E100', 'E101', 'E102', 'E200']);
  });

  it('filters by name or number, site, department and status, and pages', async () => {
    const nurse = await as('nurse@acme.test');
    const empNos = async (query: string) => (await call('acme', `/api/employees?${query}`, nurse)).json().items.map((e: { empNo: string }) => e.empNo);
    expect(await empNos('q=志明')).toEqual(['E100']);
    expect(await empNos('q=e10')).toEqual(['E100', 'E101', 'E102']);
    expect(await empNos(`q=${encodeURIComponent('%')}`)).toEqual(['E102']);
    expect(await empNos(`q=${encodeURIComponent('_')}`)).toEqual([]);
    expect(await empNos(`departmentId=${ids.d2}`)).toEqual(['E101', 'E102']);
    expect(await empNos(`status=${encodeURIComponent('在職')}`)).toEqual(['E100', 'E102']);
    expect(await empNos(`siteId=${ids.s1}`)).toEqual(['E100', 'E101', 'E102']);
    const page = (await call('acme', '/api/employees?limit=2&offset=1', nurse)).json();
    expect(page).toMatchObject({ total: 3, items: [{ empNo: 'E101' }, { empNo: 'E102' }] });
    // A department in a site outside the caller's returns nothing rather than leaking it.
    expect(await empNos(`departmentId=${(await owner.select().from(departments).where(eq(departments.name, '研發部')))[0]!.id}`)).toEqual([]);
    expect((await call('acme', '/api/employees?limit=500', nurse)).statusCode).toBe(400);
  });

  it('refuses a site outside the caller\'s sites', async () => {
    const res = await call('acme', `/api/employees?siteId=${ids.s2}`, await as('nurse@acme.test'));
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('outside_sites');
  });

  it('is for 職護、職醫 and 人資 only', async () => {
    expect((await call('acme', '/api/employees', await as('hr@acme.test'))).json().total).toBe(3);
    for (const email of ['safety@acme.test', 'manager@acme.test', 'admin@acme.test']) {
      expect((await call('acme', '/api/employees', await as(email))).statusCode, email).toBe(403);
    }
    expect((await call('acme', '/api/employees')).statusCode).toBe(401);
  });

  it('never shows another tenant\'s employees', async () => {
    const page = (await call('globex', '/api/employees', await as('nurse@globex.test', 'globex'))).json();
    expect(page.items.map((e: { id: string }) => e.id)).toEqual([ids.globexEmp]);
    // An Acme session is not valid on Globex's subdomain.
    expect((await call('globex', '/api/employees', await as('nurse@acme.test'))).statusCode).toBe(401);
  });

  it('audits every employee returned', async () => {
    const before = (await reads(ids.wu)).length;
    await call('acme', `/api/employees?q=${encodeURIComponent('吳建宏')}`, await as('hr@acme.test'));
    const after = await reads(ids.wu);
    expect(after).toHaveLength(before + 1);
    expect(after.at(-1)).toMatchObject({ action: 'read', actorUserId: ids.hr, dataCategory: 'identity', reason: 'employee list' });
  });
});

describe('GET /api/employees/:id', () => {
  it('returns the basic data with the masked national ID, and audits the read', async () => {
    const before = (await reads(ids.lin)).length;
    const res = await call('acme', `/api/employees/${ids.lin}`, await as('hr@acme.test'));
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ id: ids.lin, empNo: 'E100', name: '林志明', site: { code: 'TY' }, department: { name: '製造一課' }, nationalIdMasked: 'A1•••••789' });
    expect(res.json()).not.toHaveProperty('nationalIdHash');
    const after = await reads(ids.lin);
    expect(after).toHaveLength(before + 1);
    expect(after.at(-1)).toMatchObject({ action: 'read', subjectId: ids.lin, actorUserId: ids.hr, dataCategory: 'identity', reason: 'employee detail' });
    expect((await call('acme', `/api/employees/${ids.wu}`, await as('nurse@acme.test'))).json().nationalIdMasked).toBeNull();
  });

  it('refuses employees outside the caller\'s sites unless a break-glass grant is in force', async () => {
    const nurse = await as('nurse@acme.test');
    const outside = await call('acme', `/api/employees/${ids.far}`, nurse);
    expect(outside.statusCode).toBe(403);
    expect(outside.json().code).toBe('outside_sites');
    const [nurseUser] = await owner.select().from(users).where(eq(users.email, 'nurse@acme.test'));
    const [grant] = await owner.insert(breakGlassGrants).values({
      tenantId: ids.acme, userId: nurseUser!.id, siteId: ids.s2, reason: '緊急送醫', expiresAt: new Date(Date.now() + 3600_000),
    }).returning();
    expect((await call('acme', `/api/employees/${ids.far}`, nurse)).statusCode).toBe(200);
    expect((await call('acme', '/api/employees', nurse)).json().total).toBe(4);
    await owner.update(breakGlassGrants).set({ revokedAt: new Date() }).where(eq(breakGlassGrants.id, grant!.id));
    expect((await call('acme', `/api/employees/${ids.far}`, nurse)).statusCode).toBe(403);
  });

  it('is for 職護、職醫 and 人資 only, and never another tenant\'s employee', async () => {
    for (const email of ['safety@acme.test', 'manager@acme.test', 'admin@acme.test']) {
      expect((await call('acme', `/api/employees/${ids.lin}`, await as(email))).statusCode, email).toBe(403);
    }
    expect((await call('acme', `/api/employees/${ids.globexEmp}`, await as('doctor@acme.test'))).statusCode).toBe(404);
    expect((await call('globex', `/api/employees/${ids.lin}`, await as('nurse@globex.test', 'globex'))).statusCode).toBe(404);
    expect((await call('acme', '/api/employees/not-a-uuid', await as('nurse@acme.test'))).statusCode).toBe(400);
  });
});
