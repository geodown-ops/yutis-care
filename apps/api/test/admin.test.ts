/*
 * Tenant administration (/api/admin/*) against a real PostgreSQL: organisation, staff accounts, employee import.
 * Each area checks: other tenants cannot reach it, other roles are refused, writes are audited, imports validate first.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { auditLog, departments, employees, legalEntities, notifications, plans, sessions, sites, tenants, tenantSubscriptions, usageCounters, users, type Db } from '@yutis/db';
import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { XLSX_MIME } from '../src/admin/excel.js';
import { loadConfig } from '../src/config.js';
import { RESEND_ENDPOINT } from '../src/core/mail.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

let db: TestDatabase;
let owner: Db;
let app: NestFastifyApplication;
const ids = { acme: '', globex: '', s1: '', admin: '' };

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
function call(slug: string, method: Method, url: string, opts: { cookie?: string; body?: unknown; xlsx?: Buffer } = {}) {
  return app.inject({
    method, url,
    headers: { host: `${slug}.care.test`, ...(opts.cookie ? { cookie: opts.cookie } : {}), ...(opts.xlsx ? { 'content-type': XLSX_MIME } : {}) },
    ...(opts.xlsx ? { payload: opts.xlsx } : opts.body === undefined ? {} : { payload: opts.body as object }),
  });
}

async function signIn(slug: string, email: string): Promise<string> {
  const res = await call(slug, 'POST', '/api/auth/sign-in', { body: { token: email, as: 'staff' } });
  expect(res.statusCode, `${email}: ${res.body}`).toBe(204);
  return `yutis_session=${res.cookies.find(c => c.name === 'yutis_session')!.value}`;
}

async function xlsx(sheets: Record<string, (string | number | Date | null)[][]>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = workbook.addWorksheet(name);
    for (const row of rows) sheet.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Requests to Resend (EMAIL_PROVIDER=resend here, with fetch stubbed); `resendAnswer` is what it answers. */
const resendCalls: { url: string; init: RequestInit }[] = [];
let resendAnswer = () => new Response(JSON.stringify({ id: 'email-1' }), { status: 200 });

const audits = (subjectTable: string) => owner.select().from(auditLog).where(and(eq(auditLog.tenantId, ids.acme), eq(auditLog.subjectTable, subjectTable)));

