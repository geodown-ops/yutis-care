/*
 * Health checks, assistance records and cases against a real PostgreSQL. Exam grading is checked against the
 * prototype itself: the prototype's seeded reports are imported through an Excel file and must grade exactly as the
 * prototype's logic.js grades them.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  assistRecords, auditLog, caseEvents, defaultTemplates, departments, employees, eventStatusHistory, healthExams, legalEntities, sites, tenants, users, type Db,
} from '@yutis/db';
import { EXAM_ITEMS, RULES_V1 } from '@yutis/domain';
import ExcelJS from 'exceljs';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { XLSX_MIME } from '../src/admin/excel.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LocalTenantCrypto } from '../src/core/crypto.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

/* ---------- the prototype's seeded reports, graded by the prototype ---------- */
const dir = fileURLToPath(new URL('../../../prototype/', import.meta.url));
const ctx = vm.createContext({ console });
vm.runInContext(`${['data.js', 'logic.js'].map(f => readFileSync(dir + f, 'utf8')).join('\n;\n')}
;var S = seedState();
globalThis.out = { employees: S.employees, reports: S.reports.map(r => ({ r, g: gradeReport(r) })) };`, ctx);
const proto = JSON.parse(JSON.stringify((ctx as { out: unknown }).out)) as {
  employees: { id: string; sex: '男' | '女' }[];
  reports: { r: { id: string; empId: string; date: string; values: Record<string, number | string | null> }; g: { total: number; max: number; items: { code: string; lv: number | null }[] } }[];
};
// One report per prototype employee (the latest), so each becomes one exam of one employee.
const latestReports = Object.values(Object.fromEntries(
  [...proto.reports].sort((a, b) => a.r.date.localeCompare(b.r.date)).map(x => [x.r.empId, x]),
));

let db: TestDatabase;
let owner: Db;
let app: NestFastifyApplication;
const masterKey = randomBytes(32);
const crypto = new LocalTenantCrypto(masterKey);
const ids = { acme: '', globex: '', s1: '', s2: '', d1: '', d2: '', le: '', far: '', byId: '', mapping: '', idMapping: '' };

