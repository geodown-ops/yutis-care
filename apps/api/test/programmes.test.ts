/*
 * The four programmes, the employee portal and one-time sign links against a real PostgreSQL. Scores are checked
 * against the prototype itself: its seeded overwork assessments and NMQ answers go through the API and must come out
 * exactly as the prototype's logic.js computes them.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  auditLog, caseEvents, defaultTemplates, departments, employeeAcknowledgements, employees, gradingRuleSets, healthExamResults, healthExams, legalEntities,
  maternalCases, sites, tenants, users, violenceIncidents, type Db,
} from '@yutis/db';
import { cbiScores, EXAM_ITEMS, NMQ_KEYS, RULES_V1 } from '@yutis/domain';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LocalTenantCrypto } from '../src/core/crypto.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

/* ---------- the prototype's seeds, evaluated by the prototype ---------- */
const dir = fileURLToPath(new URL('../../../prototype/', import.meta.url));
const vmCtx = vm.createContext({ console });
vm.runInContext(`${['data.js', 'logic.js'].map(f => readFileSync(dir + f, 'utf8')).join('\n;\n')}
;var S = seedState();
globalThis.out = {
  employees: S.employees,
  workload: S.workload.map(a => ({ a, latest: latestReport(a.empId), w: evalWorkload(a) })),
  ergo: S.ergo.filter(s => s.nmq).map(s => ({ empId: s.empId, nmq: s.nmq, max: nmqMax(s), label: nmqHazardLabel(s) })),
};`, vmCtx);
type ProtoReport = { date: string; values: Record<string, number | string | null>; history: string; life?: { smoke?: boolean } };
const proto = JSON.parse(JSON.stringify((vmCtx as { out: unknown }).out)) as {
  employees: { id: string; sex: '男' | '女'; birth: string }[];
  workload: { a: { empId: string; pf: number | null; wf: number | null; m1: number | null; avg6: number | null; patterns: string[] }; latest: ProtoReport | null;
    w: { complete: boolean; riskLevel?: number; advice?: string; cvd?: { total: number; risk: number; band: number }; load?: { level: number } } }[];
  ergo: { empId: string; nmq: Record<string, number>; max: number; label: string }[];
};
const completeWorkload = proto.workload.filter(x => x.w.complete);