beforeAll(async () => {
  db = await createTestDatabase();
  owner = db.owner;
  const [acme, globex] = await owner.insert(tenants).values([{ slug: 'acme', name: 'Acme' }, { slug: 'globex', name: 'Globex' }]).returning();
  ids.acme = acme!.id; ids.globex = globex!.id;
  const [le] = await owner.insert(legalEntities).values({ tenantId: ids.acme, code: 'L1', name: 'Acme 股份有限公司' }).returning();
  const [s1] = await owner.insert(sites).values({ tenantId: ids.acme, legalEntityId: le!.id, code: 'S1', name: '桃園廠' }).returning();
  ids.s1 = s1!.id;
  await owner.insert(departments).values({ tenantId: ids.acme, siteId: s1!.id, name: '製造一課' });
  const [admin] = await owner.insert(users).values([
    { tenantId: ids.acme, email: 'admin@acme.test', name: '陳管理員', role: '租戶管理員' },
    { tenantId: ids.acme, email: 'nurse@acme.test', name: '王護理師', role: '職護' },
    { tenantId: ids.globex, email: 'admin@globex.test', name: 'Globex 管理員', role: '租戶管理員' },
  ]).returning();
  ids.admin = admin!.id;
  const [plan] = await owner.insert(plans).values({ code: 'standard', name: '標準方案' }).returning();
  await owner.insert(tenantSubscriptions).values({ tenantId: ids.acme, planId: plan!.id, status: 'active', seatLimit: 2, startsOn: '2026-01-01' });

  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { resendCalls.push({ url, init }); return resendAnswer(); });
  const config = loadConfig({
    NODE_ENV: 'test', APP_DATABASE_URL: db.appUrl, TENANT_BASE_DOMAIN: 'care.test', COOKIE_SECURE: 'false', AUTH_DEV_SIGN_IN: 'true', TENANT_CRYPTO_LOCAL_KEY: randomBytes(32).toString('base64'),
    EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test', EMAIL_FROM: 'Yutis Care <noreply@care.test>',
  });
  app = await createApp(config, { logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await app?.close();
  await db?.drop();
});

describe('access to /api/admin', () => {
  it('is for tenant admins only', async () => {
    const nurse = await signIn('acme', 'nurse@acme.test');
    for (const [method, url] of [['GET', '/api/admin/org'], ['GET', '/api/admin/users'], ['POST', '/api/admin/users']] as const) {
      expect((await call('acme', method, url, { cookie: nurse, body: method === 'POST' ? {} : undefined })).statusCode).toBe(403);
    }
    expect((await call('acme', 'POST', '/api/admin/employees/import', { cookie: nurse, xlsx: await xlsx({ 員工: [['工號']] }) })).statusCode).toBe(403);
  });

  it("is not reachable with another tenant's session, and shows only this tenant", async () => {
    const acmeAdmin = await signIn('acme', 'admin@acme.test');
    expect((await call('globex', 'GET', '/api/admin/org', { cookie: acmeAdmin })).statusCode).toBe(401);
    const globexAdmin = await signIn('globex', 'admin@globex.test');
    expect((await call('globex', 'GET', '/api/admin/org', { cookie: globexAdmin })).json()).toEqual([]);
    expect((await call('globex', 'GET', '/api/admin/users', { cookie: globexAdmin })).json().map((u: { email: string }) => u.email)).toEqual(['admin@globex.test']);
  });
});

describe('organisation', () => {
  it('creates, edits and deletes units, refuses duplicates and deleting units in use, and audits', async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    const le = (await call('acme', 'POST', '/api/admin/org/legal-entities', { cookie, body: { code: 'L2', name: '子公司' } })).json();
    expect(le.id).toBeDefined();
    expect((await call('acme', 'POST', '/api/admin/org/legal-entities', { cookie, body: { code: 'L2', name: '重複' } })).json()).toMatchObject({ code: 'duplicate' });
    const site = (await call('acme', 'POST', '/api/admin/org/sites', { cookie, body: { legalEntityId: le.id, code: 'S9', name: '台中廠' } })).json();
    const dept = (await call('acme', 'POST', '/api/admin/org/departments', { cookie, body: { siteId: site.id, name: '品保課', managerEmail: 'qa@acme.test' } })).json();
    expect((await call('acme', 'PATCH', `/api/admin/org/sites/${site.id}`, { cookie, body: { name: '台中二廠' } })).statusCode).toBe(200);
    expect((await call('acme', 'DELETE', `/api/admin/org/legal-entities/${le.id}`, { cookie })).json()).toMatchObject({ code: 'in_use' });
    expect((await call('acme', 'DELETE', `/api/admin/org/departments/${dept.id}`, { cookie })).statusCode).toBe(204);
    const tree = (await call('acme', 'GET', '/api/admin/org', { cookie })).json();
    expect(tree.find((l: { code: string }) => l.code === 'L2').sites).toMatchObject([{ code: 'S9', name: '台中二廠', departments: [] }]);
    expect((await audits('sites')).map(a => a.action)).toEqual(['create', 'update']);
    expect((await audits('departments')).map(a => a.action)).toEqual(['create', 'delete']);
  });

  it('previews an Excel import, refuses a file with errors, and imports a valid one', async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    const bad = await xlsx({
      法人: [['代碼', '名稱'], ['L3', '新法人'], ['L3', '重複']],
      廠區: [['代碼', '名稱', '法人代碼', '地址'], ['S3', '新竹廠', 'NOPE', '']],
      部門: [['廠區代碼', '名稱', '代碼', '主管姓名', '主管Email'], ['S1', '', '', '', 'not-an-email']],
    });
    const preview = await call('acme', 'POST', '/api/admin/org/import', { cookie, xlsx: bad });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ committed: false });
    expect(preview.json().issues).toEqual(expect.arrayContaining([
      { sheet: '法人', row: 3, column: '代碼', message: '代碼重複' },
      { sheet: '廠區', row: 2, column: '法人代碼', message: '找不到法人 NOPE' },
      { sheet: '部門', row: 2, column: '名稱', message: '必填' },
      { sheet: '部門', row: 2, column: '主管Email', message: 'Email 格式錯誤' },
    ]));
    const refused = await call('acme', 'POST', '/api/admin/org/import?commit=true', { cookie, xlsx: bad });
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({ code: 'import_invalid', report: { committed: false } });
    expect(await owner.select().from(legalEntities).where(eq(legalEntities.code, 'L3'))).toHaveLength(0);

    const good = await xlsx({
      法人: [['代碼', '名稱'], ['L1', 'Acme 股份有限公司'], ['L3', '新法人']],
      廠區: [['代碼', '名稱', '法人代碼', '地址'], ['S3', '新竹廠', 'L3', '新竹市']],
      部門: [['廠區代碼', '名稱', '主管姓名'], ['S3', '研發部', '周經理'], ['S1', '製造一課', '']],
    });
    const done = (await call('acme', 'POST', '/api/admin/org/import?commit=true', { cookie, xlsx: good })).json();
    expect(done).toMatchObject({
      committed: true, issues: [], legalEntities: { create: 1, update: 0, unchanged: 1 }, sites: { create: 1 }, departments: { create: 1, unchanged: 1 },
    });
    const again = (await call('acme', 'POST', '/api/admin/org/import', { cookie, xlsx: good })).json();
    expect(again).toMatchObject({ legalEntities: { create: 0, update: 0 }, sites: { create: 0, update: 0 }, departments: { create: 0, update: 0 } });
    expect((await audits('legal_entities')).filter(a => a.reason === 'organisation import')).toHaveLength(1);
  });

  it('rejects a body that is not an .xlsx file', async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    expect((await call('acme', 'POST', '/api/admin/org/import', { cookie, body: { not: 'excel' } })).json()).toMatchObject({ code: 'invalid_file' });
    expect((await call('acme', 'POST', '/api/admin/org/import', { cookie, xlsx: Buffer.from('not a zip') })).json()).toMatchObject({ code: 'invalid_file' });
  });
});

