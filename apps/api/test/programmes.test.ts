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
  maternalCases, notifications, portalDrafts, sites, tenants, users, violenceIncidents, type Db,
} from '@yutis/db';
import { cbiScores, EXAM_ITEMS, NMQ_KEYS, RULES_V1 } from '@yutis/domain';
import { and, desc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LocalTenantCrypto } from '../src/core/crypto.js';
import { MAILER, Notifier, type Mail, type Mailer } from '../src/core/mail.js';
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
/** Email the API would have sent (EMAIL_PROVIDER=log), newest last. */
const sent: Mail[] = [];

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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
  vi.spyOn(app.get<Mailer>(MAILER), 'send').mockImplementation(async mail => { sent.push(mail); });
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
      const fatigue = await call('acme', 'PUT', `/api/programs/workload/assessments/${id}/fatigue`, { cookie: await nurse(), body: { personalBurnout: a.pf, workBurnout: a.wf } });
      expect(fatigue.json()).toMatchObject({ riskLevel: null, missing: ['overload'] });
      const res = await call('acme', 'PUT', `/api/programs/workload/assessments/${id}/overload`, { cookie: await nurse(), body: { overtime1m: a.m1, overtime6mAvg: a.avg6, workPatterns: a.patterns } });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().missing).toEqual([]);
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

  it('keeps notes and guidance the form leaves out, shows them only one assessment at a time, and asks the employee to confirm', async () => {
    const list = (await call('acme', 'GET', '/api/programs/workload/assessments', { cookie: await nurse() })).json();
    const { id, employeeId } = list.find((x: { interview: unknown }) => x.interview);
    const guidance = { fatigue: '中度', mentalConcern: '有', diagnosis: '需進行醫療', guidance: '需醫療指導', needMeasure: true, seeDoctor: '心臟內科', special: '血壓 160/100' };
    const res = await call('acme', 'PUT', `/api/programs/workload/assessments/${id}/interview`, {
      cookie: await nurse(),
      body: { status: '已面談', guidance, workAdvice: { fitness: '工作限制', adjustHours: '限制加班', changeWork: '調整為常日班', period: '3 個月' } },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().interview).toMatchObject({
      notes: '血壓控制不佳，轉介心臟內科。', guidance,
      workAdvice: { fitness: '工作限制', restrictions: [], suggestion: '', adjustHours: '限制加班', changeWork: '調整為常日班', period: '3 個月' },
      acknowledgement: { id: expect.any(String), sentAt: null, confirmedAt: null, comment: null },
    });
    const stored = await owner.execute<{ guidance_enc: Buffer }>(sql`select guidance_enc from interviews where guidance_enc is not null`);
    expect(Buffer.from(stored.rows[0]!.guidance_enc).toString('utf8')).not.toContain('160/100');

    // The list leaves the medical parts out; the single read has them and is audited as medical.
    const listed = (await call('acme', 'GET', '/api/programs/workload/assessments', { cookie: await nurse() })).json().find((x: { id: string }) => x.id === id);
    expect(listed.interview).toMatchObject({ notes: null, guidance: null, workAdvice: { adjustHours: '限制加班' } });
    const one = (await call('acme', 'GET', `/api/programs/workload/assessments/${id}`, { cookie: await nurse() })).json();
    expect(one.interview).toMatchObject({ notes: '血壓控制不佳，轉介心臟內科。', guidance });
    const [read] = await owner.select().from(auditLog).where(and(eq(auditLog.subjectTable, 'workload_assessments'), eq(auditLog.subjectId, id), eq(auditLog.action, 'read')))
      .orderBy(desc(auditLog.id)).limit(1);
    expect(read!.dataCategory).toBe('medical');
    expect((await call('acme', 'PUT', `/api/programs/workload/assessments/${id}/interview`, { cookie: await nurse(), body: { interviewedOn: null } })).json())
      .toMatchObject({ code: 'interview_date_required' });

    const advice = (await call('acme', 'GET', '/api/programs/work-advice', { cookie: await as('hr@acme.test') })).json();
    expect(advice).toEqual([expect.objectContaining({ advice: '工作限制；措施期間：3 個月', restrictions: ['限制加班', '調整為常日班'] })]);
    expect(JSON.stringify(advice)).not.toMatch(/心臟內科|160\/100/);

    // Saving again keeps the one confirmation; the employee sees the outcome, never the guidance.
    expect((await call('acme', 'PUT', `/api/programs/workload/assessments/${id}/interview`, { cookie: await nurse(), body: { nextInterview: true, nextOn: '2026-11-01' } })).json().interview)
      .toMatchObject({ nextInterview: true, nextOn: '2026-11-01' });
    const acks = await owner.select().from(employeeAcknowledgements).where(eq(employeeAcknowledgements.subjectTable, 'interviews'));
    expect(acks).toHaveLength(1);
    const link = (await call('acme', 'POST', `/api/programs/acknowledgements/${acks[0]!.id}/link`, { cookie: await nurse() })).json();
    const doc = (await call('acme', 'GET', `/api/sign/${link.url.split('/').pop()}`)).json();
    expect(doc).toMatchObject({
      document: 'employee_acknowledgements', title: '異常工作負荷面談結果', lang: 'zh',
      content: { interviewedOn: '2026-10-01', fitAdvice: '工作限制', limits: ['限制加班', '調整為常日班'], agreedArrangement: '措施期間：3 個月' },
    });
    expect(JSON.stringify(doc)).not.toMatch(/心臟內科|160\/100|血壓/);
    expect(acks[0]!.employeeId).toBe(employeeId);
  });

  it('emails the employee the interview date when it is scheduled, without naming the programme', async () => {
    const list = (await call('acme', 'GET', '/api/programs/workload/assessments', { cookie: await nurse() })).json();
    const a = list.find((x: { interview: unknown }) => !x.interview);
    expect(a).toMatchObject({ siteId: ids.s1, site: '桃園廠', departmentId: ids.d1, department: '製造一課' });
    const to = `${a.empNo.toLowerCase()}@acme.test`;
    const mails = () => sent.filter(m => m.to === to);
    const cookie = await nurse();
    const save = (body: object) => call('acme', 'PUT', `/api/programs/workload/assessments/${a.id}/interview`, { cookie, body });
    expect((await save({ status: '待安排' })).statusCode).toBe(200);
    expect((await save({ status: '已安排' })).statusCode).toBe(200);
    expect(mails()).toEqual([]);
    const scheduled = (await save({ status: '已安排', interviewedOn: '2026-10-20' })).json();
    expect(scheduled.interview).toMatchObject({ status: '已安排', interviewedOn: '2026-10-20', nextInterview: null });
    // Mail is only logged in tests, so the nurse is told the employee was not really emailed.
    expect(scheduled.emailed).toBe(false);
    expect((await save({ status: '已安排', interviewedOn: '2026-10-20' })).json().emailed).toBe(false);
    const delivers = vi.spyOn(app.get(Notifier), 'delivers', 'get').mockReturnValue(true);
    try {
      expect((await save({ interviewedOn: '2026-10-22' })).json().emailed).toBe(true);
      expect((await save({ interviewedOn: '2026-10-22' })).json().emailed).toBe(false);
    } finally {
      delivers.mockRestore();
    }
    expect(mails().map(m => m.subject)).toEqual(['健康面談通知', '健康面談通知']);
    expect(mails()[0]!.text).toContain('2026-10-20');
    expect(mails()[1]!.text).toContain('2026-10-22');
    expect(mails().map(m => m.text).join()).not.toMatch(/過勞|工作負荷|母性|風險/);
    expect((await owner.select().from(notifications).where(eq(notifications.recipientEmail, to))).map(n => n.template)).toEqual(['interview_scheduled', 'interview_scheduled']);
  });

  it('reminds employees who have not filled in both questionnaires', async () => {
    const [fresh] = (await call('acme', 'POST', '/api/programs/workload/assessments', { cookie: await nurse(), body: { employeeIds: [await empId('OLD01')] } })).json();
    const done = (await call('acme', 'GET', '/api/programs/workload/assessments', { cookie: await nurse() })).json().find((x: { missing: string[] }) => !x.missing.length);
    const before = sent.length;
    const res = await call('acme', 'POST', '/api/programs/workload/assessments/remind', { cookie: await nurse(), body: { assessmentIds: [fresh.id, done.id] } });
    expect(res.json()).toEqual({ emailed: 1, delivered: false, noEmail: [] });
    expect(sent.slice(before).map(m => [m.to, m.subject])).toEqual([['old01@acme.test', '提醒：您有尚未填寫的問卷']]);
    const listed = (await call('acme', 'GET', '/api/programs/workload/assessments', { cookie: await nurse() })).json().find((x: { id: string }) => x.id === fresh.id);
    expect(listed).toMatchObject({ reminders: 1, lastRemindedAt: expect.any(String) });
    expect((await call('acme', 'POST', '/api/programs/workload/assessments/remind', { cookie: await as('nurse2@acme.test'), body: { assessmentIds: [fresh.id] } })).json())
      .toEqual({ emailed: 0, delivered: false, noEmail: [] });
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

  it('opens one task and keeps a draft of it until it is submitted', async () => {
    const alice = await as('a001@acme.test', 'employee');
    const bob = await as('b001@acme.test', 'employee');
    const overload = (await call('acme', 'GET', '/api/portal/tasks', { cookie: alice })).json().find((t: { kind: string }) => t.kind === 'overload');
    const url = `/api/portal/tasks/overload/${overload.id}`;
    expect(overload).toMatchObject({ hasDraft: false, draftSavedAt: null });
    expect((await call('acme', 'GET', url, { cookie: alice })).json()).toEqual({
      kind: 'overload', id: overload.id, title: '工時與工作型態調查', dueOn: null, hasDraft: false, draftSavedAt: null, done: false, draft: null,
    });
    expect((await call('acme', 'GET', url, { cookie: bob })).statusCode).toBe(404);
    expect((await call('acme', 'GET', `/api/portal/tasks/cbi/${overload.id}`, { cookie: alice })).json()).toMatchObject({ kind: 'cbi', done: true });
    expect((await call('acme', 'GET', `/api/portal/tasks/other/${overload.id}`, { cookie: alice })).statusCode).toBe(400);

    expect((await call('acme', 'PUT', `${url}/draft`, { cookie: alice, body: { answers: { overtime1m: 20 } } })).json()).toEqual({ answers: { overtime1m: 20 }, savedAt: expect.any(String) });
    await call('acme', 'PUT', `${url}/draft`, { cookie: alice, body: { answers: { overtime1m: 30, overtime6mAvg: 12 } } });
    expect((await call('acme', 'GET', url, { cookie: alice })).json()).toMatchObject({
      hasDraft: true, draftSavedAt: expect.any(String), draft: { answers: { overtime1m: 30, overtime6mAvg: 12 }, savedAt: expect.any(String) },
    });
    expect((await call('acme', 'GET', '/api/portal/tasks', { cookie: alice })).json().find((t: { id: string }) => t.id === overload.id))
      .toMatchObject({ hasDraft: true, draftSavedAt: expect.any(String) });
    expect((await call('acme', 'PUT', `${url}/draft`, { cookie: bob, body: { answers: {} } })).statusCode).toBe(404);
    expect((await call('acme', 'PUT', `${url}/draft`, { cookie: alice, body: { answers: { note: 'x'.repeat(25_000) } } })).json()).toMatchObject({ code: 'draft_too_large' });
    expect((await call('acme', 'PUT', `/api/portal/tasks/acknowledgement/${overload.id}/draft`, { cookie: alice, body: { answers: {} } })).statusCode).toBe(400);

    // The CBI is in but there is no health check yet, so the risk cannot be judged; the reasons say why.
    expect((await call('acme', 'GET', '/api/portal/health', { cookie: alice })).json().workload[0]).toMatchObject({ riskLevel: null, missing: ['overload', 'exam'] });
    expect((await call('acme', 'PUT', `/api/portal/workload/${overload.id}/overload`, { cookie: alice, body: { overtime1m: 30, overtime6mAvg: 12, workPatterns: [] } })).json()).toEqual({ submitted: true });
    expect((await call('acme', 'GET', url, { cookie: alice })).json()).toMatchObject({ done: true, draft: null });
    expect(await owner.select().from(portalDrafts).where(eq(portalDrafts.taskId, overload.id))).toEqual([]);
    expect((await call('acme', 'PUT', `${url}/draft`, { cookie: alice, body: { answers: {} } })).json()).toMatchObject({ code: 'already_submitted' });
    expect((await call('acme', 'GET', '/api/portal/health', { cookie: alice })).json().workload[0]).toMatchObject({ riskLevel: null, missing: ['exam'] });

    // A draft can be discarded, and a nurse entering the answers removes it too.
    const bobNmq = (await call('acme', 'GET', '/api/portal/tasks', { cookie: bob })).json().find((t: { kind: string }) => t.kind === 'nmq').id;
    await call('acme', 'PUT', `/api/portal/tasks/nmq/${bobNmq}/draft`, { cookie: bob, body: { answers: { neck: 2 } } });
    expect((await call('acme', 'DELETE', `/api/portal/tasks/nmq/${bobNmq}/draft`, { cookie: bob })).statusCode).toBe(204);
    expect((await call('acme', 'GET', `/api/portal/tasks/nmq/${bobNmq}`, { cookie: bob })).json().draft).toBeNull();
    await call('acme', 'PUT', `/api/portal/tasks/nmq/${bobNmq}/draft`, { cookie: bob, body: { answers: { neck: 3 } } });
    expect((await call('acme', 'PUT', `/api/programs/ergo/surveys/${bobNmq}`, { cookie: await nurse(), body: fullNmq({ neck: 3 }) })).statusCode).toBe(200);
    expect(await owner.select().from(portalDrafts).where(eq(portalDrafts.taskId, bobNmq))).toEqual([]);
  });

  it("titles tasks in the employee's language, which they can change", async () => {
    const bob = await as('b001@acme.test', 'employee');
    expect((await call('acme', 'PUT', '/api/portal/profile', { cookie: bob, body: { lang: 'vi' } })).json()).toMatchObject({ empNo: 'B001', lang: 'vi' });
    expect((await call('acme', 'PUT', '/api/portal/profile', { cookie: bob, body: { lang: 'fr' } })).statusCode).toBe(400);
    expect((await call('acme', 'GET', '/api/portal/tasks', { cookie: bob })).json().map((t: { title: string }) => t.title).sort())
      .toEqual(['Bảng câu hỏi về tình trạng kiệt sức', 'Khảo sát giờ làm việc và hình thức làm việc']);
    const b = await empId('B001');
    expect(await owner.select().from(auditLog).where(and(eq(auditLog.employeeId, b), eq(auditLog.reason, 'portal language vi')))).toHaveLength(1);
    await call('acme', 'PUT', '/api/portal/profile', { cookie: bob, body: { lang: 'zh' } });
    expect((await call('acme', 'GET', '/api/portal/tasks', { cookie: bob })).json().map((t: { title: string }) => t.title)).toContain('過勞量表');
  });

  it('gives employees their own health data and an export, and nothing of anyone else', async () => {
    const someone = completeWorkload[0]!.a.empId;
    const mine = await as(`${someone.toLowerCase()}@acme.test`, 'employee');
    const health = (await call('acme', 'GET', '/api/portal/health', { cookie: mine })).json();
    expect(health.exams).toHaveLength(1);
    expect(health.workload[0]).toMatchObject({ riskLevel: completeWorkload[0]!.w.riskLevel, missing: [] });
    expect(health.exams[0].items[0]).toEqual({ code: 'B0111', name: '血壓－收縮壓', unit: 'mmHg', value: expect.any(String), grade: null });
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

  it('lists answers with site and department, tracks suspected hazards, and reminds those who have not filled in', async () => {
    const dispatches = (await call('acme', 'GET', '/api/programs/ergo/dispatches', { cookie: await nurse() })).json();
    const first = dispatches.find((d: { name: string }) => d.name === '2026 下半年 NMQ');
    const surveys = (await call('acme', 'GET', `/api/programs/ergo/dispatches/${first.id}/surveys`, { cookie: await nurse() })).json();
    const suspected = surveys.find((x: { suspectedHazard: boolean }) => x.suspectedHazard);
    const fine = surveys.find((x: { suspectedHazard: boolean }) => x.suspectedHazard === false);
    expect(suspected).toMatchObject({ siteId: ids.s1, site: '桃園廠', departmentId: ids.d1, department: '製造一課', answers: { scores: expect.any(Object), yesNo: {} }, reminders: 0, tracking: null });

    const tracking = { measures: ['工作站高度調整'], note: '', nextOn: '2026-11-01', status: '列管中' };
    expect((await call('acme', 'PUT', `/api/programs/ergo/surveys/${suspected.id}/tracking`, { cookie: await nurse(), body: tracking })).json()).toMatchObject({ tracking });
    expect((await call('acme', 'PUT', `/api/programs/ergo/surveys/${fine.id}/tracking`, { cookie: await nurse(), body: tracking })).json()).toMatchObject({ code: 'not_suspected' });
    expect((await call('acme', 'PUT', `/api/programs/ergo/surveys/${suspected.id}/tracking`, { cookie: await nurse(), body: { status: '已改善' } })).statusCode).toBe(400);

    const [protoEmployee] = proto.ergo;
    const pending = (await call('acme', 'POST', '/api/programs/ergo/dispatches', {
      cookie: await nurse(), body: { name: '補填', employeeIds: [await empId(protoEmployee!.empId), await empId('OLD01')] },
    })).json();
    await owner.update(employees).set({ email: null }).where(eq(employees.empNo, 'OLD01'));
    const before = sent.length;
    const res = (await call('acme', 'POST', `/api/programs/ergo/dispatches/${pending.id}/remind`, { cookie: await nurse(), body: {} })).json();
    await owner.update(employees).set({ email: 'old01@acme.test' }).where(eq(employees.empNo, 'OLD01'));
    expect(res).toEqual({ emailed: 1, delivered: false, noEmail: [await empId('OLD01')] });
    expect(sent.slice(before).map(m => m.to)).toEqual([`${protoEmployee!.empId.toLowerCase()}@acme.test`]);
    expect(sent.at(-1)!.text).toContain('http://acme.care.test/me/');
    const after = (await call('acme', 'GET', `/api/programs/ergo/dispatches/${pending.id}/surveys`, { cookie: await nurse() })).json();
    expect(after.map((x: { empNo: string; reminders: number }) => [x.empNo, x.reminders]).sort()).toEqual([[protoEmployee!.empId, 1], ['OLD01', 0]].sort());
  });
});

describe('maternal protection, confirmations and sign links', () => {
  it('lets 職安衛 assess environments, and suggests the management level', async () => {
    const safety = await as('safety@acme.test');
    const env = await call('acme', 'POST', '/api/programs/maternal/env-assessments', {
      cookie: safety, body: {
        siteId: ids.s1, departmentId: ids.d1, area: '塗裝線', shiftType: '輪班', assessedOn: '2026-09-15',
        hazards: { 物理性危害: { v: '無' }, 化學性危害: { v: '可能有影響', note: '有機溶劑' } },
      },
    });
    expect(env.statusCode, env.body).toBe(201);
    expect(env.json()).toMatchObject({ departmentId: ids.d1, shiftType: '輪班', level: '第二級管理' });
    expect((await call('acme', 'GET', '/api/programs/maternal/env-assessments', { cookie: safety })).json()).toEqual([expect.objectContaining({ id: env.json().id, departmentId: ids.d1, shiftType: '輪班' })]);
    ids.env = env.json().id;
    expect((await call('acme', 'POST', '/api/programs/maternal/env-assessments', { cookie: safety, body: { siteId: ids.s2, area: 'x', assessedOn: '2026-09-15', hazards: { a: { v: '有' } } } })).statusCode).toBe(403);
    expect((await call('acme', 'POST', '/api/programs/maternal/env-assessments', {
      cookie: safety, body: { siteId: ids.s1, departmentId: ids.d2, area: 'x', assessedOn: '2026-09-15', hazards: { a: { v: '有' } } },
    })).json()).toMatchObject({ code: 'unknown_department' });
    for (const url of ['/api/programs/maternal/cases', '/api/programs/work-advice', '/api/programs/ergo/dispatches', '/api/programs/violence/incidents']) {
      expect((await call('acme', 'GET', url, { cookie: safety })).statusCode, url).toBe(403);
    }
  });

  it('records a maternal case and interview, and lets the employee confirm once through a link', async () => {
    const a = await empId('A001');
    const c = (await call('acme', 'POST', '/api/programs/maternal/cases', {
      cookie: await nurse(), body: { employeeId: a, type: '妊娠', notifiedOn: '2026-09-20', dueDate: '2027-04-01', envAssessmentId: ids.env, detail: '孕吐嚴重' },
    })).json();
    expect(c).toMatchObject({
      empNo: 'A001', siteId: ids.s1, departmentId: ids.d1, departmentName: '製造一課', dueDate: '2027-04-01', birthDate: null, level: '第二級管理', detail: '孕吐嚴重',
    });
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
    // Mail is only logged in tests (EMAIL_PROVIDER=log), so staff are told to hand the link over themselves.
    expect(second.emailed).toBe(false);
    // Each link is emailed to the employee, in the portal language, with the link and no health content.
    const mails = sent.filter(m => m.to === 'a001@acme.test');
    expect(mails.map(m => m.subject)).toEqual(['請確認健康服務紀錄', '請確認健康服務紀錄']);
    expect(mails[1]!.text).toContain(second.url);
    expect(mails.map(m => m.text).join()).not.toMatch(/118\/76|塗裝|有機溶劑|母性/);
    expect((await owner.select().from(notifications).where(eq(notifications.recipientEmail, 'a001@acme.test'))).map(n => [n.template, n.status]))
      .toEqual([['acknowledgement', 'queued'], ['acknowledgement', 'queued']]);
    expect((await call('acme', 'GET', `/api/sign/${firstToken}`)).statusCode).toBe(410);
    expect((await call('globex', 'GET', `/api/sign/${token}`)).statusCode).toBe(410);

    const doc = await call('acme', 'GET', `/api/sign/${token}`);
    expect(doc.json()).toEqual({
      id: iv.acknowledgementId, kind: 'acknowledgement', document: 'employee_acknowledgements', title: '母性健康保護面談紀錄', lang: 'zh', confirmedAt: null, comment: null,
      content: { interviewedOn: '2026-09-25', fitAdvice: '可繼續工作，避免接觸有機溶劑', limits: ['不從事塗裝作業'], agreedArrangement: '調至組裝線' },
    });
    expect(JSON.stringify(doc.json())).not.toContain('118/76');
    expect((await call('acme', 'POST', `/api/sign/${token}`, { body: { comment: '了解' } })).json()).toMatchObject({ comment: '了解' });
    const reused = await call('acme', 'POST', `/api/sign/${token}`, { body: {} });
    expect([reused.statusCode, reused.json().code]).toEqual([410, 'token_used']);
    const [ack] = await owner.select().from(employeeAcknowledgements).where(eq(employeeAcknowledgements.id, iv.acknowledgementId));
    expect([ack!.tokenHash, ack!.confirmedAt]).toEqual([null, expect.any(Date)]);
    expect((await owner.select().from(auditLog).where(and(eq(auditLog.subjectTable, 'employee_acknowledgements'), eq(auditLog.actorEmployeeId, a))))).toHaveLength(2);

    // The case list carries each interview with its confirmation status, so links and notices can be sent later.
    const listed = (await call('acme', 'GET', '/api/programs/maternal/cases', { cookie: await nurse() })).json().find((x: { id: string }) => x.id === c.id);
    expect(listed).toMatchObject({ siteId: ids.s1, departmentId: ids.d1, departmentName: '製造一課' });
    expect(listed.interviews).toEqual([{
      id: iv.id, interviewedOn: '2026-09-25', fitAdvice: '可繼續工作，避免接觸有機溶劑', limits: ['不從事塗裝作業'], agreedArrangement: '調至組裝線',
      acknowledgement: { id: iv.acknowledgementId, sentAt: expect.any(String), confirmedAt: expect.any(String), comment: '了解' }, notices: [],
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
    await call('acme', 'PUT', '/api/portal/profile', { cookie: alice, body: { lang: 'en' } });
    const task = (await call('acme', 'GET', '/api/portal/tasks', { cookie: alice })).json().find((t: { kind: string }) => t.kind === 'acknowledgement');
    expect(task).toEqual({ kind: 'acknowledgement', id: iv.acknowledgementId, title: 'Maternal health protection interview record', dueOn: null, hasDraft: false, draftSavedAt: null });
    expect((await call('acme', 'GET', `/api/portal/tasks/acknowledgement/${iv.acknowledgementId}`, { cookie: alice })).json()).toMatchObject({ done: false, draft: null });
    expect((await call('acme', 'POST', `/api/portal/acknowledgements/${iv.acknowledgementId}/confirm`, { cookie: alice, body: {} })).json())
      .toMatchObject({ title: 'Maternal health protection interview record', confirmedAt: expect.any(String) });
    await call('acme', 'PUT', '/api/portal/profile', { cookie: alice, body: { lang: 'zh' } });
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
    expect(res.json().programme).toBe('母性健康保護');
    expect((await call('acme', 'POST', '/api/programs/notices', { cookie: await nurse(), body: { employeeId: a, managerUserId: ids['hr@acme.test'], subjectTable: 'maternal_interviews', subjectId: iv!.id, advice: 'x' } })).json())
      .toMatchObject({ code: 'not_a_manager' });
    const boss = await as('boss@acme.test');
    expect((await call('acme', 'GET', '/api/programs/notices/unread', { cookie: boss })).json()).toEqual({ unread: 1 });
    expect((await call('acme', 'GET', '/api/programs/notices/unread', { cookie: boss })).json()).toEqual({ unread: 1 });
    const notices = (await call('acme', 'GET', '/api/programs/notices', { cookie: boss })).json();
    // The manager is not told which programme: 母性健康保護 would tell them the employee may be pregnant.
    expect(notices).toEqual([expect.objectContaining({ empNo: 'A001', programme: '工作調整', advice: '請安排調至組裝線，不從事塗裝作業。' })]);
    expect(JSON.stringify(notices)).not.toMatch(/母性|妊娠|懷孕/);
    expect((await call('acme', 'GET', '/api/programs/notices/unread', { cookie: boss })).json()).toEqual({ unread: 0 });
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
      { id: ids['boss@acme.test'], name: '周課長', email: 'boss@acme.test', departmentIds: [ids.d1] },
      { id: ids['boss2@acme.test'], name: '林課長', email: 'boss2@acme.test', departmentIds: [] },
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
    expect(risk).toMatchObject({ departmentId: null, departmentName: null });
    const riskBody = { siteId: ids.s1, departmentId: ids.d1, assessedOn: '2026-09-02', items: [{ question: '是否有單獨夜間作業', likelihood: '可能', severity: '輕' }] };
    expect((await call('acme', 'POST', '/api/programs/violence/risk-assessments', { cookie: await as('safety@acme.test'), body: { ...riskBody, departmentId: ids.d2 } })).json())
      .toMatchObject({ code: 'unknown_department' });
    expect((await call('acme', 'POST', '/api/programs/violence/risk-assessments', { cookie: await as('safety@acme.test'), body: riskBody })).json())
      .toMatchObject({ departmentId: ids.d1, departmentName: '製造一課' });
    expect((await call('acme', 'GET', '/api/programs/violence/risk-assessments', { cookie: await as('safety@acme.test') })).json().map((r: { departmentName: string | null }) => r.departmentName))
      .toEqual(['製造一課', null]);
    const incidentBody = { occurredOn: '2026-09-10', siteId: ids.s1, type: '言語暴力', victimEmployeeId: await empId('B001'), detail: '課長當眾辱罵' };
    expect((await call('acme', 'POST', '/api/programs/violence/incidents', { cookie: await nurse(), body: { ...incidentBody, departmentId: ids.d2 } })).json())
      .toMatchObject({ code: 'unknown_department' });
    const incident = (await call('acme', 'POST', '/api/programs/violence/incidents', { cookie: await nurse(), body: incidentBody })).json();
    const [row] = await owner.select().from(violenceIncidents).where(eq(violenceIncidents.id, incident.id));
    expect(row!.detailEnc!.toString('utf8')).not.toContain('辱罵');
    expect((await call('acme', 'GET', '/api/programs/violence/incidents', { cookie: await nurse() })).json()[0].detail).toBe('課長當眾辱罵');
    expect((await call('acme', 'GET', '/api/programs/violence/incidents', { cookie: await as('nurse2@acme.test') })).json()).toEqual([]);
  });

  it('updates incidents and lists typed checklists', async () => {
    const [incident] = (await call('acme', 'GET', '/api/programs/violence/incidents', { cookie: await nurse() })).json();
    expect(incident).toEqual({
      id: expect.any(String), occurredOn: '2026-09-10', siteId: ids.s1, departmentId: null, departmentName: null, type: '言語暴力', victimEmployeeId: await empId('B001'),
      followUps: [], status: '處理中', detail: '課長當眾辱罵',
    });
    const placed = await call('acme', 'PATCH', `/api/programs/violence/incidents/${incident.id}`, { cookie: await nurse(), body: { departmentId: ids.d1 } });
    expect(placed.json()).toMatchObject({ departmentId: ids.d1, departmentName: '製造一課' });
    expect((await call('acme', 'GET', '/api/programs/violence/incidents', { cookie: await nurse() })).json()[0]).toMatchObject({ departmentId: ids.d1, departmentName: '製造一課' });
    expect((await call('acme', 'PATCH', `/api/programs/violence/incidents/${incident.id}`, { cookie: await nurse(), body: { departmentId: ids.d2 } })).json())
      .toMatchObject({ code: 'unknown_department' });
    const closed = await call('acme', 'PATCH', `/api/programs/violence/incidents/${incident.id}`, { cookie: await nurse(), body: { status: '結案', followUps: ['轉介心理諮商'] } });
    expect(closed.json()).toMatchObject({ status: '結案', followUps: ['轉介心理諮商'], detail: '課長當眾辱罵' });
    expect((await call('acme', 'PATCH', `/api/programs/violence/incidents/${incident.id}`, { cookie: await nurse(), body: { status: '不明' } })).statusCode).toBe(400);
    expect((await call('acme', 'PATCH', `/api/programs/violence/incidents/${incident.id}`, { cookie: await as('nurse2@acme.test'), body: { status: '處理中' } })).json())
      .toMatchObject({ code: 'outside_sites' });
    expect((await call('acme', 'PATCH', `/api/programs/violence/incidents/${incident.id}`, { cookie: await as('safety@acme.test'), body: { status: '處理中' } })).statusCode).toBe(403);

    const checklist = { kind: '作業場所', siteId: ids.s1, departmentId: ids.d1, checkedOn: '2026-09-02', items: [{ item: '照明充足', ok: true }] };
    expect((await call('acme', 'POST', '/api/programs/violence/checklists', { cookie: await as('safety@acme.test'), body: { ...checklist, departmentId: ids.d2 } })).json())
      .toMatchObject({ code: 'unknown_department' });
    await call('acme', 'POST', '/api/programs/violence/checklists', { cookie: await as('safety@acme.test'), body: checklist });
    expect((await call('acme', 'GET', '/api/programs/violence/checklists', { cookie: await as('safety@acme.test') })).json()).toEqual([{
      id: expect.any(String), kind: '作業場所', siteId: ids.s1, departmentId: ids.d1, departmentName: '製造一課', checkedOn: '2026-09-02', items: [{ item: '照明充足', ok: true, note: '' }],
    }]);
  });

  it('runs prevention reviews through the sign-off chain', async () => {
    await owner.execute(sql`update tenant_settings set value = '["職業安全衛生人員", "部門主管"]'::jsonb where tenant_id = ${ids.acme} and key = 'sign_off_roles'`);
    const safety = await as('safety@acme.test');
    const body = {
      siteId: ids.s1, departmentId: ids.d1, reviewedOn: '2026-09-20',
      items: [{ item: '辨識及評估危害', points: ['工作環境'], result: '已完成危害辨識', fix: '增設求助按鈕' }],
      signers: [{ role: '職業安全衛生人員', name: '吳工安', email: 'safety@acme.test' }, { role: '部門主管', name: '周課長', email: 'boss@acme.test' }],
    };
    expect((await call('acme', 'POST', '/api/programs/violence/reviews', { cookie: safety, body: { ...body, departmentId: ids.d2 } })).json()).toMatchObject({ code: 'unknown_department' });
    expect((await call('acme', 'POST', '/api/programs/violence/reviews', { cookie: safety, body: { ...body, signers: [{ role: '老闆', name: 'x', email: 'x@acme.test' }] } })).json())
      .toMatchObject({ code: 'unknown_sign_off_role' });
    const created = (await call('acme', 'POST', '/api/programs/violence/reviews', { cookie: safety, body })).json();
    expect(created).toMatchObject({
      siteName: '桃園廠', departmentName: '製造一課', status: '草稿', items: body.items,
      signatures: [{ role: '職業安全衛生人員', firstSentAt: null, sentAt: null }, { role: '部門主管', firstSentAt: null }],
    });
    const empty = (await call('acme', 'POST', '/api/programs/violence/reviews', { cookie: safety, body: { ...body, signers: [] } })).json();
    expect((await call('acme', 'POST', `/api/programs/violence/reviews/${empty.id}/submit`, { cookie: safety })).json()).toMatchObject({ code: 'no_signers' });
    expect((await call('acme', 'DELETE', `/api/programs/violence/reviews/${empty.id}`, { cookie: safety })).statusCode).toBe(204);

    const before = sent.length;
    const links = (await call('acme', 'POST', `/api/programs/violence/reviews/${created.id}/submit`, { cookie: safety })).json();
    expect(links).toHaveLength(2);
    expect(sent.slice(before).map(m => [m.to, m.subject])).toEqual([
      ['safety@acme.test', '請簽核執行職務遭受不法侵害預防措施查核及評估（桃園廠 2026-09-20）'],
      ['boss@acme.test', '請簽核執行職務遭受不法侵害預防措施查核及評估（桃園廠 2026-09-20）'],
    ]);
    expect((await call('acme', 'PUT', `/api/programs/violence/reviews/${created.id}`, { cookie: safety, body })).json()).toMatchObject({ code: 'not_draft' });
    expect((await call('acme', 'DELETE', `/api/programs/violence/reviews/${created.id}`, { cookie: safety })).json()).toMatchObject({ code: 'not_draft' });
    const token = (u: string) => u.split('/').pop()!;
    const doc = (await call('acme', 'GET', `/api/sign/${token(links[0].url)}`)).json();
    expect(doc).toMatchObject({
      kind: 'signature', document: 'violence_reviews', title: '執行職務遭受不法侵害預防措施查核及評估', lang: 'zh',
      content: { reviewedOn: '2026-09-20', site: '桃園廠', department: '製造一課', items: body.items, signer: { role: '職業安全衛生人員', name: '吳工安' } },
    });
    await call('acme', 'POST', `/api/sign/${token(links[0].url)}`, { body: {} });
    const resent = (await call('acme', 'POST', `/api/programs/violence/reviews/${created.id}/signatures/${links[1].signatureId}/resend`, { cookie: safety })).json();
    expect((await call('acme', 'GET', `/api/sign/${token(links[1].url)}`)).statusCode).toBe(410);
    await call('acme', 'POST', `/api/sign/${token(resent.url)}`, { body: { comment: '已閱' } });
    const [done] = (await call('acme', 'GET', '/api/programs/violence/reviews', { cookie: safety })).json();
    expect(done).toMatchObject({ status: '已完成', signatures: [{ signedAt: expect.any(String), firstSentAt: expect.any(String) }, { comment: '已閱' }] });
    expect((await call('acme', 'GET', '/api/programs/violence/reviews', { cookie: await as('nurse2@acme.test') })).json()).toEqual([]);
    expect((await call('acme', 'GET', '/api/programs/violence/reviews', { cookie: await as('hr@acme.test') })).statusCode).toBe(403);
  });

  it('gives staff the choices of the programme forms', async () => {
    const options = (await call('acme', 'GET', '/api/programs/options', { cookie: await as('safety@acme.test') })).json();
    expect(options).toMatchObject({
      workPatterns: expect.arrayContaining(['輪班或夜班工作']), workloadFitness: ['一般工作', '工作限制', '需休假'], adjustHours: expect.arrayContaining(['限制加班']),
      changeWork: expect.arrayContaining(['調整為常日班']), ergoMeasures: expect.arrayContaining(['提供搬運輔具']), specialOperations: expect.arrayContaining(['噪音作業']),
      shiftTypes: ['常日班', '輪班', '其他'],
    });
    expect((await call('acme', 'GET', '/api/programs/options', { cookie: await as('a001@acme.test', 'employee') })).statusCode).toBe(403);
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