let db: TestDatabase;
let owner: Db;
let app: NestFastifyApplication;
const masterKey = randomBytes(32);
const crypto = new LocalTenantCrypto(masterKey);
const ids: Record<string, string> = {};

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH';
function call(slug: string, method: Method, url: string, opts: { cookie?: string; body?: unknown } = {}) {
  return app.inject({
    method, url, headers: { host: `${slug}.care.test`, ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    ...(opts.body === undefined ? {} : { payload: opts.body as object }),
  });
}
const cookies = new Map<string, string>();
async function as(token: string, kind: 'staff' | 'employee' = 'staff', slug = 'acme'): Promise<string> {
  const key = `${slug}/${kind}/${token}`;
  if (!cookies.has(key)) {
    const res = await call(slug, 'POST', '/api/auth/sign-in', { body: { token, as: kind } });
    expect(res.statusCode, `${token}: ${res.body}`).toBe(204);
    cookies.set(key, `yutis_session=${res.cookies.find(c => c.name === 'yutis_session')!.value}`);
  }
  return cookies.get(key)!;
}
const nurse = () => as('nurse@acme.test');
const fullNmq = (partial: Record<string, number>) => ({ scores: Object.fromEntries(NMQ_KEYS.map(k => [k.key, partial[k.key] ?? 0])), yesNo: {} });
const empId = async (empNo: string) => (await owner.select({ id: employees.id }).from(employees).where(eq(employees.empNo, empNo)))[0]!.id;

beforeAll(async () => {
  db = await createTestDatabase();
  owner = db.owner;
  const [acme, globex] = await owner.insert(tenants).values([{ slug: 'acme', name: 'Acme' }, { slug: 'globex', name: 'Globex' }]).returning();
  ids.acme = acme!.id; ids.globex = globex!.id;
  await owner.insert(defaultTemplates).values([
    { kind: 'grading_rules', version: 1, active: true, content: RULES_V1 },
    { kind: 'phrases', version: 1, active: true, content: [] },
    { kind: 'sign_off_roles', version: 1, active: true, content: [] },
    { kind: 'survey_versions', version: 1, active: true, content: { nmq: 'nmq-2026' } },
  ]);
  await owner.execute(sql`select apply_default_templates(${ids.acme})`);
  const [ruleSet] = await owner.select().from(gradingRuleSets).where(eq(gradingRuleSets.tenantId, ids.acme));
  const [le] = await owner.insert(legalEntities).values({ tenantId: ids.acme!, code: 'L1', name: 'Acme' }).returning();
  const [s1, s2] = await owner.insert(sites).values([
    { tenantId: ids.acme!, legalEntityId: le!.id, code: 'S1', name: '桃園廠' }, { tenantId: ids.acme!, legalEntityId: le!.id, code: 'S2', name: '新竹廠' },
  ]).returning();
  ids.s1 = s1!.id; ids.s2 = s2!.id;
  const [d1, d2] = await owner.insert(departments).values([
    { tenantId: ids.acme!, siteId: s1!.id, name: '製造一課', managerEmail: 'Boss@Acme.test' }, { tenantId: ids.acme!, siteId: s2!.id, name: '研發部', managerEmail: 'boss2@acme.test' },
  ]).returning();
  ids.d1 = d1!.id; ids.d2 = d2!.id;
  const emp = (empNo: string, sex: '男' | '女', birthDate: string, site = s1!, dept = d1!) => ({
    tenantId: ids.acme!, empNo, name: `員工${empNo}`, sex, birthDate, legalEntityId: le!.id, siteId: site.id, departmentId: dept.id, email: `${empNo.toLowerCase()}@acme.test`,
  });
  const protoEmployees = [...new Set([...completeWorkload.map(x => x.a.empId), ...proto.ergo.map(x => x.empId)])];
  await owner.insert(employees).values([
    ...protoEmployees.map(id => { const p = proto.employees.find(e => e.id === id)!; return emp(id, p.sex, p.birth); }),
    emp('A001', '女', '1992-03-01'), emp('B001', '男', '1990-06-01'), emp('OLD01', '男', '1960-01-01'), emp('FAR01', '女', '1991-01-01', s2!, d2!),
  ]);
  // The latest health check of each prototype employee in the overwork seed, as the CVD score's input.
  for (const { a, latest } of completeWorkload) {
    const employeeId = await empId(a.empId);
    const [exam] = await owner.insert(healthExams).values({
      tenantId: ids.acme!, employeeId, examDate: latest!.date, kind: '年度健檢', ruleSetId: ruleSet!.id, gradeTotal: 0, gradeMax: 0,
      smoker: !!latest!.life?.smoke, historyEnc: await crypto.encrypt(ids.acme, latest!.history),
    }).returning();
    await owner.insert(healthExamResults).values(EXAM_ITEMS.filter(i => latest!.values[i.key] != null).map(i => ({
      tenantId: ids.acme!, examId: exam!.id, itemCode: i.code,
      ...(typeof latest!.values[i.key] === 'string' ? { valueText: String(latest!.values[i.key]) } : { valueNum: String(latest!.values[i.key]) }),
    })));
  }
  const staffRows = await owner.insert(users).values([
    { tenantId: ids.acme!, email: 'nurse@acme.test', name: '王護理師', role: '職護' },
    { tenantId: ids.acme!, email: 'nurse2@acme.test', name: '新竹護理師', role: '職護' },
    { tenantId: ids.acme!, email: 'safety@acme.test', name: '吳工安', role: '職安衛人員' },
    { tenantId: ids.acme!, email: 'hr@acme.test', name: '李人資', role: '人資' },
    { tenantId: ids.acme!, email: 'boss@acme.test', name: '周課長', role: '部門主管' },
    { tenantId: ids.acme!, email: 'boss2@acme.test', name: '林課長', role: '部門主管' },
    { tenantId: ids.acme!, email: 'gone@acme.test', name: '陳前課長', role: '部門主管', active: false },
    { tenantId: ids.globex!, email: 'nurse@globex.test', name: 'Globex', role: '職護' },
  ]).returning();
  for (const u of staffRows) ids[u.email] = u.id;
  const scope = (email: string, siteId: string) => sql`(${ids.acme}, ${ids[email]}, ${siteId})`;
  await owner.execute(sql`insert into user_site_scopes (tenant_id, user_id, site_id) values ${sql.join([
    scope('nurse@acme.test', ids.s1), scope('nurse2@acme.test', ids.s2), scope('safety@acme.test', ids.s1), scope('hr@acme.test', ids.s1),
  ], sql`, `)}`);

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

describe('overwork (異常工作負荷)', () => {
  it('evaluates every prototype assessment exactly as the prototype does', async () => {
    expect(completeWorkload.length).toBeGreaterThan(3);
    const employeeIds = await Promise.all(completeWorkload.map(x => empId(x.a.empId)));
    const created = (await call('acme', 'POST', '/api/programs/workload/assessments', { cookie: await nurse(), body: { employeeIds } })).json();
    expect(created).toHaveLength(completeWorkload.length);
    for (const { a, w } of completeWorkload) {
      const id = created.find((c: { empNo: string }) => c.empNo === a.empId).id;
      await call('acme', 'PUT', `/api/programs/workload/assessments/${id}/fatigue`, { cookie: await nurse(), body: { personalBurnout: a.pf, workBurnout: a.wf } });
      const res = await call('acme', 'PUT', `/api/programs/workload/assessments/${id}/overload`, { cookie: await nurse(), body: { overtime1m: a.m1, overtime6mAvg: a.avg6, workPatterns: a.patterns } });
      expect(res.statusCode, res.body).toBe(200);
      const ev = res.json().evaluation;
      expect({ lv: res.json().riskLevel, advice: ev.advice, total: ev.cvd.total, risk: ev.cvd.risk, band: ev.cvd.band, load: ev.load.level }, a.empId)
        .toEqual({ lv: w.riskLevel, advice: w.advice, total: w.cvd!.total, risk: w.cvd!.risk, band: w.cvd!.band, load: w.load!.level });
    }
    const raised = await owner.select().from(caseEvents).where(eq(caseEvents.type, 'wl'));
    expect(raised).toHaveLength(completeWorkload.filter(x => (x.w.riskLevel ?? 0) >= 1).length);
  });

  it('stores interview notes encrypted and exposes only the work advice to HR', async () => {
    const { a } = completeWorkload.find(x => (x.w.riskLevel ?? 0) >= 1)!;
    const list = (await call('acme', 'GET', '/api/programs/workload/assessments', { cookie: await nurse() })).json();
    const id = list.find((x: { empNo: string }) => x.empNo === a.empId).id;
    const res = await call('acme', 'PUT', `/api/programs/workload/assessments/${id}/interview`, {
      cookie: await nurse(),
      body: { status: '已面談', interviewedOn: '2026-10-01', workAdvice: { fitness: '需調整工作', restrictions: ['不宜加班'], suggestion: '三個月內暫停夜班' }, notes: '血壓控制不佳，轉介心臟內科。' },
    });
    expect(res.json().interview.notes).toBe('血壓控制不佳，轉介心臟內科。');
    expect(res.json().interview).toMatchObject({ id: expect.any(String), notices: [] });
    const stored = await owner.execute<{ notes_enc: Buffer }>(sql`select notes_enc from interviews`);
    expect(Buffer.from(stored.rows[0]!.notes_enc).toString('utf8')).not.toContain('心臟內科');
    const advice = (await call('acme', 'GET', '/api/programs/work-advice', { cookie: await as('hr@acme.test') })).json();
    expect(advice).toEqual([expect.objectContaining({ empNo: a.empId, programme: '異常工作負荷', advice: '需調整工作；三個月內暫停夜班', restrictions: ['不宜加班'] })]);
    expect(JSON.stringify(advice)).not.toContain('心臟內科');
    for (const url of ['/api/programs/workload/assessments', '/api/programs/maternal/cases', '/api/programs/maternal/env-assessments', '/api/programs/ergo/dispatches']) {
      expect((await call('acme', 'GET', url, { cookie: await as('hr@acme.test') })).statusCode, url).toBe(403);
    }
  });
});

describe('ergonomics (人因) and the employee portal', () => {
  it('scores every prototype NMQ answer sheet as the prototype does', async () => {
    const employeeIds = await Promise.all(proto.ergo.map(x => empId(x.empId)));
    const dispatch = (await call('acme', 'POST', '/api/programs/ergo/dispatches', { cookie: await nurse(), body: { name: '2026 下半年 NMQ', employeeIds } })).json();
    const surveys = (await call('acme', 'GET', `/api/programs/ergo/dispatches/${dispatch.id}/surveys`, { cookie: await nurse() })).json();
    for (const s of proto.ergo) {
      const survey = surveys.find((x: { empNo: string }) => x.empNo === s.empId);
      const res = (await call('acme', 'PUT', `/api/programs/ergo/surveys/${survey.id}`, { cookie: await nurse(), body: fullNmq(s.nmq) })).json();
      expect({ max: res.maxScore, suspected: res.suspectedHazard }, s.empId).toEqual({ max: s.max, suspected: s.label.startsWith('疑似') });
    }
    expect(await owner.select().from(caseEvents).where(eq(caseEvents.type, 'er'))).toHaveLength(proto.ergo.filter(s => s.label.startsWith('疑似')).length);
  });

  it('shows employees their own pending surveys and takes their answers', async () => {
    const [a, b] = [await empId('A001'), await empId('B001')];
    await call('acme', 'POST', '/api/programs/ergo/dispatches', { cookie: await nurse(), body: { name: '新人 NMQ', employeeIds: [a, b], dueOn: '2026-10-31' } });
    await call('acme', 'POST', '/api/programs/workload/assessments', { cookie: await nurse(), body: { employeeIds: [a, b] } });
    const alice = await as('a001@acme.test', 'employee');
    const bob = await as('b001@acme.test', 'employee');
    const tasks = (await call('acme', 'GET', '/api/portal/tasks', { cookie: alice })).json();
    expect(tasks.map((t: { kind: string }) => t.kind).sort()).toEqual(['cbi', 'nmq', 'overload']);
    const bobTasks = (await call('acme', 'GET', '/api/portal/tasks', { cookie: bob })).json();
    const bobNmq = bobTasks.find((t: { kind: string }) => t.kind === 'nmq').id;
    expect((await call('acme', 'PUT', `/api/portal/ergo/${bobNmq}`, { cookie: alice, body: fullNmq({ neck: 4 }) })).statusCode).toBe(404);

    const nmq = tasks.find((t: { kind: string }) => t.kind === 'nmq').id;
    expect((await call('acme', 'PUT', `/api/portal/ergo/${nmq}`, { cookie: alice, body: fullNmq({ lowerBack: 4 }) })).json()).toMatchObject({ maxScore: 4, suspectedHazard: true });
    expect((await call('acme', 'PUT', `/api/portal/ergo/${nmq}`, { cookie: alice, body: fullNmq({}) })).json()).toMatchObject({ code: 'already_submitted' });
    const cbi = { p: [1, 1, 2, 2, 1, 0], w: [1, 2, 2, 1, 1, 2, 3] };
    const cbiTask = tasks.find((t: { kind: string }) => t.kind === 'cbi').id;
    expect((await call('acme', 'PUT', `/api/portal/workload/${cbiTask}/cbi`, { cookie: alice, body: cbi })).statusCode).toBe(200);
    const [assessment] = await owner.execute<{ personal_burnout: string; work_burnout: string; fatigue_by: string }>(sql`select personal_burnout, work_burnout, fatigue_by from workload_assessments where id = ${cbiTask}`).then(r => r.rows);
    expect([Number(assessment!.personal_burnout), Number(assessment!.work_burnout), assessment!.fatigue_by]).toEqual([cbiScores(cbi).pf, cbiScores(cbi).wf, 'self']);
    expect((await call('acme', 'GET', '/api/portal/tasks', { cookie: alice })).json().map((t: { kind: string }) => t.kind)).toEqual(['overload']);
    const audits = await owner.select().from(auditLog).where(and(eq(auditLog.employeeId, a), eq(auditLog.actorEmployeeId, a)));
    expect(audits.map(x => x.subjectTable)).toEqual(expect.arrayContaining(['ergo_surveys', 'workload_assessments']));
  });

  it('gives employees their own health data and an export, and nothing of anyone else', async () => {
    const someone = completeWorkload[0]!.a.empId;
    const mine = await as(`${someone.toLowerCase()}@acme.test`, 'employee');
    const health = (await call('acme', 'GET', '/api/portal/health', { cookie: mine })).json();
    expect(health.exams).toHaveLength(1);
    expect(health.workload[0]).toMatchObject({ riskLevel: completeWorkload[0]!.w.riskLevel });
    const alice = await as('a001@acme.test', 'employee');
    expect((await call('acme', 'GET', '/api/portal/health', { cookie: alice })).json().exams).toEqual([]);
    const exported = await call('acme', 'GET', '/api/portal/health/export', { cookie: mine });
    expect(exported.headers['content-disposition']).toContain('attachment');
    const self = await empId(someone);
    expect((await owner.select().from(auditLog).where(and(eq(auditLog.employeeId, self), eq(auditLog.action, 'export')))).map(a => a.actorEmployeeId)).toEqual([self]);
  });

  it('records notices read and consents given and withdrawn', async () => {
    const alice = await as('a001@acme.test', 'employee');
    await call('acme', 'POST', '/api/portal/consents', { cookie: alice, body: { kind: 'notice', purpose: '個資蒐集告知', documentVersion: '2026-10' } });
    const consent = (await call('acme', 'POST', '/api/portal/consents', { cookie: alice, body: { kind: 'consent', purpose: '健康促進活動', documentVersion: '2026-10' } })).json();
    expect((await call('acme', 'POST', `/api/portal/consents/${consent.id}/withdraw`, { cookie: alice })).json().withdrawnAt).not.toBeNull();
    const bob = await as('b001@acme.test', 'employee');
    expect((await call('acme', 'POST', `/api/portal/consents/${consent.id}/withdraw`, { cookie: bob })).statusCode).toBe(404);
    expect((await call('acme', 'GET', '/api/portal/consents', { cookie: bob })).json()).toEqual([]);
  });

  it('keeps staff out of the portal and employees out of staff routes', async () => {
    expect((await call('acme', 'GET', '/api/portal/tasks', { cookie: await nurse() })).statusCode).toBe(403);
    expect((await call('acme', 'GET', '/api/programs/workload/assessments', { cookie: await as('a001@acme.test', 'employee') })).statusCode).toBe(403);
  });
});

describe('maternal protection, confirmations and sign links', () => {
  it('lets 職安衛 assess environments, and suggests the management level', async () => {
    const safety = await as('safety@acme.test');
    const env = await call('acme', 'POST', '/api/programs/maternal/env-assessments', {
      cookie: safety, body: { siteId: ids.s1, area: '塗裝線', assessedOn: '2026-09-15', hazards: { 物理性危害: { v: '無' }, 化學性危害: { v: '可能有影響', note: '有機溶劑' } } },
    });
    expect(env.statusCode, env.body).toBe(201);
    expect(env.json().level).toBe('第二級管理');
    ids.env = env.json().id;
    expect((await call('acme', 'POST', '/api/programs/maternal/env-assessments', { cookie: safety, body: { siteId: ids.s2, area: 'x', assessedOn: '2026-09-15', hazards: { a: { v: '有' } } } })).statusCode).toBe(403);
    for (const url of ['/api/programs/maternal/cases', '/api/programs/work-advice', '/api/programs/ergo/dispatches', '/api/programs/violence/incidents']) {
      expect((await call('acme', 'GET', url, { cookie: safety })).statusCode, url).toBe(403);
    }
  });

  it('records a maternal case and interview, and lets the employee confirm once through a link', async () => {
    const a = await empId('A001');
    const c = (await call('acme', 'POST', '/api/programs/maternal/cases', {
      cookie: await nurse(), body: { employeeId: a, type: '妊娠', notifiedOn: '2026-09-20', dueDate: '2027-04-01', envAssessmentId: ids.env, detail: '孕吐嚴重' },
    })).json();
    expect(c).toMatchObject({ level: '第二級管理', detail: '孕吐嚴重' });
    const [stored] = await owner.select().from(maternalCases).where(eq(maternalCases.id, c.id));
    expect(stored!.detailEnc!.toString('utf8')).not.toContain('孕吐');
    expect(await owner.select().from(caseEvents).where(and(eq(caseEvents.type, 'mat'), eq(caseEvents.employeeId, a)))).toHaveLength(1);

    const iv = (await call('acme', 'POST', `/api/programs/maternal/cases/${c.id}/interviews`, {
      cookie: await nurse(), body: { interviewedOn: '2026-09-25', fitAdvice: '可繼續工作，避免接觸有機溶劑', limits: ['不從事塗裝作業'], agreedArrangement: '調至組裝線', notes: '血壓 118/76' },
    })).json();
    const first = (await call('acme', 'POST', `/api/programs/acknowledgements/${iv.acknowledgementId}/link`, { cookie: await nurse() })).json();
    const firstToken = first.url.split('/').pop();
    const second = (await call('acme', 'POST', `/api/programs/acknowledgements/${iv.acknowledgementId}/link`, { cookie: await nurse() })).json();
    const token = second.url.split('/').pop();
    expect(second.url).toBe(`http://acme.care.test/me/sign/${token}`);
    expect((await call('acme', 'GET', `/api/sign/${firstToken}`)).statusCode).toBe(410);
    expect((await call('globex', 'GET', `/api/sign/${token}`)).statusCode).toBe(410);

    const doc = await call('acme', 'GET', `/api/sign/${token}`);
    expect(doc.json()).toMatchObject({ title: '母性健康保護面談紀錄', content: { fitAdvice: '可繼續工作，避免接觸有機溶劑', agreedArrangement: '調至組裝線' }, confirmedAt: null });
    expect(JSON.stringify(doc.json())).not.toContain('118/76');
    expect((await call('acme', 'POST', `/api/sign/${token}`, { body: { comment: '了解' } })).json()).toMatchObject({ comment: '了解' });
    const reused = await call('acme', 'POST', `/api/sign/${token}`, { body: {} });
    expect([reused.statusCode, reused.json().code]).toEqual([410, 'token_used']);
    const [ack] = await owner.select().from(employeeAcknowledgements).where(eq(employeeAcknowledgements.id, iv.acknowledgementId));
    expect([ack!.tokenHash, ack!.confirmedAt]).toEqual([null, expect.any(Date)]);
    expect((await owner.select().from(auditLog).where(and(eq(auditLog.subjectTable, 'employee_acknowledgements'), eq(auditLog.actorEmployeeId, a))))).toHaveLength(2);

    // The case list carries each interview with its confirmation status, so links and notices can be sent later.
    const listed = (await call('acme', 'GET', '/api/programs/maternal/cases', { cookie: await nurse() })).json().find((x: { id: string }) => x.id === c.id);
    expect(listed.interviews).toEqual([{
      id: iv.id, interviewedOn: '2026-09-25', fitAdvice: '可繼續工作，避免接觸有機溶劑', limits: ['不從事塗裝作業'], agreedArrangement: '調至組裝線',
      acknowledgement: { id: iv.acknowledgementId, sentAt: expect.any(String), confirmedAt: expect.any(String) }, notices: [],
    }]);
    expect(JSON.stringify(listed.interviews)).not.toContain('118/76');
  });

  it('refuses expired links', async () => {
    const a = await empId('A001');
    const [c] = await owner.select().from(maternalCases).where(eq(maternalCases.employeeId, a));
    const iv = (await call('acme', 'POST', `/api/programs/maternal/cases/${c!.id}/interviews`, { cookie: await nurse(), body: { interviewedOn: '2026-10-01', fitAdvice: '同前' } })).json();
    const token = (await call('acme', 'POST', `/api/programs/acknowledgements/${iv.acknowledgementId}/link`, { cookie: await nurse() })).json().url.split('/').pop();
    await owner.update(employeeAcknowledgements).set({ tokenExpiresAt: new Date(Date.now() - 1000) }).where(eq(employeeAcknowledgements.id, iv.acknowledgementId));
    expect((await call('acme', 'GET', `/api/sign/${token}`)).json()).toMatchObject({ code: 'token_expired' });
    const alice = await as('a001@acme.test', 'employee');
    expect((await call('acme', 'POST', `/api/portal/acknowledgements/${iv.acknowledgementId}/confirm`, { cookie: alice, body: {} })).json()).toMatchObject({ confirmedAt: expect.any(String) });
    const bob = await as('b001@acme.test', 'employee');
    expect((await call('acme', 'GET', `/api/portal/acknowledgements/${iv.acknowledgementId}`, { cookie: bob })).statusCode).toBe(404);
  });
});

describe('managers, violence, age and scope', () => {
  it('shows a manager only the notices sent to them', async () => {
    const a = await empId('A001');
    const [iv] = (await owner.execute<{ id: string }>(sql`select id from maternal_interviews order by interviewed_on limit 1`)).rows;
    const notice = (caseList: { interviews: { id: string; notices: unknown[] }[] }[]) => caseList.flatMap(x => x.interviews).find(i => i.id === iv!.id)!.notices;
    expect(notice((await call('acme', 'GET', '/api/programs/maternal/cases', { cookie: await nurse() })).json())).toEqual([]);
    const res = await call('acme', 'POST', '/api/programs/notices', {
      cookie: await nurse(), body: { employeeId: a, managerUserId: ids['boss@acme.test'], subjectTable: 'maternal_interviews', subjectId: iv!.id, advice: '請安排調至組裝線，不從事塗裝作業。' },
    });
    expect(res.statusCode, res.body).toBe(201);
    expect((await call('acme', 'POST', '/api/programs/notices', { cookie: await nurse(), body: { employeeId: a, managerUserId: ids['hr@acme.test'], subjectTable: 'maternal_interviews', subjectId: iv!.id, advice: 'x' } })).json())
      .toMatchObject({ code: 'not_a_manager' });
    const boss = await as('boss@acme.test');
    const notices = (await call('acme', 'GET', '/api/programs/notices', { cookie: boss })).json();
    expect(notices).toEqual([expect.objectContaining({ empNo: 'A001', advice: '請安排調至組裝線，不從事塗裝作業。' })]);
    expect(notice((await call('acme', 'GET', '/api/programs/maternal/cases', { cookie: await nurse() })).json())).toEqual([{
      id: res.json().id, managerUserId: ids['boss@acme.test'], managerName: '周課長', sentAt: expect.any(String), readAt: expect.any(String),
    }]);
    expect((await call('acme', 'GET', '/api/programs/notices', { cookie: await as('boss2@acme.test') })).json()).toEqual([]);
    for (const url of ['/api/programs/work-advice', '/api/programs/maternal/cases', '/api/programs/violence/incidents', '/api/programs/violence/risk-assessments', `/api/employees/${a}/exams`]) {
      expect((await call('acme', 'GET', url, { cookie: boss })).statusCode, url).toBe(403);
    }
    expect((await call('acme', 'GET', '/api/programs/notices', { cookie: await nurse() })).statusCode).toBe(403);
  });

  it('lists the department managers clinical staff can notify, with their departments in the caller\'s sites', async () => {
    const managers = (await call('acme', 'GET', '/api/programs/managers', { cookie: await nurse() })).json();
    expect(managers).toHaveLength(2);
    expect(managers).toEqual(expect.arrayContaining([
      { id: ids['boss@acme.test'], name: '周課長', departmentIds: [ids.d1] },
      { id: ids['boss2@acme.test'], name: '林課長', departmentIds: [] },
    ]));
    const fromHsinchu = (await call('acme', 'GET', '/api/programs/managers', { cookie: await as('nurse2@acme.test') })).json();
    expect(fromHsinchu.find((m: { id: string }) => m.id === ids['boss2@acme.test']).departmentIds).toEqual([ids.d2]);
    for (const email of ['hr@acme.test', 'safety@acme.test', 'boss@acme.test']) {
      expect((await call('acme', 'GET', '/api/programs/managers', { cookie: await as(email) })).statusCode, email).toBe(403);
    }
    expect((await call('globex', 'GET', '/api/programs/managers', { cookie: await as('nurse@globex.test', 'staff', 'globex') })).json()).toEqual([]);
  });

  it('keeps violence incidents encrypted and with clinical staff; risk follows likelihood × severity', async () => {
    const risk = (await call('acme', 'POST', '/api/programs/violence/risk-assessments', {
      cookie: await as('safety@acme.test'),
      body: { siteId: ids.s1, assessedOn: '2026-09-01', items: [{ question: '是否有單獨夜間作業', likelihood: '可能', severity: '嚴重' }, { question: '櫃台是否有防護', likelihood: '極不可能', severity: '輕' }] },
    })).json();
    expect(risk.items.map((i: { risk: string }) => i.risk)).toEqual(['高度風險', '低度風險']);
    const incident = (await call('acme', 'POST', '/api/programs/violence/incidents', {
      cookie: await nurse(), body: { occurredOn: '2026-09-10', siteId: ids.s1, type: '言語暴力', victimEmployeeId: await empId('B001'), detail: '課長當眾辱罵' },
    })).json();
    const [row] = await owner.select().from(violenceIncidents).where(eq(violenceIncidents.id, incident.id));
    expect(row!.detailEnc!.toString('utf8')).not.toContain('辱罵');
    expect((await call('acme', 'GET', '/api/programs/violence/incidents', { cookie: await nurse() })).json()[0].detail).toBe('課長當眾辱罵');
    expect((await call('acme', 'GET', '/api/programs/violence/incidents', { cookie: await as('nurse2@acme.test') })).json()).toEqual([]);
  });

  it('raises age events, and every event reaches case management', async () => {
    const res = (await call('acme', 'POST', '/api/cases/age-events', { cookie: await nurse() })).json();
    expect(res.raised).toBeGreaterThanOrEqual(1);
    expect((await call('acme', 'POST', '/api/cases/age-events', { cookie: await nurse() })).json()).toEqual({ raised: 0 });
    const cases = (await call('acme', 'GET', '/api/cases', { cookie: await nurse() })).json();
    const types = new Set(cases.flatMap((c: { events: { type: string }[] }) => c.events.map(e => e.type)));
    expect([...types].sort()).toEqual(expect.arrayContaining(['age', 'er', 'mat', 'wl']));
    expect(cases.find((c: { empNo: string }) => c.empNo === 'OLD01').events).toEqual([expect.objectContaining({ type: 'age', description: expect.stringContaining('中高齡') })]);
  });

  it('keeps staff to their sites and tenants', async () => {
    const far = await empId('FAR01');
    expect((await call('acme', 'POST', '/api/programs/maternal/cases', { cookie: await nurse(), body: { employeeId: far, type: '產後', notifiedOn: '2026-09-01' } })).json())
      .toMatchObject({ code: 'outside_sites' });
    expect((await call('acme', 'POST', '/api/programs/workload/assessments', { cookie: await nurse(), body: { employeeIds: [far] } })).json()).toMatchObject({ code: 'outside_sites' });
    expect((await call('acme', 'GET', '/api/programs/maternal/cases', { cookie: await as('nurse2@acme.test') })).json()).toEqual([]);
    expect((await call('acme', 'GET', '/api/programs/maternal/cases', { cookie: await as('nurse@globex.test', 'staff', 'globex') })).statusCode).toBe(401);
    expect((await call('globex', 'GET', '/api/programs/maternal/cases', { cookie: await as('nurse@globex.test', 'staff', 'globex') })).json()).toEqual([]);
  });
});