describe('staff accounts', () => {
  it('invites staff with sites; only invited people can sign in', async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    expect((await call('acme', 'POST', '/api/auth/sign-in', { body: { token: 'doctor@acme.test', as: 'staff' } })).statusCode).toBe(401);
    const res = await call('acme', 'POST', '/api/admin/users', { cookie, body: { email: 'Doctor@Acme.test', name: '張醫師', role: '職醫', siteIds: [ids.s1] } });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toMatchObject({ email: 'doctor@acme.test', role: '職醫', active: true, signedInBefore: false, siteIds: [ids.s1], emailed: true });
    expect((await call('acme', 'POST', '/api/admin/users', { cookie, body: { email: 'doctor@acme.test', name: 'x', role: '職醫' } })).json()).toMatchObject({ code: 'account_exists' });
    expect((await call('acme', 'POST', '/api/admin/users', { cookie, body: { email: 'x@acme.test', name: 'x', role: '職護', siteIds: ['00000000-0000-4000-8000-000000000000'] } })).json()).toMatchObject({ code: 'unknown_site' });
    const doctor = await signIn('acme', 'doctor@acme.test');
    expect((await call('acme', 'GET', '/api/me', { cookie: doctor })).json()).toMatchObject({ role: '職醫', sites: [{ id: ids.s1 }] });
    expect((await audits('users')).map(a => a.action)).toContain('create');
  });

  it('emails the invitation through Resend once the account is saved, and records whether it went out', async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    const [mail] = resendCalls.splice(0);
    const [row] = await owner.select().from(notifications).where(eq(notifications.recipientEmail, 'doctor@acme.test'));
    expect(row).toMatchObject({ template: 'staff_invitation', status: 'sent', sentAt: expect.any(Date), error: null });
    expect(mail!.url).toBe(RESEND_ENDPOINT);
    expect(mail!.init.headers).toMatchObject({ authorization: 'Bearer re_test', 'idempotency-key': row!.id });
    const body = JSON.parse(String(mail!.init.body));
    expect(body).toMatchObject({ from: 'Yutis Care <noreply@care.test>', to: ['doctor@acme.test'], subject: 'Acme 邀請您使用 Yutis Care 員工健康管理系統' });
    expect(body.text).toContain('張醫師 您好');
    expect(body.text).toContain('http://acme.care.test/');

    // A refused email does not undo the account; the notification keeps the provider's answer.
    resendAnswer = () => new Response('{"message":"The from address is not verified"}', { status: 403 });
    const res = await call('acme', 'POST', '/api/admin/users', { cookie, body: { email: 'hr@acme.test', name: '李人資', role: '人資' } });
    resendAnswer = () => new Response(JSON.stringify({ id: 'email-2' }), { status: 200 });
    expect(res.statusCode).toBe(201);
    const [failed] = await owner.select().from(notifications).where(eq(notifications.recipientEmail, 'hr@acme.test'));
    expect(failed).toMatchObject({ status: 'failed', error: expect.stringContaining('Resend answered 403: {"message":"The from address is not verified"}') });

    // Nothing goes out for a request that fails.
    resendCalls.splice(0);
    expect((await call('acme', 'POST', '/api/admin/users', { cookie, body: { email: 'y@acme.test', name: 'y', role: '職護', siteIds: ['00000000-0000-4000-8000-000000000000'] } })).statusCode).toBe(400);
    expect(resendCalls).toEqual([]);
  });

  it('changes role and sites, and deactivating signs the person out', async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    const [doctor] = await owner.select().from(users).where(eq(users.email, 'doctor@acme.test'));
    const doctorSession = await signIn('acme', 'doctor@acme.test');
    const changed = (await call('acme', 'PATCH', `/api/admin/users/${doctor!.id}`, { cookie, body: { role: '職護', siteIds: [] } })).json();
    expect(changed).toMatchObject({ role: '職護', siteIds: [] });
    expect((await call('acme', 'PATCH', `/api/admin/users/${doctor!.id}`, { cookie, body: { active: false } })).json()).toMatchObject({ active: false });
    expect(await owner.select().from(sessions).where(and(eq(sessions.userId, doctor!.id), isNull(sessions.revokedAt)))).toHaveLength(0);
    expect((await call('acme', 'GET', '/api/me', { cookie: doctorSession })).statusCode).toBe(401);
    expect((await call('acme', 'POST', '/api/auth/sign-in', { body: { token: 'doctor@acme.test', as: 'staff' } })).statusCode).toBe(401);
  });

  it('keeps the tenant from losing its last admin, and admins from locking themselves out', async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    expect((await call('acme', 'PATCH', `/api/admin/users/${ids.admin}`, { cookie, body: { active: false } })).json()).toMatchObject({ code: 'cannot_change_self' });
    const second = (await call('acme', 'POST', '/api/admin/users', { cookie, body: { email: 'admin2@acme.test', name: '副管理員', role: '租戶管理員' } })).json();
    const other = await signIn('acme', 'admin2@acme.test');
    expect((await call('acme', 'PATCH', `/api/admin/users/${ids.admin}`, { cookie: other, body: { role: '人資' } })).statusCode).toBe(200);
    expect((await call('acme', 'PATCH', `/api/admin/users/${second.id}`, { cookie: other, body: { active: false } })).json()).toMatchObject({ code: 'cannot_change_self' });
    await owner.update(users).set({ role: '租戶管理員' }).where(eq(users.id, ids.admin));
    expect((await call('acme', 'PATCH', `/api/admin/users/${second.id}`, { cookie, body: { active: false } })).statusCode).toBe(200);
  });
});

