/*
 * Local development only: load the prototype's fictional demo data (prototype/data.js) into the "demo" tenant, so every
 * page and report has something to show. Employees, health checks, the four programmes, assistance records, events and
 * cases. Medical text is encrypted with TENANT_CRYPTO_LOCAL_KEY. Runs as the table owner (DATABASE_URL); run db:seed
 * first. Skips if the prototype's employees are already there. Never point it at a real database.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  assistRecords, caseEvents, cases, createDb, departments, employeeAcknowledgements, employees, ergoDispatches, ergoSurveys, gradingRuleSets, healthExamResults, healthExams,
  interviews, legalEntities, maternalCases, sites, tenants, users, userSiteScopes, workloadAssessments,
} from '@yutis/db';
import { EXAM_ITEMS, examRetainUntil } from '@yutis/domain';
import { and, desc, eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { LocalTenantCrypto } from '../src/core/crypto.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

const url = process.env.DATABASE_URL;
const key = process.env.TENANT_CRYPTO_LOCAL_KEY;
if (!url || !key) throw new Error('DATABASE_URL (table owner) and TENANT_CRYPTO_LOCAL_KEY are required (apps/api/.env)');
const crypto = new LocalTenantCrypto(Buffer.from(key, 'base64'));

// Run the whole prototype in a sandbox and take its seeded state.
const dir = fileURLToPath(new URL('../../../prototype/', import.meta.url));
const stub = (): unknown => new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), set: () => true });
const sandbox = vm.createContext({
  console, document: stub(), window: stub(), history: stub(), navigator: {}, location: { hash: '' }, setTimeout: () => 0, addEventListener() {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, matchMedia: () => ({ matches: false, addEventListener() {} }),
});
vm.runInContext(`${['data.js', 'logic.js', 'app.js', 'programs.js', 'more.js'].map(f => readFileSync(dir + f, 'utf8')).join('\n;\n')}
;globalThis.out = {
  org: ORG, employees: S.employees, reports: S.reports.map(r => ({ r, g: gradeReport(r) })), workload: S.workload.map(a => ({ a, w: evalWorkload(a) })),
  ergo: S.ergo, records: S.records, matCases: S.matCases, events: allEvents(), cases: S.cases,
};`, sandbox);
const P = JSON.parse(JSON.stringify((sandbox as { out: unknown }).out)) as {
  org: Any; employees: Any[]; reports: { r: Any; g: Any }[]; workload: { a: Any; w: Any }[]; ergo: Any[]; records: Any[]; matCases: Any[]; events: Any[]; cases: Record<string, Any>;
};

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = createDb(pool);
const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'demo'));
if (!tenant) throw new Error('No "demo" tenant: run pnpm --filter @yutis/api db:seed first');
const tenantId = tenant.id;
const enc = async (text: string | null | undefined) => (text ? crypto.encrypt(tenantId, text) : null);

const [already] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.empNo, P.employees[0]!.empNo)));
if (already) {
  console.log('Prototype demo data is already in the "demo" tenant; nothing to do.');
  await pool.end();
  process.exit(0);
}

await db.transaction(async tx => {
  // Grading standard: the demo tenant was created by db:seed, not by platform onboarding.
  if (!(await tx.select().from(gradingRuleSets).where(eq(gradingRuleSets.tenantId, tenantId))).length) {
    await tx.execute(sql`select apply_default_templates(${tenantId})`);
  }
  const [ruleSet] = await tx.select().from(gradingRuleSets).where(and(eq(gradingRuleSets.tenantId, tenantId), eq(gradingRuleSets.status, 'published'))).orderBy(desc(gradingRuleSets.version));

  // Organisation: reuse the demo tenant's 桃園廠 (TY) and 新竹廠 (HC), add the prototype's other legal entity and site.
  const [demoLe] = await tx.select().from(legalEntities).where(eq(legalEntities.tenantId, tenantId));
  const leId = new Map<string, string>([['L1', demoLe!.id]]);
  for (const e of P.org.entities.slice(1)) {
    const [row] = await tx.insert(legalEntities).values({ tenantId, code: e.code, name: e.name }).returning();
    leId.set(e.id, row!.id);
  }
  const siteId = new Map<string, string>();
  for (const s of P.org.sites) {
    const [existing] = await tx.select().from(sites).where(and(eq(sites.tenantId, tenantId), eq(sites.code, s.code)));
    siteId.set(s.id, existing?.id ?? (await tx.insert(sites).values({ tenantId, legalEntityId: leId.get(s.entity)!, code: s.code, name: s.name, address: s.address }).returning())[0]!.id);
  }
  const deptId = new Map<string, string>();
  for (const d of P.org.depts) {
    const [existing] = await tx.select().from(departments).where(and(eq(departments.siteId, siteId.get(d.site)!), eq(departments.name, d.name)));
    deptId.set(d.id, existing?.id ?? (await tx.insert(departments).values({
      tenantId, siteId: siteId.get(d.site)!, code: d.id, name: d.name, managerName: d.mgr, managerEmail: d.mgrEmail, managerPhone: d.mgrTel,
    }).returning())[0]!.id);
  }

  // The prototype's staff map onto the demo tenant's accounts.
  const staffRows = await tx.select().from(users).where(eq(users.tenantId, tenantId));
  const byEmail = (email: string) => staffRows.find(u => u.email === email)!.id;
  const staffId: Record<string, string> = {
    U1: byEmail('nurse@demo.test'), U2: byEmail('nurse@demo.test'), U6: byEmail('nurse@demo.test'),
    U3: byEmail('doctor@demo.test'), U7: byEmail('doctor@demo.test'), U4: byEmail('safety@demo.test'), U5: byEmail('hr@demo.test'),
  };
  // 張醫師 covers the new 台北總部 too.
  await tx.insert(userSiteScopes).values({ tenantId, userId: byEmail('doctor@demo.test'), siteId: siteId.get('S3')! }).onConflictDoNothing();

  const empId = new Map<string, string>();
  for (const e of P.employees) {
    const [row] = await tx.insert(employees).values({
      tenantId, empNo: e.empNo, name: e.name, sex: e.sex, birthDate: e.birth, legalEntityId: leId.get(e.entity)!, siteId: siteId.get(e.site)!, departmentId: deptId.get(e.dept)!,
      title: e.title, shift: e.shift, examCategory: e.hcCat, lang: e.lang ?? 'zh', hireDate: e.hire || null, email: e.email, phone: e.phone, status: e.status ?? '在職',
    }).returning();
    empId.set(e.id, row!.id);
  }

  const examId = new Map<string, string>();
  for (const { r, g } of P.reports) {
    const special = !!r.special;
    const [exam] = await tx.insert(healthExams).values({
      tenantId, employeeId: empId.get(r.empId)!, examDate: r.date, clinic: r.clinic, kind: r.kind, ruleSetId: ruleSet!.id, gradeTotal: g.total, gradeMax: g.max,
      smoker: !!r.life?.smoke, lifestyle: r.life ?? null, specialHazard: r.special?.hazard ?? null, specialLevel: r.special?.level ?? null,
      historyEnc: await enc(r.history), symptomsEnc: await enc(r.symptoms), workNoteEnc: await enc(r.work), retainUntil: examRetainUntil(r.date, special),
    }).returning();
    examId.set(r.id, exam!.id);
    const results = g.items.filter((i: Any) => i.v != null);
    if (results.length) {
      await tx.insert(healthExamResults).values(results.map((i: Any) => ({
        tenantId, examId: exam!.id, itemCode: EXAM_ITEMS.find(x => x.key === i.key)!.code, grade: i.lv,
        ...(typeof i.v === 'string' ? { valueText: i.v } : { valueNum: String(i.v) }),
      })));
    }
  }

  const assessmentId = new Map<string, string>();
  const num = (v: unknown) => (v == null ? null : String(v));
  for (const { a, w } of P.workload) {
    const [row] = await tx.insert(workloadAssessments).values({
      tenantId, employeeId: empId.get(a.empId)!, sentOn: a.sentAt ?? a.date, personalBurnout: num(a.pf), workBurnout: num(a.wf),
      fatigueAt: a.fatigueAt ? new Date(`${a.fatigueAt}T09:00:00+08:00`) : null, fatigueBy: a.fatigueAt ? 'self' : null,
      overtime1m: num(a.m1), overtime6mAvg: num(a.avg6), workPatterns: a.patterns ?? [], overloadAt: a.overloadAt ? new Date(`${a.overloadAt}T09:00:00+08:00`) : null,
      evaluation: w, riskLevel: w.complete ? w.riskLevel : null, ruleVersion: 'workload-v1',
    }).returning();
    assessmentId.set(a.id, row!.id);
    const iv = a.interview;
    if (iv && iv.status) {
      const [saved] = await tx.insert(interviews).values({
        tenantId, assessmentId: row!.id, status: iv.status, interviewedOn: iv.date || null, doctorUserId: staffId[iv.doctor] ?? null,
        workAdvice: { fitness: iv.work ?? '', restrictions: [], suggestion: iv.note ?? '', adjustHours: iv.adjustHours ?? '', changeWork: iv.changeWork ?? '', period: iv.period ?? '' },
        guidanceEnc: iv.status === '已面談' ? await enc(JSON.stringify({
          fatigue: iv.fatigue || null, mentalConcern: iv.mind || null, diagnosis: iv.diag || null, guidance: iv.guide || null,
          needMeasure: iv.needMeasure ? iv.needMeasure === '是' : null, seeDoctor: iv.seeDoctor ?? '', special: iv.special ?? '',
        })) : null,
        nextOn: iv.nextDate || null,
      }).returning({ id: interviews.id });
      if (iv.status === '已面談') {
        await tx.insert(employeeAcknowledgements).values({
          tenantId, employeeId: empId.get(a.empId)!, subjectTable: 'interviews', subjectId: saved!.id,
          sentAt: iv.signSent ? new Date(`${iv.signSent}T09:00:00+08:00`) : null,
        });
      }
    }
  }

  const dispatchId = new Map<string, string>();
  const surveyId = new Map<string, string>();
  for (const s of P.ergo) {
    if (!dispatchId.has(s.batch)) {
      dispatchId.set(s.batch, (await tx.insert(ergoDispatches).values({ tenantId, name: `肌肉骨骼症狀調查（${s.batch}）`, sentOn: s.sentAt ?? s.date }).returning())[0]!.id);
    }
    const max = s.nmq ? Math.max(...Object.values(s.nmq as Record<string, number>)) : null;
    const [row] = await tx.insert(ergoSurveys).values({
      tenantId, dispatchId: dispatchId.get(s.batch)!, employeeId: empId.get(s.empId)!, status: s.status, lang: s.lang ?? 'zh', formVersion: 'nmq-v1',
      answers: s.nmq ? { scores: s.nmq, yesNo: {} } : null, maxScore: max, suspectedHazard: max == null ? null : max >= 3,
      filledAt: s.filledAt ? new Date(`${s.filledAt}T12:00:00+08:00`) : null, filledBy: s.filledBy ?? null, reminders: s.remind ?? 0,
    }).returning();
    surveyId.set(s.id, row!.id);
  }

  for (const r of P.records) {
    await tx.insert(assistRecords).values({
      tenantId, employeeId: empId.get(r.empId)!, category: r.cat, occurredAt: new Date(`${r.date}T${r.time || '10:00'}:00+08:00`),
      consultTypes: r.types ?? [], lifestyleAdvice: r.lifestyle ?? [],
      contentEnc: await crypto.encrypt(tenantId, JSON.stringify({ explain: r.explain ?? '', handling: r.handling ?? '', note: r.note ?? '' })),
      helpers: (r.helpers ?? []).map((h: Any) => ({ userId: staffId[h.staff] ?? staffId.U1, minutes: h.min })),
      result: r.result ?? '結案', followUpOn: r.follow?.date ?? null, followUpUserId: r.follow ? staffId[r.follow.staff] ?? null : null,
      followUpDone: !!r.followDone, draft: !!r.draft,
    });
  }

  const maternalId = new Map<string, string>();
  for (const m of P.matCases) {
    const [row] = await tx.insert(maternalCases).values({
      tenantId, employeeId: empId.get(m.empId)!, type: m.type === '產後一年內' ? '產後' : m.type, notifiedOn: m.notifyDate, dueDate: m.due || null, birthDate: m.birthDate || null,
      level: m.env?.level ?? null, detailEnc: await enc([...(m.self?.items ?? []), m.self?.note].filter(Boolean).join('；')),
    }).returning();
    maternalId.set(m.id, row!.id);
  }

  // Events, linked to the rows that raised them, then the prototype's cases.
  const source = (key: string, empNoId: string): { table: string; id: string } => {
    const [type, ref] = key.split(':') as [string, string];
    const found = { hc: ['health_exams', examId.get(ref)], sp: ['health_exams', examId.get(ref)], wl: ['workload_assessments', assessmentId.get(ref)],
      er: ['ergo_surveys', surveyId.get(ref)], mat: ['maternal_cases', maternalId.get(ref)], age: ['employees', empId.get(empNoId)] }[type];
    return { table: found?.[0] ?? 'prototype', id: found?.[1] ?? randomUUID() };
  };
  const eventRows = [];
  for (const e of P.events) {
    const src = source(e.key, e.empId);
    const [row] = await tx.insert(caseEvents).values({
      tenantId, employeeId: empId.get(e.empId)!, type: e.type, sourceTable: src.table, sourceId: src.id, occurredOn: e.date ?? '2026-01-01', description: e.desc, status: e.status,
    }).onConflictDoNothing().returning();
    if (row) eventRows.push(row);
  }
  for (const [protoEmp, c] of Object.entries(P.cases)) {
    const employeeId = empId.get(protoEmp);
    if (!employeeId) continue;
    const [row] = await tx.insert(cases).values({
      tenantId, employeeId, status: c.status, leadUserId: staffId[c.nurse] ?? null, openedOn: c.openDate, noticeOn: c.noticeDate || null,
      plannedOn: c.plannedDate || null, repliedOn: c.replyDate || null, agreed: c.agree == null ? null : c.agree === '同意', closedOn: c.closedDate || null,
    }).returning();
    const linked = eventRows.filter(e => e.employeeId === employeeId && e.status !== '未開單').map(e => e.id);
    for (const id of linked) await tx.update(caseEvents).set({ caseId: row!.id }).where(eq(caseEvents.id, id));
  }

  console.log(`Loaded ${P.employees.length} employees, ${P.reports.length} health checks, ${P.workload.length} overwork assessments, ${P.ergo.length} NMQ surveys, `
    + `${P.records.length} assistance records, ${P.matCases.length} maternal cases, ${eventRows.length} events and ${Object.keys(P.cases).length} cases into "demo".`);
});
await pool.end();