const ITEM_HEADERS = Object.fromEntries(EXAM_ITEMS.map(i => [i.code, i.name]));
const COLUMNS = ['員工編號', '檢查日期', '健檢類別', '吸菸', '病史', '自覺症狀', '特殊作業', '管理分級', ...EXAM_ITEMS.map(i => i.name)];

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
function call(slug: string, method: Method, url: string, opts: { cookie?: string; body?: unknown; xlsx?: Buffer } = {}) {
  return app.inject({
    method, url,
    headers: { host: `${slug}.care.test`, ...(opts.cookie ? { cookie: opts.cookie } : {}), ...(opts.xlsx ? { 'content-type': XLSX_MIME } : {}) },
    ...(opts.xlsx ? { payload: opts.xlsx } : opts.body === undefined ? {} : { payload: opts.body as object }),
  });
}
const cookies = new Map<string, string>();
async function as(email: string, slug = 'acme'): Promise<string> {
  const key = `${slug}/${email}`;
  if (cookies.has(key)) return cookies.get(key)!;
  const res = await call(slug, 'POST', '/api/auth/sign-in', { body: { token: email, as: 'staff' } });
  expect(res.statusCode, `${email}: ${res.body}`).toBe(204);
  const cookie = `yutis_session=${res.cookies.find(c => c.name === 'yutis_session')!.value}`;
  cookies.set(key, cookie);
  return cookie;
}
async function xlsx(header: string[], rows: Record<string, string | number | Date | null | undefined>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('健檢');
  sheet.addRow(header);
  for (const r of rows) sheet.addRow(header.map(h => r[h] ?? null));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
const examRow = (empNo: string, date: string, values: Record<string, number | string | null>, extra: Record<string, string | number> = {}) => ({
  員工編號: empNo, 檢查日期: date, 健檢類別: '年度健檢',
  ...Object.fromEntries(EXAM_ITEMS.map(i => [i.name, values[i.key] ?? null])), ...extra,
});
const empIdOf = async (empNo: string) => (await owner.select({ id: employees.id }).from(employees).where(eq(employees.empNo, empNo)))[0]!.id;
const auditFor = (employeeId: string) => owner.select().from(auditLog).where(eq(auditLog.employeeId, employeeId));

beforeAll(async () => {
  db = await createTestDatabase();
  owner = db.owner;
  const [acme, globex] = await owner.insert(tenants).values([{ slug: 'acme', name: 'Acme' }, { slug: 'globex', name: 'Globex' }]).returning();
  ids.acme = acme!.id; ids.globex = globex!.id;
  await owner.insert(defaultTemplates).values([
    { kind: 'grading_rules', version: 1, active: true, content: RULES_V1 },
    { kind: 'phrases', version: 1, active: true, content: [{ cat: '處理狀況', text: '已提供衛教單張，約定兩週後電話關懷追蹤。' }, { cat: '不法侵害－措施', kind: '建議', text: '配置保全人員。' }] },
    { kind: 'sign_off_roles', version: 1, active: true, content: ['勞工健康服務醫師'] },
    { kind: 'survey_versions', version: 1, active: true, content: { nmq: 'nmq-v1' } },
  ]);
  await owner.execute(sql`select apply_default_templates(${ids.acme})`);
  await owner.execute(sql`select apply_default_templates(${ids.globex})`);

  const [le] = await owner.insert(legalEntities).values({ tenantId: ids.acme, code: 'L1', name: 'Acme' }).returning();
  ids.le = le!.id;
  const [s1, s2] = await owner.insert(sites).values([
    { tenantId: ids.acme, legalEntityId: le!.id, code: 'S1', name: '桃園廠' },
    { tenantId: ids.acme, legalEntityId: le!.id, code: 'S2', name: '新竹廠' },
  ]).returning();
  ids.s1 = s1!.id; ids.s2 = s2!.id;
  const [d1, d2] = await owner.insert(departments).values([
    { tenantId: ids.acme, siteId: s1!.id, name: '製造一課' }, { tenantId: ids.acme, siteId: s2!.id, name: '研發部' },
  ]).returning();
  ids.d1 = d1!.id; ids.d2 = d2!.id;
  const emp = (empNo: string, sex: '男' | '女', siteId: string, departmentId: string, nationalIdHash: string | null = null) => ({
    tenantId: ids.acme, empNo, name: `員工${empNo}`, sex, birthDate: '1985-05-05', legalEntityId: ids.le, siteId, departmentId, nationalIdHash,
  });
  await owner.insert(employees).values([
    ...latestReports.map(x => emp(x.r.empId, proto.employees.find(e => e.id === x.r.empId)!.sex, ids.s1, ids.d1)),
    emp('FAR01', '男', ids.s2, ids.d2),
    emp('ID001', '女', ids.s1, ids.d1, await crypto.fingerprint(ids.acme, 'A223456789')),
  ]);
  ids.far = await empIdOf('FAR01');
  ids.byId = await empIdOf('ID001');

  const [nurse, doctor, , , nurse2] = await owner.insert(users).values([
    { tenantId: ids.acme, email: 'nurse@acme.test', name: '王護理師', role: '職護' },
    { tenantId: ids.acme, email: 'doctor@acme.test', name: '張醫師', role: '職醫' },
    { tenantId: ids.acme, email: 'hr@acme.test', name: '李人資', role: '人資' },
    { tenantId: ids.acme, email: 'admin@acme.test', name: '陳管理員', role: '租戶管理員' },
    { tenantId: ids.acme, email: 'nurse2@acme.test', name: '新竹護理師', role: '職護' },
    { tenantId: ids.globex, email: 'nurse@globex.test', name: 'Globex 護理師', role: '職護' },
  ]).returning();
  const hr = (await owner.select().from(users).where(eq(users.email, 'hr@acme.test')))[0]!;
  await owner.execute(sql`insert into user_site_scopes (tenant_id, user_id, site_id) values
    (${ids.acme}, ${nurse!.id}, ${ids.s1}), (${ids.acme}, ${doctor!.id}, ${ids.s1}), (${ids.acme}, ${doctor!.id}, ${ids.s2}),
    (${ids.acme}, ${hr.id}, ${ids.s1}), (${ids.acme}, ${nurse2!.id}, ${ids.s2})`);

  const config = loadConfig({
    NODE_ENV: 'test', APP_DATABASE_URL: db.appUrl, TENANT_BASE_DOMAIN: 'care.test', COOKIE_SECURE: 'false', AUTH_DEV_SIGN_IN: 'true',
    TENANT_CRYPTO_LOCAL_KEY: masterKey.toString('base64'),
  });
  app = await createApp(config, { logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
  await db?.drop();
});

describe('exam import mappings (tenant admin)', () => {
  it('are set up by tenant admins only', async () => {
    const mapping = {
      clinic: '仁安健康管理診所',
      columns: { empNo: '員工編號', examDate: '檢查日期', kind: '健檢類別', smoker: '吸菸', history: '病史', symptoms: '自覺症狀', specialHazard: '特殊作業', specialLevel: '管理分級' },
      items: ITEM_HEADERS,
    };
    expect((await call('acme', 'POST', '/api/admin/exam-mappings', { cookie: await as('nurse@acme.test'), body: mapping })).statusCode).toBe(403);
    const res = await call('acme', 'POST', '/api/admin/exam-mappings', { cookie: await as('admin@acme.test'), body: mapping });
    expect(res.statusCode, res.body).toBe(201);
    ids.mapping = res.json().id;
    const byId = await call('acme', 'POST', '/api/admin/exam-mappings', {
      cookie: await as('admin@acme.test'),
      body: { clinic: '康誠醫院健檢中心', columns: { nationalId: '身分證號', examDate: '檢查日期' }, items: { B0111: '收縮壓', B0112: '舒張壓' } },
    });
    ids.idMapping = byId.json().id;
    expect((await call('acme', 'POST', '/api/admin/exam-mappings', { cookie: await as('admin@acme.test'), body: { ...mapping, items: { X999: 'x' } } })).statusCode).toBe(400);
    expect((await call('acme', 'GET', '/api/exams/mappings', { cookie: await as('nurse@acme.test') })).json()).toHaveLength(2);
  });
});

describe('exam import', () => {
  it('lists every bad row and writes nothing until the file is clean', async () => {
    const first = latestReports[0]!.r;
    const bad = await xlsx(COLUMNS, [
      examRow('NOPE', '2026-09-01', first.values),
      examRow('FAR01', '2026-09-01', first.values),
      examRow(first.empId, '2026/09/01', first.values),
      examRow(latestReports[1]!.r.empId, '2026-09-01', { ...latestReports[1]!.r.values, SBP: '高' }),
      examRow(latestReports[2]!.r.empId, '2026-09-01', latestReports[2]!.r.values, { 管理分級: 7 }),
    ]);
    const nurse = await as('nurse@acme.test');
    const preview = (await call('acme', 'POST', `/api/exams/import?mapping=${ids.mapping}`, { cookie: nurse, xlsx: bad })).json();
    expect(preview).toMatchObject({ committed: false, rows: 5, exams: 0, ruleSetVersion: 1 });
    expect(preview.issues).toEqual(expect.arrayContaining([
      { row: 2, column: '員工編號', message: '找不到工號 NOPE' },
      { row: 3, column: '員工編號', message: '此員工不在您負責的廠區' },
      { row: 4, column: '檢查日期', message: '日期格式應為 YYYY-MM-DD' },
      { row: 5, column: '血壓－收縮壓', message: '「高」不是數值' },
      { row: 6, column: '管理分級', message: '特殊健檢管理分級應為 1–4' },
    ]));
    expect((await call('acme', 'POST', `/api/exams/import?mapping=${ids.mapping}&commit=true`, { cookie: nurse, xlsx: bad })).statusCode).toBe(422);
    expect(await owner.select().from(healthExams)).toHaveLength(0);
  });

  it('previews each importable row with its grades and the events it would raise', async () => {
    const high = latestReports.find(x => x.g.max >= 3)!;
    const low = latestReports.find(x => x.g.max < 3)!;
    const file = await xlsx(COLUMNS, [examRow('NOPE', '2026-09-01', low.r.values), examRow(high.r.empId, high.r.date, high.r.values), examRow(low.r.empId, low.r.date, low.r.values)]);
    const preview = (await call('acme', 'POST', `/api/exams/import?mapping=${ids.mapping}`, { cookie: await as('nurse@acme.test'), xlsx: file })).json();
    expect(preview).toMatchObject({ committed: false, exams: 2, newEvents: 1 });
    expect(preview.preview).toEqual([
      {
        row: 3, employeeId: await empIdOf(high.r.empId), empNo: high.r.empId, name: `員工${high.r.empId}`, examDate: high.r.date, kind: '年度健檢',
        gradeMax: high.g.max, gradeTotal: high.g.total, specialLevel: null, events: 1,
      },
      expect.objectContaining({ row: 4, empNo: low.r.empId, gradeMax: low.g.max, events: 0 }),
    ]);
    expect(await owner.select().from(healthExams)).toHaveLength(0);
  });

  it('gives an empty file with the columns of a clinic mapping', async () => {
    const res = await call('acme', 'GET', `/api/exams/mappings/${ids.idMapping}/template`, { cookie: await as('nurse@acme.test') });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toBe(XLSX_MIME);
    expect(res.headers['content-disposition']).toContain(encodeURIComponent('康誠醫院健檢中心健檢匯入範本.xlsx'));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const header = workbook.getWorksheet('健檢結果')!.getRow(1);
    expect((header.values as unknown[]).slice(1)).toEqual(['身分證號', '檢查日期', '收縮壓', '舒張壓']);
    expect(header.getCell(1).font?.bold).toBe(true);
    expect(header.getCell(3).font?.bold).toBeFalsy();
    expect((await call('acme', 'GET', `/api/exams/mappings/${ids.idMapping}/template`, { cookie: await as('hr@acme.test') })).statusCode).toBe(403);
  });

  it("grades every prototype report exactly as the prototype does", async () => {
    const rows = latestReports.map(({ r }, i) => examRow(r.empId, r.date, r.values, {
      吸菸: i % 2 ? '是' : '否', 病史: `高血壓家族史 ${r.empId}`, 自覺症狀: '肩頸痠痛',
      ...(i === 0 ? { 特殊作業: '噪音作業', 管理分級: 2 } : {}),
    }));
    const res = await call('acme', 'POST', `/api/exams/import?mapping=${ids.mapping}&commit=true&fileName=2026.xlsx`, { cookie: await as('nurse@acme.test'), xlsx: await xlsx(COLUMNS, rows) });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ committed: true, exams: latestReports.length, issues: [], ruleSetVersion: 1 });
    expect(latestReports.length).toBeGreaterThan(20);
    for (const { r, g } of latestReports) {
      const [exam] = await owner.select().from(healthExams).where(eq(healthExams.employeeId, await empIdOf(r.empId)));
      expect({ total: exam!.gradeTotal, max: exam!.gradeMax }, r.id).toEqual({ total: g.total, max: g.max });
    }
    const highs = latestReports.filter(x => x.g.max >= 3).length;
    expect(await owner.select().from(caseEvents).where(eq(caseEvents.type, 'hc'))).toHaveLength(highs);
    expect(await owner.select().from(caseEvents).where(eq(caseEvents.type, 'sp'))).toHaveLength(1);
    expect(res.json().newEvents).toBe(highs + 1);
  });

  it('stores each item grade as the prototype does, and the medical text only encrypted', async () => {
    const { r, g } = latestReports.find(x => x.g.max >= 3)!;
    const employeeId = await empIdOf(r.empId);
    const history = (await call('acme', 'GET', `/api/employees/${employeeId}/exams`, { cookie: await as('nurse@acme.test') })).json();
    expect(history).toHaveLength(1);
    const byCode = Object.fromEntries(history[0].items.map((i: { code: string; grade: number | null }) => [i.code, i.grade]));
    for (const item of g.items) if (r.values[EXAM_ITEMS.find(e => e.code === item.code)!.key] != null) expect(byCode[item.code], item.code).toBe(item.lv);
    expect(history[0]).not.toHaveProperty('history');

    const [stored] = await owner.select().from(healthExams).where(eq(healthExams.employeeId, employeeId));
    expect(stored!.historyEnc!.toString('utf8')).not.toContain('高血壓');
    const detail = (await call('acme', 'GET', `/api/exams/${stored!.id}`, { cookie: await as('doctor@acme.test') })).json();
    expect(detail).toMatchObject({ history: `高血壓家族史 ${r.empId}`, symptoms: '肩頸痠痛', ruleSetVersion: 1 });
    const audits = await auditFor(employeeId);
    expect(audits.map(a => [a.action, a.dataCategory])).toEqual(expect.arrayContaining([['create', 'health'], ['read', 'health'], ['read', 'medical']]));
  });

  it('matches employees by national ID, which is never stored', async () => {
    const res = await call('acme', 'POST', `/api/exams/import?mapping=${ids.idMapping}&commit=true`, {
      cookie: await as('nurse@acme.test'),
      xlsx: await xlsx(['身分證號', '檢查日期', '收縮壓', '舒張壓'], [{ 身分證號: 'a223456789', 檢查日期: '2026-08-20', 收縮壓: 150, 舒張壓: 95 }]),
    });
    expect(res.json(), res.body).toMatchObject({ committed: true, exams: 1 });
    const [exam] = await owner.select().from(healthExams).where(eq(healthExams.employeeId, ids.byId));
    expect(exam).toMatchObject({ gradeTotal: 4, gradeMax: 2 });
    const [employee] = await owner.select().from(employees).where(eq(employees.id, ids.byId));
    expect(employee!.nationalIdHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(employee)).not.toContain('223456789');
  });

  it('refuses importing the same exam twice', async () => {
    const { r } = latestReports[0]!;
    const preview = (await call('acme', 'POST', `/api/exams/import?mapping=${ids.mapping}`, { cookie: await as('nurse@acme.test'), xlsx: await xlsx(COLUMNS, [examRow(r.empId, r.date, r.values)]) })).json();
    expect(preview.issues).toEqual([{ row: 2, column: '檢查日期', message: '此筆健檢已匯入過' }]);
  });

  it('lists the import batches, newest first, without exam content', async () => {
    const batches = (await call('acme', 'GET', '/api/exams/batches', { cookie: await as('nurse@acme.test') })).json();
    expect(batches).toEqual([
      { id: expect.any(String), clinic: '康誠醫院健檢中心', fileName: null, rowCount: 1, exams: 1, importedAt: expect.any(String), importedBy: '王護理師' },
      { id: expect.any(String), clinic: '仁安健康管理診所', fileName: '2026.xlsx', rowCount: latestReports.length, exams: latestReports.length, importedAt: expect.any(String), importedBy: '王護理師' },
    ]);
    expect((await call('acme', 'GET', '/api/exams/batches', { cookie: await as('hr@acme.test') })).statusCode).toBe(403);
  });

  it('grades new imports with a newly published rule set and keeps old results on their version', async () => {
    const admin = await as('admin@acme.test');
    const stricter = RULES_V1.map(rule => (rule.code === 'B0111' ? { ...rule, type: 'number', levels: [{ lv: 1, max: 120 }, { lv: 4, min: 120 }] } : rule));
    const draft = (await call('acme', 'POST', '/api/admin/rule-sets', { cookie: admin, body: { note: '收縮壓從嚴', rules: stricter } })).json();
    expect(draft).toMatchObject({ version: 2, status: 'draft' });
    expect((await call('acme', 'POST', `/api/admin/rule-sets/${draft.id}/publish`, { cookie: admin })).json()).toMatchObject({ status: 'published' });
    const res = await call('acme', 'POST', `/api/exams/import?mapping=${ids.idMapping}&commit=true`, {
      cookie: await as('nurse@acme.test'),
      xlsx: await xlsx(['身分證號', '檢查日期', '收縮壓', '舒張壓'], [{ 身分證號: 'A223456789', 檢查日期: '2026-09-20', 收縮壓: 125, 舒張壓: 80 }]),
    });
    expect(res.json()).toMatchObject({ committed: true, ruleSetVersion: 2 });
    const history = (await call('acme', 'GET', `/api/employees/${ids.byId}/exams`, { cookie: await as('nurse@acme.test') })).json();
    expect(history.map((e: { ruleSetVersion: number; gradeMax: number }) => [e.ruleSetVersion, e.gradeMax])).toEqual([[2, 4], [1, 2]]);
  });

  it('lets tenant admins edit and delete a rule set while it is a draft', async () => {
    const admin = await as('admin@acme.test');
    const [published] = (await call('acme', 'GET', '/api/admin/rule-sets', { cookie: admin })).json();
    const draft = (await call('acme', 'POST', '/api/admin/rule-sets', { cookie: admin, body: { note: '草稿', rules: RULES_V1 } })).json();
    expect(draft).toMatchObject({ version: 3, status: 'draft' });

    const byDoctor = RULES_V1.map(rule => (rule.code === 'B0111' ? { ...rule, src: 'physician' } : rule));
    const updated = await call('acme', 'PUT', `/api/admin/rule-sets/${draft.id}`, { cookie: admin, body: { note: '醫師調整收縮壓', rules: byDoctor } });
    expect(updated.json(), updated.body).toMatchObject({ id: draft.id, version: 3, status: 'draft', note: '醫師調整收縮壓' });
    const detail = (await call('acme', 'GET', `/api/admin/rule-sets/${draft.id}`, { cookie: admin })).json();
    expect(detail.rules).toHaveLength(RULES_V1.length);
    expect(detail.rules.find((r: { code: string }) => r.code === 'B0111')).toMatchObject({ src: 'physician' });

    expect((await call('acme', 'PUT', `/api/admin/rule-sets/${draft.id}`, { cookie: await as('nurse@acme.test'), body: { rules: byDoctor } })).statusCode).toBe(403);
    expect((await call('acme', 'PUT', `/api/admin/rule-sets/${published.id}`, { cookie: admin, body: { rules: byDoctor } })).json()).toMatchObject({ code: 'not_draft' });
    expect((await call('acme', 'DELETE', `/api/admin/rule-sets/${published.id}`, { cookie: admin })).statusCode).toBe(409);
    expect((await call('acme', 'DELETE', `/api/admin/rule-sets/${draft.id}`, { cookie: admin })).statusCode).toBe(204);
    expect((await call('acme', 'GET', '/api/admin/rule-sets', { cookie: admin })).json().map((s: { version: number }) => s.version)).toEqual([2, 1]);
  });
});

describe('who can see exams', () => {
  it('never shows exam values to HR or tenant admins', async () => {
    const employeeId = await empIdOf(latestReports[0]!.r.empId);
    const [exam] = await owner.select().from(healthExams).where(eq(healthExams.employeeId, employeeId));
    for (const email of ['hr@acme.test', 'admin@acme.test']) {
      const cookie = await as(email);
      for (const url of [`/api/employees/${employeeId}/exams`, `/api/exams/${exam!.id}`, `/api/employees/${employeeId}/case`, `/api/employees/${employeeId}/records`, '/api/cases']) {
        expect((await call('acme', 'GET', url, { cookie })).statusCode, `${email} ${url}`).toBe(403);
      }
      expect((await call('acme', 'POST', `/api/exams/import?mapping=${ids.mapping}`, { cookie, xlsx: await xlsx(COLUMNS, []) })).statusCode).toBe(403);
    }
  });

  it('refuses staff outside the employee\'s sites', async () => {
    const employeeId = await empIdOf(latestReports[0]!.r.empId);
    const res = await call('acme', 'GET', `/api/employees/${employeeId}/exams`, { cookie: await as('nurse2@acme.test') });
    expect([res.statusCode, res.json().code]).toEqual([403, 'outside_sites']);
    expect((await call('acme', 'GET', '/api/cases', { cookie: await as('nurse2@acme.test') })).json()).toEqual([]);
  });

  it('is unreachable from another tenant', async () => {
    const employeeId = await empIdOf(latestReports[0]!.r.empId);
    expect((await call('acme', 'GET', `/api/employees/${employeeId}/exams`, { cookie: await as('nurse@globex.test', 'globex') })).statusCode).toBe(401);
    expect((await call('globex', 'GET', `/api/employees/${employeeId}/exams`, { cookie: await as('nurse@globex.test', 'globex') })).statusCode).toBe(404);
  });
});

describe('assistance records', () => {
  it('offers phrases with their 改善／建議 kind', async () => {
    const phrases = (await call('acme', 'GET', '/api/phrases', { cookie: await as('nurse@acme.test') })).json();
    expect(phrases).toEqual(expect.arrayContaining([expect.objectContaining({ category: '不法侵害－措施', text: '配置保全人員。', kind: '建議' })]));
  });

  it('stores record content encrypted, shows it to staff of the site, and audits', async () => {
    const nurse = await as('nurse@acme.test');
    const employeeId = await empIdOf(latestReports[0]!.r.empId);
    const [nurseUser] = await owner.select().from(users).where(eq(users.email, 'nurse@acme.test'));
    const created = await call('acme', 'POST', '/api/records', {
      cookie: nurse,
      body: {
        employeeId, category: '健康面談諮詢紀錄', occurredAt: '2026-10-01T10:00:00+08:00',
        consultTypes: ['健康檢查／體格檢查報告異常'], lifestyleAdvice: ['定期量血壓'],
        content: { explain: '收縮壓 168，說明複檢必要性。', handling: '已提供衛教單張，約定兩週後電話關懷追蹤。', note: '' },
        helpers: [{ userId: nurseUser!.id, minutes: 30 }], result: '追蹤', followUpOn: '2026-10-15', followUpUserId: nurseUser!.id,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const [row] = await owner.select().from(assistRecords).where(eq(assistRecords.id, created.json().id));
    expect(row!.contentEnc!.toString('utf8')).not.toContain('收縮壓');
    const list = (await call('acme', 'GET', `/api/employees/${employeeId}/records`, { cookie: await as('doctor@acme.test') })).json();
    expect(list[0].content.explain).toBe('收縮壓 168，說明複檢必要性。');
    expect((await call('acme', 'GET', '/api/records/follow-ups', { cookie: nurse })).json()).toMatchObject([{ recordId: created.json().id, followUpOn: '2026-10-15' }]);
    await call('acme', 'PATCH', `/api/records/${created.json().id}`, { cookie: nurse, body: { followUpDone: true } });
    expect((await call('acme', 'GET', '/api/records/follow-ups', { cookie: nurse })).json()).toEqual([]);
    expect((await call('acme', 'POST', '/api/records', { cookie: await as('nurse2@acme.test'), body: { employeeId, category: 'x', occurredAt: '2026-10-01T10:00:00+08:00', content: {}, result: '結案' } })).statusCode).toBe(403);
    expect((await auditFor(employeeId)).filter(a => a.subjectTable === 'assist_records').map(a => a.action)).toEqual(['create', 'read', 'update']);
  });
});

describe('cases', () => {
  it('opens, works and closes a case, keeping the history, and reopens on a new event', async () => {
    const nurse = await as('nurse@acme.test');
    const { r } = latestReports.find(x => x.g.max >= 3)!;
    const employeeId = await empIdOf(r.empId);
    const list = (await call('acme', 'GET', '/api/cases?status=未開單', { cookie: nurse })).json();
    expect(list.map((c: { employeeId: string }) => c.employeeId)).toContain(employeeId);

    const opened = (await call('acme', 'POST', `/api/employees/${employeeId}/case/open`, { cookie: nurse })).json();
    expect(opened).toMatchObject({ status: '起單', case: { status: '起單', leadName: '王護理師' }, events: [{ type: 'hc', status: '起單' }] });
    const caseId = opened.case.id;
    expect((await call('acme', 'PATCH', `/api/cases/${caseId}`, { cookie: nurse, body: { status: '處理中', noticeOn: '2026-10-02' } })).json())
      .toMatchObject({ status: '處理中', case: { noticeOn: '2026-10-02' }, events: [{ status: '處理中' }] });
    const [nurseUser] = await owner.select().from(users).where(eq(users.email, 'nurse@acme.test'));
    const followUp = (await call('acme', 'POST', '/api/records', {
      cookie: nurse,
      body: {
        employeeId, category: '健康面談諮詢紀錄', occurredAt: '2026-10-02T10:00:00+08:00', content: { explain: '說明複檢', handling: '', note: '' },
        result: '追蹤', followUpOn: '2026-10-20', followUpUserId: nurseUser!.id,
      },
    })).json();
    expect((await call('acme', 'GET', '/api/records/follow-ups', { cookie: nurse })).json()).toMatchObject([{ recordId: followUp.id }]);
    const closed = (await call('acme', 'PATCH', `/api/cases/${caseId}`, { cookie: nurse, body: { status: '結案', note: '已複檢正常' } })).json();
    expect(closed).toMatchObject({ status: '結案', events: [{ status: '結案' }] });
    // Closing the case closes the employee's open follow-ups, as the prototype does.
    expect((await call('acme', 'GET', '/api/records/follow-ups', { cookie: nurse })).json()).toEqual([]);
    expect((await owner.select().from(assistRecords).where(eq(assistRecords.id, followUp.id)))[0]).toMatchObject({ followUpDone: true });
    expect(closed.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['起單', '處理中', '結案']);
    expect((await call('acme', 'PATCH', `/api/cases/${caseId}`, { cookie: nurse, body: { status: '處理中' } })).json()).toMatchObject({ code: 'invalid_transition' });

    // A newer abnormal exam after closing: the employee shows as 未開單 again, and opening starts a new case.
    const values = { ...r.values, SBP: 190 };
    await call('acme', 'POST', `/api/exams/import?mapping=${ids.mapping}&commit=true`, { cookie: nurse, xlsx: await xlsx(COLUMNS, [examRow(r.empId, '2026-10-02', values)]) });
    expect((await call('acme', 'GET', `/api/employees/${employeeId}/case`, { cookie: nurse })).json()).toMatchObject({ status: '未開單', case: { status: '結案' } });
    const reopened = (await call('acme', 'POST', `/api/employees/${employeeId}/case/open`, { cookie: nurse })).json();
    expect(reopened.case.id).not.toBe(caseId);
    expect(reopened.status).toBe('起單');
    expect(await owner.select().from(eventStatusHistory)).not.toHaveLength(0);
    const caseAudits = (await auditFor(employeeId)).filter(a => a.subjectTable === 'cases');
    expect(caseAudits.map(a => a.action)).toEqual(expect.arrayContaining(['read', 'create', 'update']));
    expect(await owner.select().from(auditLog).where(and(eq(auditLog.subjectTable, 'cases'), eq(auditLog.reason, 'case list')))).not.toHaveLength(0);
  });
});