describe('employee import', () => {
  const header = ['工號', '姓名', '性別', '出生日期', '法人代碼', '廠區代碼', '部門', '職稱', '特殊作業', '語言', 'Email', '手機', '狀態'];
  const row = (empNo: string, extra: Partial<Record<string, string | Date>> = {}) => {
    const v: Record<string, string | Date> = {
      工號: empNo, 姓名: `員工${empNo}`, 性別: '女', 出生日期: new Date(Date.UTC(1990, 0, 15)), 法人代碼: 'L1', 廠區代碼: 'S1', 部門: '製造一課',
      職稱: '作業員', 特殊作業: '噪音、游離輻射', 語言: 'zh', Email: '', 手機: '', 狀態: '在職', ...extra,
    };
    return header.map(h => v[h] ?? '');
  };

  it('lists every bad row and writes nothing until the file is clean', async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    const bad = await xlsx({ 員工: [
      header,
      row('E001'),
      row('E002', { 出生日期: '1990/13/40', 性別: 'M' }),
      row('E001'),
      row('E003', { 部門: '不存在的課', Email: 'bad' }),
      row('E004', { 廠區代碼: 'S3' }),
    ] });
    const preview = (await call('acme', 'POST', '/api/admin/employees/import', { cookie, xlsx: bad })).json();
    expect(preview).toMatchObject({ committed: false, rows: 5 });
    expect(preview.issues).toEqual(expect.arrayContaining([
      { row: 3, column: '性別', message: '應為「男」或「女」' },
      { row: 3, column: '出生日期', message: '日期格式應為 YYYY-MM-DD' },
      { row: 4, column: '工號', message: '工號在檔案中重複' },
      { row: 5, column: '部門', message: '廠區 S1 沒有部門「不存在的課」' },
      { row: 5, column: 'Email', message: 'Email 格式錯誤' },
      { row: 6, column: '廠區代碼', message: '廠區 S3 不屬於法人 L1' },
    ]));
    expect((await call('acme', 'POST', '/api/admin/employees/import?commit=true', { cookie, xlsx: bad })).statusCode).toBe(422);
    expect(await owner.select().from(employees)).toHaveLength(0);
    const noHeader = (await call('acme', 'POST', '/api/admin/employees/import', { cookie, xlsx: await xlsx({ 員工: [['工號', '姓名']] }) })).json();
    expect(noHeader.issues[0].message).toMatch(/缺少欄位：性別/);
  });

  it('creates and updates by 工號, warns over the seat limit without blocking, counts usage and audits each employee', async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    const first = await xlsx({ 員工: [header, row('E001'), row('E002', { 性別: '男', Email: 'E002@Acme.test' }), row('E003', { 狀態: '離職' })] });
    const preview = (await call('acme', 'POST', '/api/admin/employees/import', { cookie, xlsx: first })).json();
    expect(preview).toMatchObject({ committed: false, create: 3, issues: [], seats: { activeEmployees: 2, seatLimit: 2, overLimit: false } });
    const done = (await call('acme', 'POST', '/api/admin/employees/import?commit=true', { cookie, xlsx: first })).json();
    expect(done).toMatchObject({ committed: true, create: 3, update: 0 });
    const [e2] = await owner.select().from(employees).where(eq(employees.empNo, 'E002'));
    expect(e2).toMatchObject({ sex: '男', birthDate: '1990-01-15', email: 'e002@acme.test', specialOperations: ['噪音', '游離輻射'], status: '在職' });

    const second = await xlsx({ 員工: [header, row('E001'), row('E002', { 性別: '男', Email: 'E002@Acme.test', 職稱: '組長' }), row('E003'), row('E004')] });
    const result = (await call('acme', 'POST', '/api/admin/employees/import?commit=true', { cookie, xlsx: second })).json();
    expect(result).toMatchObject({ committed: true, create: 1, update: 2, unchanged: 1, seats: { activeEmployees: 4, seatLimit: 2, overLimit: true } });
    const [usage] = await owner.select().from(usageCounters).where(and(eq(usageCounters.tenantId, ids.acme), eq(usageCounters.metric, 'active_employees')));
    expect(usage!.quantity).toBe(4);
    const employeeAudits = await audits('employees');
    expect(employeeAudits).toHaveLength(6);
    expect(employeeAudits.every(a => a.employeeId === a.subjectId && a.dataCategory === 'identity' && a.actorUserId === ids.admin)).toBe(true);
  });

  it('stores national ID numbers only as a per-tenant fingerprint and a masked form, and refuses bad or duplicate ones', async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    const withIds = (rows: [string, string][]) => xlsx({ 員工: [[...header, '身分證字號'], ...rows.map(([empNo, id]) => [...row(empNo), id])] });
    const bad = (await call('acme', 'POST', '/api/admin/employees/import', { cookie, xlsx: await withIds([['E101', 'Z12345'], ['E102', 'A123456789'], ['E103', 'a123456789']]) })).json();
    expect(bad.issues).toEqual([
      { row: 2, column: '身分證字號', message: '格式錯誤' },
      { row: 4, column: '身分證字號', message: '與工號 E102 重複' },
    ]);
    const done = (await call('acme', 'POST', '/api/admin/employees/import?commit=true', { cookie, xlsx: await withIds([['E101', 'B223456789']]) })).json();
    expect(done).toMatchObject({ committed: true, create: 1 });
    const [e] = await owner.select().from(employees).where(eq(employees.empNo, 'E101'));
    expect(e!.nationalIdHash).toMatch(/^[0-9a-f]{64}$/);
    expect(e!.nationalIdMasked).toBe('B2•••••789');
    expect(JSON.stringify(e)).not.toContain('223456789');
    // Employees imported before the masked form existed get it on their next import.
    await owner.update(employees).set({ nationalIdMasked: null }).where(eq(employees.id, e!.id));
    expect((await call('acme', 'POST', '/api/admin/employees/import?commit=true', { cookie, xlsx: await withIds([['E101', 'B223456789']]) })).json()).toMatchObject({ update: 1 });
    expect((await owner.select().from(employees).where(eq(employees.id, e!.id)))[0]!.nationalIdMasked).toBe('B2•••••789');
    const taken = (await call('acme', 'POST', '/api/admin/employees/import', { cookie, xlsx: await withIds([['E104', 'B223456789']]) })).json();
    expect(taken.issues).toEqual([{ row: 2, column: '身分證字號', message: '已屬於工號 E101' }]);
  });

  it("keeps the employee's own portal language when 語言 is left blank", async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    const e101 = and(eq(employees.tenantId, ids.acme), eq(employees.empNo, 'E101'));
    await owner.update(employees).set({ lang: 'vi' }).where(e101);
    const blank = (await call('acme', 'POST', '/api/admin/employees/import?commit=true', { cookie, xlsx: await xlsx({ 員工: [header, row('E101', { 語言: '' })] }) })).json();
    expect(blank).toMatchObject({ committed: true, update: 0, unchanged: 1 });
    expect((await owner.select().from(employees).where(e101))[0]!.lang).toBe('vi');
    const set = (await call('acme', 'POST', '/api/admin/employees/import?commit=true', { cookie, xlsx: await xlsx({ 員工: [header, row('E101', { 語言: 'en' })] }) })).json();
    expect(set).toMatchObject({ committed: true, update: 1 });
    expect((await owner.select().from(employees).where(e101))[0]!.lang).toBe('en');
  });
});

