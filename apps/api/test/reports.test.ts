/*
 * Reports, exports, 附表八 sign-off and retention against a real PostgreSQL (and pg-boss for exports).
 * The prototype's entire seed is loaded into the database and every one of the 16 reports must equal what the
 * prototype's own REPORTS functions produce from the same seed.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  assistRecords, auditLog, caseEvents, createDb, defaultTemplates, departments, employees, ergoDispatches, ergoSurveys, gradingRuleSets, healthExamResults,
  healthExams, legalEntities, retentionFindings, serviceRecords, sites, tenants, users, workloadAssessments, type Db,
} from '@yutis/db';
import { EXAM_ITEMS, RULES_V1 } from '@yutis/domain';
import ExcelJS from 'exceljs';
import { and, eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LocalTenantCrypto } from '../src/core/crypto.js';
import { MAILER, type Mail, type Mailer } from '../src/core/mail.js';
import { MIN_CELL_SIZE, REPORT_TYPES } from '../src/reports/reports.js';
import { EXPORT_QUEUE, installJobs, JOB_SCHEMA, type ExportJob } from '../src/worker/jobs.js';
import { runExport, runRetentionScan } from '../src/worker/work.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

/* ---------- the whole prototype, run in a sandbox ---------- */
const dir = fileURLToPath(new URL('../../../prototype/', import.meta.url));
const stub = (): unknown => new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), set: () => true });
const sandbox = vm.createContext({
  console, document: stub(), window: stub(), history: stub(), navigator: {}, location: { hash: '' }, setTimeout: () => 0, addEventListener() {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, matchMedia: () => ({ matches: false, addEventListener() {} }),
});
vm.runInContext(`${['data.js', 'logic.js', 'app.js', 'programs.js', 'more.js'].map(f => readFileSync(dir + f, 'utf8')).join('\n;\n')}
;globalThis.out = {
  sites: ORG.sites, depts: ORG.depts, employees: S.employees,
  reports: S.reports.map(r => ({ r, g: gradeReport(r) })),
  workload: S.workload.map(a => ({ a, w: evalWorkload(a) })),
  ergo: S.ergo, records: S.records, events: allEvents(),
  expected: Object.fromEntries(Object.entries(REPORTS).map(([k, fns]) => [k, Object.fromEntries(Object.entries(fns).map(([t, fn]) => {
    const d = fn(S.employees); return [t, { sum: d.sum, cols: d.cols, rows: d.rows }];
  }))])),
};`, sandbox);
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const proto = JSON.parse(JSON.stringify((sandbox as { out: unknown }).out)) as {
  sites: Any[]; depts: Any[]; employees: Any[]; reports: { r: Any; g: Any }[]; workload: { a: Any; w: Any }[]; ergo: Any[]; records: Any[]; events: Any[];
  expected: Record<string, Record<string, { sum: [unknown, string][]; cols: string[]; rows: unknown[][] }>>;
};

let db: TestDatabase;
let owner: Db;
let app: NestFastifyApplication;
/** Email the API would have sent (EMAIL_PROVIDER=log), newest last. */
const sent: Mail[] = [];
let worker: PgBoss;
let workerPool: pg.Pool;
let workerDb: Db;
const masterKey = randomBytes(32);
const crypto = new LocalTenantCrypto(masterKey);
const ids: Record<string, string> = {};

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
function call(method: Method, url: string, opts: { cookie?: string; body?: unknown } = {}) {
  return app.inject({ method, url, headers: { host: 'acme.care.test', ...(opts.cookie ? { cookie: opts.cookie } : {}) }, ...(opts.body === undefined ? {} : { payload: opts.body as object }) });
}
const cookies = new Map<string, string>();
async function as(email: string): Promise<string> {
  if (!cookies.has(email)) {
    const res = await call('POST', '/api/auth/sign-in', { body: { token: email, as: 'staff' } });
    expect(res.statusCode, res.body).toBe(204);
    cookies.set(email, `yutis_session=${res.cookies.find(c => c.name === 'yutis_session')!.value}`);
  }
  return cookies.get(email)!;
}

beforeAll(async () => {
  db = await createTestDatabase();
  owner = db.owner;
  await installJobs(db.ownerUrl);
  const [t] = await owner.insert(tenants).values({ slug: 'acme', name: '示範科技' }).returning();
  const tenantId = t!.id;
  ids.tenant = tenantId;
  await owner.insert(defaultTemplates).values([
    { kind: 'grading_rules', version: 1, active: true, content: RULES_V1 },
    { kind: 'phrases', version: 1, active: true, content: [] },
    { kind: 'sign_off_roles', version: 1, active: true, content: ['勞工健康服務醫師', '人力資源管理人員', '部門主管'] },
    { kind: 'survey_versions', version: 1, active: true, content: {} },
  ]);
  await owner.execute(sql`select apply_default_templates(${tenantId})`);
  const [ruleSet] = await owner.select().from(gradingRuleSets);
  const [le] = await owner.insert(legalEntities).values({ tenantId, code: 'L1', name: '示範科技' }).returning();
  const siteId = new Map<string, string>();
  for (const [i, s] of proto.sites.entries()) {
    const [row] = await owner.insert(sites).values({ tenantId, legalEntityId: le!.id, code: `S${String(i).padStart(2, '0')}`, name: s.name }).returning();
    siteId.set(s.id, row!.id);
  }
  const deptId = new Map<string, string>();
  for (const [i, d] of proto.depts.entries()) {
    const [row] = await owner.insert(departments).values({ tenantId, siteId: siteId.get(d.site)!, code: String(i).padStart(3, '0'), name: d.name }).returning();
    deptId.set(d.id, row!.id);
  }
  const empId = new Map<string, string>();
  for (const e of proto.employees) {
    const dept = proto.depts.find(d => d.id === e.dept)!;
    const [row] = await owner.insert(employees).values({
      tenantId, empNo: e.id, name: e.name, sex: e.sex, birthDate: e.birth, legalEntityId: le!.id, siteId: siteId.get(dept.site)!, departmentId: deptId.get(e.dept)!,
    }).returning();
    empId.set(e.id, row!.id);
  }
  for (const { r, g } of proto.reports) {
    const [exam] = await owner.insert(healthExams).values({
      tenantId, employeeId: empId.get(r.empId)!, examDate: r.date, kind: r.kind, ruleSetId: ruleSet!.id, gradeTotal: g.total, gradeMax: g.max, smoker: !!r.life?.smoke,
    }).returning();
    await owner.insert(healthExamResults).values(g.items.filter((i: Any) => i.v != null).map((i: Any) => ({
      tenantId, examId: exam!.id, itemCode: EXAM_ITEMS.find(x => x.key === i.key)!.code, grade: i.lv,
      ...(typeof i.v === 'string' ? { valueText: i.v } : { valueNum: String(i.v) }),
    })));
  }
  for (const { a, w } of proto.workload) {
    await owner.insert(workloadAssessments).values({
      tenantId, employeeId: empId.get(a.empId)!, sentOn: '2026-09-01', personalBurnout: a.pf == null ? null : String(a.pf), workBurnout: a.wf == null ? null : String(a.wf),
      overtime1m: a.m1 == null ? null : String(a.m1), overtime6mAvg: a.avg6 == null ? null : String(a.avg6), workPatterns: a.patterns, evaluation: w,
    });
  }
  const [dispatch] = await owner.insert(ergoDispatches).values({ tenantId, name: 'NMQ', sentOn: '2026-09-01' }).returning();
  await owner.insert(ergoSurveys).values(proto.ergo.map(s => ({
    tenantId, dispatchId: dispatch!.id, employeeId: empId.get(s.empId)!, status: s.status, formVersion: 'nmq-v1', answers: s.nmq ? { scores: s.nmq } : null,
  })));
  await owner.insert(assistRecords).values(proto.records.map(r => ({
    tenantId, employeeId: empId.get(r.empId)!, category: r.cat, occurredAt: new Date(`${r.date}T${r.time ?? '10:00'}:00+08:00`), result: r.result ?? '結案', draft: !!r.draft,
    helpers: (r.helpers ?? []).map((h: Any) => ({ userId: randomUUID(), minutes: h.min })),
  })));
  await owner.insert(caseEvents).values(proto.events.map(e => ({
    tenantId, employeeId: empId.get(e.empId)!, type: e.type, sourceTable: 'prototype', sourceId: randomUUID(), occurredOn: e.date ?? '2026-01-01', description: e.desc, status: e.status,
  })));
  const staffRows = await owner.insert(users).values([
    { tenantId, email: 'nurse@acme.test', name: '王護理師', role: '職護' },
    { tenantId, email: 'hr@acme.test', name: '李人資', role: '人資' },
    { tenantId, email: 'safety@acme.test', name: '吳工安', role: '職安衛人員' },
    { tenantId, email: 'admin@acme.test', name: '陳管理員', role: '租戶管理員' },
  ]).returning();
  for (const u of staffRows) ids[u.email] = u.id;
  for (const email of ['nurse@acme.test', 'hr@acme.test', 'safety@acme.test']) {
    for (const s of siteId.values()) await owner.execute(sql`insert into user_site_scopes (tenant_id, user_id, site_id) values (${tenantId}, ${ids[email]}, ${s})`);
  }
  ids.site = [...siteId.values()][0]!;

  const config = loadConfig({
    NODE_ENV: 'test', APP_DATABASE_URL: db.appUrl, TENANT_BASE_DOMAIN: 'care.test', COOKIE_SECURE: 'false', AUTH_DEV_SIGN_IN: 'true', TENANT_CRYPTO_LOCAL_KEY: masterKey.toString('base64'),
  });
  app = await createApp(config, { logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  vi.spyOn(app.get<Mailer>(MAILER), 'send').mockImplementation(async mail => { sent.push(mail); });

  workerPool = new pg.Pool({ connectionString: db.workerUrl, max: 2 });
  workerDb = createDb(workerPool);
  worker = new PgBoss({ connectionString: db.workerUrl, schema: JOB_SCHEMA, migrate: false, supervise: false, schedule: false, max: 2 });
  await worker.start();
  await worker.work<ExportJob>(EXPORT_QUEUE, { pollingIntervalSeconds: 0.5 }, async ([job]) => runExport(workerDb, crypto, job!.data.tenantId, job!.data.exportId));
}, 120_000);

afterAll(async () => {
  await worker?.stop({ graceful: false });
  await workerPool?.end();
  await app?.close();
  await db?.drop();
});

const allReports = Object.entries(REPORT_TYPES).flatMap(([kind, list]) => list.map(([type]) => [kind, type] as const));

describe('statistical reports', () => {
  it('has the prototype\'s 16 reports', () => {
    expect(allReports).toHaveLength(16);
    expect(Object.entries(proto.expected).flatMap(([k, v]) => Object.keys(v).map(t => `${k}/${t}`)).sort()).toEqual(allReports.map(([k, t]) => `${k}/${t}`).sort());
  });

  it.each(allReports)('%s/%s equals the prototype', async (kind, type) => {
    const res = await call('GET', `/api/reports/${kind}/${type}`, { cookie: await as('nurse@acme.test') });
    expect(res.statusCode, res.body).toBe(200);
    const exp = proto.expected[kind]![type]!;
    const got = res.json();
    expect(got.columns).toEqual(exp.cols);
    expect(got.rows).toEqual(exp.rows);
    expect(got.summary.map((s: { label: string; value: unknown }) => [s.value, s.label])).toEqual(exp.sum);
    expect(got.suppressed).toBe(false);
  });

  it.each(allReports)('%s/%s shows HR and 職安衛 no group smaller than the minimum cell size', async (kind, type) => {
    const full = (await call('GET', `/api/reports/${kind}/${type}`, { cookie: await as('nurse@acme.test') })).json();
    for (const email of ['hr@acme.test', 'safety@acme.test']) {
      const r = (await call('GET', `/api/reports/${kind}/${type}`, { cookie: await as(email) })).json();
      const numbers = [...r.rows.flat(), ...r.summary.map((s: { value: unknown }) => s.value)].filter((v: unknown) => typeof v === 'number') as number[];
      expect(numbers.filter(n => n > 0 && n < MIN_CELL_SIZE), `${kind}/${type}`).toEqual([]);
      // No column has exactly one hidden count: it could be recovered by subtraction.
      for (let c = 1; c < r.columns.length; c++) {
        const hidden = r.rows.filter((row: unknown[], i: number) => row[c] === null && typeof full.rows[i][c] === 'number').length;
        expect(hidden === 0 || hidden >= 2, `${kind}/${type} column ${c}`).toBe(true);
      }
    }
  });

  it('is not for tenant admins, and filters by organisation', async () => {
    expect((await call('GET', '/api/reports/health/grade', { cookie: await as('admin@acme.test') })).statusCode).toBe(403);
    const one = (await call('GET', `/api/reports/health/grade?siteId=${ids.site}`, { cookie: await as('nurse@acme.test') })).json();
    const all = (await call('GET', '/api/reports/health/grade', { cookie: await as('nurse@acme.test') })).json();
    expect(one.summary[0].value).toBeLessThan(all.summary[0].value);
    expect((await call('GET', '/api/reports/health/nope', { cookie: await as('nurse@acme.test') })).statusCode).toBe(404);
  });
});

async function waitForExport(cookie: string, id: string) {
  for (let i = 0; i < 80; i++) {
    const list = (await call('GET', '/api/exports', { cookie })).json() as { id: string; status: string }[];
    const e = list.find(x => x.id === id)!;
    if (e.status === 'done' || e.status === 'failed') return e;
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('export did not finish');
}

describe('exports', () => {
  it('builds an Excel file in the worker, downloads it once through a short-lived link, and audits both', async () => {
    const cookie = await as('nurse@acme.test');
    const requested = await call('POST', '/api/exports', { cookie, body: { report: 'health', type: 'grade', format: 'xlsx' } });
    expect(requested.statusCode, requested.body).toBe(201);
    expect(requested.json()).toMatchObject({ kind: 'health', type: 'grade', title: '健管級數占比分析', status: 'queued', fileName: null });
    const done = await waitForExport(cookie, requested.json().id);
    expect(done.status).toBe('done');
    const { url } = (await call('POST', `/api/exports/${done.id}/link`, { cookie })).json();
    const file = await call('GET', url);
    expect(file.headers['content-type']).toContain('spreadsheetml');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.rawPayload as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0]!;
    expect(sheet.getCell('A1').value).toBe('健管級數占比分析');
    expect(String(sheet.getCell('A2').value)).toContain('匯出人：王護理師');
    expect((await call('GET', url)).statusCode).toBe(410);
    expect((await call('POST', `/api/exports/${done.id}/link`, { cookie: await as('hr@acme.test') })).statusCode).toBe(404);
    const audits = await owner.select().from(auditLog).where(and(eq(auditLog.subjectTable, 'exports'), eq(auditLog.subjectId, done.id)));
    expect(audits.map(a => [a.action, a.actorUserId])).toEqual([['export', ids['nurse@acme.test']], ['export', ids['nurse@acme.test']]]);
  });

  it('exports HR\'s de-identified view, and PDF with Chinese text', async () => {
    const hr = await as('hr@acme.test');
    const id = (await call('POST', '/api/exports', { cookie: hr, body: { report: 'wl', type: 'risk', format: 'pdf' } })).json().id;
    expect((await waitForExport(hr, id)).status).toBe('done');
    const pdf = await call('GET', (await call('POST', `/api/exports/${id}/link`, { cookie: hr })).json().url);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.rawPayload.length).toBeGreaterThan(2000);
  });
});

describe('附表八 sign-off', () => {
  it('records a service, sends it to the configured sign-off roles, and completes when everyone has signed', async () => {
    const safety = await as('safety@acme.test');
    const depts = await owner.select({ id: departments.id, siteId: departments.siteId }).from(departments);
    const inSite = depts.find(d => d.siteId === ids.site)!.id;
    const elsewhere = depts.find(d => d.siteId !== ids.site)!.id;
    const body = {
      serviceOn: '2026-10-01', siteId: ids.site, departmentId: inSite,
      content: { from: '09:00', to: '12:00', executorUserId: ids['safety@acme.test'], headcount: { adminM: 6, adminF: 4, opM: 58, opF: 21, general: 31 }, services: '9.1 健康檢查結果分析' },
      signers: [{ role: '人力資源管理人員', name: '李人資', email: 'hr@acme.test' }, { role: '部門主管', name: '周課長', email: 'boss@acme.test' }],
    };
    expect((await call('POST', '/api/service-records', { cookie: safety, body: { ...body, signers: [{ role: '老闆', name: 'x', email: 'x@acme.test' }] } })).json()).toMatchObject({ code: 'unknown_sign_off_role' });
    expect((await call('POST', '/api/service-records', { cookie: safety, body: { ...body, departmentId: elsewhere } })).json()).toMatchObject({ code: 'unknown_department' });
    expect((await call('POST', '/api/service-records', { cookie: await as('hr@acme.test'), body })).statusCode).toBe(403);
    expect((await call('GET', '/api/service-records/sign-off-roles', { cookie: safety })).json()).toEqual(['勞工健康服務醫師', '人力資源管理人員', '部門主管']);
    const created = (await call('POST', '/api/service-records', { cookie: safety, body })).json();
    expect(created).toMatchObject({
      departmentId: inSite, status: '草稿', executorName: '吳工安', signatures: [{ role: '人力資源管理人員', firstSentAt: null }, { role: '部門主管', firstSentAt: null }],
    });
    const spare = (await call('POST', '/api/service-records', { cookie: safety, body })).json();
    expect((await call('DELETE', `/api/service-records/${spare.id}`, { cookie: safety })).statusCode).toBe(204);
    expect((await call('DELETE', `/api/service-records/${spare.id}`, { cookie: safety })).statusCode).toBe(404);

    const before = sent.length;
    const links = (await call('POST', `/api/service-records/${created.id}/submit`, { cookie: safety })).json();
    expect(links).toHaveLength(2);
    // Mail is only logged in tests (EMAIL_PROVIDER=log): the response says so, so staff can hand the links over themselves.
    expect(links.map((l: { emailed: boolean }) => l.emailed)).toEqual([false, false]);
    // Each signer gets their own link by email; the email names the record, not its content.
    const mails = sent.slice(before);
    expect(mails.map(m => [m.to, m.subject])).toEqual([
      ['hr@acme.test', `請簽核勞工健康服務執行紀錄表（附表八）（${created.siteName} 2026-10-01）`],
      ['boss@acme.test', `請簽核勞工健康服務執行紀錄表（附表八）（${created.siteName} 2026-10-01）`],
    ]);
    expect(mails[0]!.text).toContain(links[0].url);
    expect(mails[0]!.text).toContain('「人力資源管理人員」');
    expect(mails.map(m => m.text).join()).not.toContain('健康檢查結果分析');
    expect((await call('DELETE', `/api/service-records/${created.id}`, { cookie: safety })).json()).toMatchObject({ code: 'not_draft' });
    const [listed] = (await call('GET', '/api/service-records', { cookie: safety })).json();
    expect(listed.signatures[0]).toMatchObject({ firstSentAt: expect.any(String), sentAt: expect.any(String) });
    expect((await call('PUT', `/api/service-records/${created.id}`, { cookie: safety, body })).json()).toMatchObject({ code: 'not_draft' });
    const token = (u: string) => u.split('/').pop()!;
    const hrLink = token(links[0].url);
    expect((await call('GET', `/api/sign/${hrLink}`)).json()).toMatchObject({ title: '勞工健康服務執行紀錄表（附表八）', lang: 'zh', content: { signer: { role: '人力資源管理人員' } } });
    expect((await call('POST', `/api/sign/${hrLink}`, { body: { comment: '同意' } })).json()).toMatchObject({ comment: '同意' });
    expect((await call('POST', `/api/sign/${hrLink}`, { body: {} })).json()).toMatchObject({ code: 'token_used' });
    const [stillOpen] = await owner.select().from(serviceRecords).where(eq(serviceRecords.id, created.id));
    expect(stillOpen!.status).toBe('簽核中');

    const resent = (await call('POST', `/api/service-records/${created.id}/signatures/${links[1].signatureId}/resend`, { cookie: safety })).json();
    expect((await call('GET', `/api/sign/${token(links[1].url)}`)).statusCode).toBe(410);
    await call('POST', `/api/sign/${token(resent.url)}`, { body: {} });
    const [done] = await owner.select().from(serviceRecords).where(eq(serviceRecords.id, created.id));
    expect(done!.status).toBe('已完成');
    const chain = (await owner.select().from(auditLog).where(sql`${auditLog.subjectTable} in ('service_records', 'signatures')`)).map(a => a.reason ?? a.action);
    expect(chain).toEqual(expect.arrayContaining([
      'submitted for sign-off to 人力資源管理人員、部門主管', 'sign link sent to 人力資源管理人員 李人資', 'signed by 人力資源管理人員 李人資', 'signed by 部門主管 周課長', 'all signers signed; completed',
    ]));
  });

  it('lets tenant admins set the sign-off roles', async () => {
    const admin = await as('admin@acme.test');
    expect((await call('GET', '/api/admin/sign-off-roles', { cookie: admin })).json()).toEqual(['勞工健康服務醫師', '人力資源管理人員', '部門主管']);
    expect((await call('PUT', '/api/admin/sign-off-roles', { cookie: admin, body: { roles: ['部門主管', '部門主管'] } })).statusCode).toBe(400);
    expect((await call('PUT', '/api/admin/sign-off-roles', { cookie: admin, body: { roles: ['部門主管', '勞工代表'] } })).json()).toEqual(['部門主管', '勞工代表']);
    expect((await call('GET', '/api/service-records/sign-off-roles', { cookie: await as('safety@acme.test') })).json()).toEqual(['部門主管', '勞工代表']);
    expect((await call('PUT', '/api/admin/sign-off-roles', { cookie: await as('safety@acme.test'), body: { roles: ['x'] } })).statusCode).toBe(403);
    await call('PUT', '/api/admin/sign-off-roles', { cookie: admin, body: { roles: ['勞工健康服務醫師', '人力資源管理人員', '部門主管'] } });
  });
});

describe('retention', () => {
  it('lists rows past retain_until for review and never deletes them', async () => {
    const [exam] = await owner.select().from(healthExams).limit(1);
    await owner.update(healthExams).set({ retainUntil: '2020-01-01' }).where(eq(healthExams.id, exam!.id));
    const found = await runRetentionScan(workerDb);
    expect(found[ids.tenant!]).toBe(1);
    expect(await runRetentionScan(workerDb)).toEqual({ [ids.tenant!]: 1 });
    expect(await owner.select().from(retentionFindings)).toHaveLength(1);
    const list = (await call('GET', '/api/retention', { cookie: await as('nurse@acme.test') })).json();
    expect(list).toEqual([expect.objectContaining({ table: 'health_exams', rowId: exam!.id, retainUntil: '2020-01-01' })]);
    expect(await owner.select().from(healthExams).where(eq(healthExams.id, exam!.id))).toHaveLength(1);
    expect((await call('GET', '/api/retention', { cookie: await as('hr@acme.test') })).statusCode).toBe(403);
  });

  it('lets only the worker role list tenants', async () => {
    const appPool = new pg.Pool({ connectionString: db.appUrl, max: 1 });
    await expect(appPool.query('select * from worker_tenant_ids()')).rejects.toThrow(/permission denied/);
    await appPool.end();
  });
});