describe('phrases and audit search', () => {
  it('lets tenant admins list the phrases they maintain', async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    const created = (await call('acme', 'POST', '/api/admin/phrases', { cookie, body: { category: '處理狀況', text: '已轉介職醫。' } })).json();
    expect((await call('acme', 'GET', '/api/admin/phrases', { cookie })).json()).toEqual([{ id: created.id, category: '處理狀況', text: '已轉介職醫。', kind: null }]);
    expect((await call('acme', 'GET', '/api/admin/phrases?category=其他', { cookie })).json()).toEqual([]);
    expect((await call('acme', 'GET', '/api/admin/phrases', { cookie: await signIn('acme', 'nurse@acme.test') })).statusCode).toBe(403);
  });

  it('finds who did what to whose data, newest first, and records each search', async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    const [e] = await owner.select().from(employees).where(and(eq(employees.tenantId, ids.acme), eq(employees.empNo, 'E101')));
    const res = await call('acme', 'GET', `/api/admin/audit?employeeId=${e!.id}`, { cookie });
    expect(res.statusCode, res.body).toBe(200);
    const page = res.json();
    expect(page.total).toBe(page.items.length);
    expect(page.items.map((i: { action: string }) => i.action)).toEqual(['update', 'update', 'create']);
    expect(page.items[2]).toMatchObject({
      actor: { kind: 'staff', id: ids.admin, name: '陳管理員', role: '租戶管理員' }, action: 'create', subjectTable: 'employees', subjectId: e!.id,
      employee: { id: e!.id, empNo: 'E101', name: '員工E101' }, dataCategory: 'identity', reason: 'employee import',
    });
    expect(Date.parse(page.items[0].at)).toBeGreaterThanOrEqual(Date.parse(page.items[2].at));

    const searches = (await audits('audit_log')).filter(a => a.employeeId === e!.id);
    expect(searches).toMatchObject([{ action: 'read', actorUserId: ids.admin, reason: `audit search employeeId=${e!.id}` }]);

    const paged = (await call('acme', 'GET', '/api/admin/audit?action=create&limit=2&offset=1', { cookie })).json();
    expect(paged.items).toHaveLength(2);
    expect(paged.items.every((i: { action: string }) => i.action === 'create')).toBe(true);
    expect((await call('acme', 'GET', '/api/admin/audit?from=2000-01-01&to=2000-01-31', { cookie })).json()).toEqual({ total: 0, items: [] });
    expect((await call('acme', 'GET', '/api/admin/audit?from=2026-02-01&to=2026-01-01', { cookie })).statusCode).toBe(400);
  });

  it("keeps the audit log to this tenant's admins", async () => {
    const [e] = await owner.select().from(employees).where(and(eq(employees.tenantId, ids.acme), eq(employees.empNo, 'E101')));
    expect((await call('acme', 'GET', '/api/admin/audit', { cookie: await signIn('acme', 'nurse@acme.test') })).statusCode).toBe(403);
    const globex = (await call('globex', 'GET', `/api/admin/audit?employeeId=${e!.id}`, { cookie: await signIn('globex', 'admin@globex.test') })).json();
    expect(globex).toEqual({ total: 0, items: [] });
  });
  it('lets tenant admins find an employee by name or number, with nothing but the id, number and name', async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    expect((await call('acme', 'GET', '/api/admin/employees?q=員工E101', { cookie })).json()).toEqual([{ id: expect.any(String), empNo: 'E101', name: '員工E101' }]);
    const byNumber = (await call('acme', 'GET', '/api/admin/employees?q=e10', { cookie })).json();
    expect(byNumber.length).toBeGreaterThan(0);
    expect(byNumber.every((e: { empNo: string }) => e.empNo.startsWith('E10'))).toBe(true);
    expect(Object.keys(byNumber[0]).sort()).toEqual(['empNo', 'id', 'name']);
    expect((await call('acme', 'GET', `/api/admin/employees?q=${encodeURIComponent('%')}`, { cookie })).json()).toEqual([]);
    expect((await call('acme', 'GET', '/api/admin/employees?limit=1', { cookie })).json()).toHaveLength(1);
    expect((await audits('employees')).filter(a => a.reason === 'admin employee search').length).toBeGreaterThan(0);
    expect((await call('acme', 'GET', '/api/admin/employees', { cookie: await signIn('acme', 'nurse@acme.test') })).statusCode).toBe(403);
    expect((await call('globex', 'GET', '/api/admin/employees?q=E101', { cookie: await signIn('globex', 'admin@globex.test') })).json()).toEqual([]);
  });
});

describe('import templates', () => {
  const headers = async (file: Buffer) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file as unknown as ArrayBuffer);
    return Object.fromEntries(workbook.worksheets.map(w => [w.name, (w.getRow(1).values as unknown[]).slice(1)]));
  };

  it('gives tenant admins empty organisation and employee files with the columns the imports read', async () => {
    const cookie = await signIn('acme', 'admin@acme.test');
    const org = await call('acme', 'GET', '/api/admin/org/import-template', { cookie });
    expect(org.headers['content-type']).toBe(XLSX_MIME);
    expect(org.headers['content-disposition']).toContain(encodeURIComponent('組織架構匯入範本.xlsx'));
    expect(await headers(org.rawPayload)).toEqual({
      法人: ['代碼', '名稱'], 廠區: ['代碼', '名稱', '法人代碼', '地址'], 部門: ['廠區代碼', '名稱', '代碼', '主管姓名', '主管Email', '主管電話'],
    });
    const people = await call('acme', 'GET', '/api/admin/employees/import-template', { cookie });
    expect((await headers(people.rawPayload)).員工).toEqual([
      '工號', '姓名', '性別', '出生日期', '法人代碼', '廠區代碼', '部門', '身分證字號', '職稱', '班別', '健檢類別', '特殊作業', '語言', '到職日', 'Email', '手機', '狀態',
    ]);
    // The empty template is a valid (empty) import.
    expect((await call('acme', 'POST', '/api/admin/org/import', { cookie, xlsx: org.rawPayload })).json()).toMatchObject({ issues: [] });
    expect((await call('acme', 'GET', '/api/admin/org/import-template', { cookie: await signIn('acme', 'nurse@acme.test') })).statusCode).toBe(403);
  });
});

describe('staff and organisation directory', () => {
  it('lets any staff list active staff by role, with their work email, and the organisation names', async () => {
    const nurse = await signIn('acme', 'nurse@acme.test');
    const staff = (await call('acme', 'GET', '/api/staff?roles=職護,職醫', { cookie: nurse })).json();
    expect(staff).toEqual(expect.arrayContaining([{ id: expect.any(String), name: '王護理師', email: 'nurse@acme.test', role: '職護' }]));
    expect(staff.every((u: { role: string }) => ['職護', '職醫'].includes(u.role))).toBe(true);
    expect((await call('acme', 'GET', '/api/staff', { cookie: nurse })).json().map((u: { name: string }) => u.name)).toContain('陳管理員');
    expect((await call('acme', 'GET', '/api/staff?roles=老闆', { cookie: nurse })).statusCode).toBe(400);
    const org = (await call('acme', 'GET', '/api/org', { cookie: nurse })).json();
    const site = org.find((e: { code: string }) => e.code === 'L1').sites.find((x: { code: string }) => x.code === 'S1');
    expect(site).toMatchObject({ id: ids.s1, name: '桃園廠', mine: false, departments: expect.arrayContaining([{ id: expect.any(String), code: null, name: '製造一課' }]) });
    expect(JSON.stringify(org)).not.toContain('manager');
    expect((await call('acme', 'GET', '/api/staff', {})).statusCode).toBe(401);
    expect((await call('globex', 'GET', '/api/org', { cookie: await signIn('globex', 'admin@globex.test') })).json()).toEqual([]);
  });
});
