/*
 * The 16 statistical reports (統計分析報表) of the prototype (prototype/more.js REPORTS), computed from the database for
 * the employees in the viewer's sites. Rows, columns and summaries reproduce the prototype's exactly (tested against it).
 *
 * De-identified view (職安衛人員、人資): counts from 1 to MIN_CELL_SIZE − 1 are hidden, with the percentages derived
 * from them, and one more cell is hidden wherever a single hidden cell could be worked out by subtraction. A report
 * whose whole population is below MIN_CELL_SIZE shows no numbers at all.
 */
import {
  assistRecords, caseEvents, departments, employees, ergoSurveys, healthExamResults, healthExams, sites, workloadAssessments, type Tx,
} from '@yutis/db';
import {
  ASSIST_CATEGORIES, CASE_STATUSES, EVENT_TYPES, EXAM_ITEMS, NMQ_KEYS, nmqPartLabel, RISK_LABEL, WORK_PATTERNS, type CvdResult,
} from '@yutis/domain';
import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';

/** Smallest group size shown to non-clinical roles (架構文件：小於 5 人的格子不顯示). */
export const MIN_CELL_SIZE = 5;

export const REPORT_TYPES = {
  health: [['grade', '健管級數占比分析'], ['trend', '健管級數年度變化（母群體相同）'], ['events', '個案事件統計（事件）'], ['status', '個案事件狀態統計'],
    ['items', '分級異常前 5 大項目比較'], ['depts', '分級異常前 5 大部門比較'], ['records', '面談次數統計（協助類別）']],
  wl: [['cvd', '十年內心血管疾病'], ['risk', '職業促發腦心血管疾病'], ['fatigue', '過勞量表'], ['ot', '長時間工作'], ['pattern', '工作型態評估'], ['smoke', '吸菸']],
  ergo: [['part', '部位異常占比比較'], ['dept', '部門異常比較'], ['fill', '問卷填答率']],
} as const;
export type ReportKind = keyof typeof REPORT_TYPES;

export type Cell = string | number | null;
export interface Report {
  kind: ReportKind;
  type: string;
  title: string;
  summary: { label: string; value: Cell }[];
  columns: string[];
  rows: Cell[][];
  /** True when cells were hidden for a de-identified view. */
  suppressed: boolean;
}

export interface ReportFilters { legalEntityId?: string; siteId?: string; departmentId?: string }

const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) : '0.0');
const sum = (pairs: [Cell, string][]) => pairs.map(([value, label]) => ({ label, value }));

interface Data {
  emps: { id: string; departmentId: string }[];
  depts: { id: string; label: string }[];
  /** Exams per employee, newest first. */
  exams: Map<string, { id: string; gradeMax: number; smoker: boolean | null }[]>;
  /** Item grades of each employee's latest exam. */
  latestGrades: Map<string, Map<string, number | null>>;
  events: { employeeId: string; type: string; status: string }[];
  records: { category: string; minutes: number }[];
  assessments: {
    employeeId: string; pf: number | null; wf: number | null; m1: number | null; avg6: number | null; patterns: string[];
    evaluation: { complete: boolean; riskLevel?: number; cvd: CvdResult | null } | null;
  }[];
  surveys: { employeeId: string; status: string; scores: Record<string, number> | null }[];
}

export async function loadReportData(tx: Tx, siteIds: string[], f: ReportFilters): Promise<Data> {
  const empty: Data = { emps: [], depts: [], exams: new Map(), latestGrades: new Map(), events: [], records: [], assessments: [], surveys: [] };
  if (!siteIds.length) return empty;
  const where: SQL[] = [inArray(employees.siteId, siteIds)];
  if (f.legalEntityId) where.push(eq(employees.legalEntityId, f.legalEntityId));
  if (f.siteId) where.push(eq(employees.siteId, f.siteId));
  if (f.departmentId) where.push(eq(employees.departmentId, f.departmentId));
  const emps = await tx.select({ id: employees.id, departmentId: employees.departmentId }).from(employees).where(and(...where));
  if (!emps.length) return empty;
  const ids = emps.map(e => e.id);
  const depts = (await tx.select({ id: departments.id, name: departments.name, site: sites.name }).from(departments).innerJoin(sites, eq(sites.id, departments.siteId))
    .orderBy(asc(sites.code), asc(departments.code), asc(departments.name))).map(d => ({ id: d.id, label: `${d.site}／${d.name}` }));
  const examRows = await tx.select({ id: healthExams.id, employeeId: healthExams.employeeId, examDate: healthExams.examDate, gradeMax: healthExams.gradeMax, smoker: healthExams.smoker })
    .from(healthExams).where(inArray(healthExams.employeeId, ids));
  const exams = new Map<string, { id: string; gradeMax: number; smoker: boolean | null }[]>();
  for (const e of [...examRows].sort((a, b) => b.examDate.localeCompare(a.examDate))) {
    exams.set(e.employeeId, [...(exams.get(e.employeeId) ?? []), { id: e.id, gradeMax: e.gradeMax, smoker: e.smoker }]);
  }
  const latestIds = [...exams.values()].map(list => list[0]!.id);
  const results = latestIds.length ? await tx.select({ examId: healthExamResults.examId, itemCode: healthExamResults.itemCode, grade: healthExamResults.grade })
    .from(healthExamResults).where(inArray(healthExamResults.examId, latestIds)) : [];
  const latestGrades = new Map<string, Map<string, number | null>>();
  for (const [employeeId, list] of exams) {
    latestGrades.set(employeeId, new Map(results.filter(r => r.examId === list[0]!.id).map(r => [r.itemCode, r.grade])));
  }
  const events = await tx.select({ employeeId: caseEvents.employeeId, type: caseEvents.type, status: caseEvents.status }).from(caseEvents).where(inArray(caseEvents.employeeId, ids));
  const records = (await tx.select({ category: assistRecords.category, helpers: assistRecords.helpers }).from(assistRecords)
    .where(and(inArray(assistRecords.employeeId, ids), eq(assistRecords.draft, false))))
    .map(r => ({ category: r.category, minutes: (r.helpers as { minutes: number }[]).reduce((t, h) => t + h.minutes, 0) }));
  const num = (v: string | null) => (v === null ? null : Number(v));
  const assessments = (await tx.select().from(workloadAssessments).where(inArray(workloadAssessments.employeeId, ids))).map(a => ({
    employeeId: a.employeeId, pf: num(a.personalBurnout), wf: num(a.workBurnout), m1: num(a.overtime1m), avg6: num(a.overtime6mAvg), patterns: a.workPatterns,
    evaluation: a.evaluation as Data['assessments'][number]['evaluation'],
  }));
  const surveys = (await tx.select({ employeeId: ergoSurveys.employeeId, status: ergoSurveys.status, answers: ergoSurveys.answers }).from(ergoSurveys)
    .where(inArray(ergoSurveys.employeeId, ids))).map(s => ({ employeeId: s.employeeId, status: s.status, scores: (s.answers as { scores?: Record<string, number> } | null)?.scores ?? null }));
  return { emps, depts, exams, latestGrades, events, records, assessments, surveys };
}

type Computed = Omit<Report, 'kind' | 'type' | 'title' | 'suppressed'>;

const COMPUTE: { [K in ReportKind]: Record<(typeof REPORT_TYPES)[K][number][0], (d: Data) => Computed> } = {
  health: {
    grade(d) {
      const gs = d.emps.map(e => d.exams.get(e.id)?.[0]).filter(x => x !== undefined);
      const rows = [1, 2, 3, 4].map(l => ({ k: `第 ${l} 級`, n: gs.filter(g => g.gradeMax === l).length }));
      const high = rows[2]!.n + rows[3]!.n;
      return { summary: sum([[gs.length, '受檢人數'], [high, '3–4 級人數'], [`${pct(high, gs.length)}%`, '3–4 級占比']]), columns: ['最大級', '人數', '百分比'], rows: rows.map(r => [r.k, r.n, `${pct(r.n, gs.length)}%`]) };
    },
    trend(d) {
      const pairs = d.emps.map(e => d.exams.get(e.id) ?? []).filter(rs => rs.length >= 2).map(rs => [rs[1]!.gradeMax, rs[0]!.gradeMax] as const);
      const cnt = (k: 0 | 1, l: number) => pairs.filter(p => p[k] === l).length;
      return {
        summary: sum([[pairs.length, '兩年皆受檢人數'], [pairs.filter(p => p[1] > p[0]).length, '級數上升'], [pairs.filter(p => p[1] < p[0]).length, '級數下降']]),
        columns: ['最大級', '前次人數', '本次人數'], rows: [1, 2, 3, 4].map(l => [`第 ${l} 級`, cnt(0, l), cnt(1, l)]),
      };
    },
    events(d) {
      const rows = Object.entries(EVENT_TYPES).map(([k, t]) => ({ k: t.label, n: d.events.filter(e => e.type === k).length })).sort((a, b) => b.n - a.n);
      return {
        summary: sum([[d.events.length, '事件數'], [new Set(d.events.map(e => e.employeeId)).size, '涉及人數']]),
        columns: ['事件', '次數', '百分比'], rows: rows.map(r => [r.k, r.n, `${pct(r.n, d.events.length)}%`]),
      };
    },
    status(d) {
      const rows = CASE_STATUSES.map(s => ({ k: s, n: d.events.filter(e => e.status === s).length }));
      return { summary: sum([[d.events.length, '事件數'], [rows[0]!.n, '未開單']]), columns: ['事件狀態', '件數', '百分比'], rows: rows.map(r => [r.k, r.n, `${pct(r.n, d.events.length)}%`]) };
    },
    items(d) {
      const gs = d.emps.filter(e => d.exams.has(e.id)).map(e => d.latestGrades.get(e.id)!);
      const rows = EXAM_ITEMS.map(it => ({ k: it.name, n: gs.filter(g => (g.get(it.code) ?? 0) >= 2).length })).sort((a, b) => b.n - a.n).slice(0, 5);
      return { summary: sum([[gs.length, '受檢人數']]), columns: ['項目', '異常人數（≥2 級）', '受檢人數', '異常率'], rows: rows.map(r => [r.k, r.n, gs.length, `${pct(r.n, gs.length)}%`]) };
    },
    depts(d) {
      const rows = d.depts.map(dp => {
        const es = d.emps.filter(e => e.departmentId === dp.id && d.exams.has(e.id));
        return { k: dp.label, n: es.filter(e => d.exams.get(e.id)![0]!.gradeMax >= 3).length, t: es.length };
      }).filter(r => r.t).sort((a, b) => b.n / b.t - a.n / a.t).slice(0, 5);
      return { summary: sum([[rows.reduce((s, r) => s + r.n, 0), '3–4 級人數']]), columns: ['部門', '3–4 級人數', '受檢人數', '比率'], rows: rows.map(r => [r.k, r.n, r.t, `${pct(r.n, r.t)}%`]) };
    },
    records(d) {
      const rows = ASSIST_CATEGORIES.map(c => ({ k: c, n: d.records.filter(r => r.category === c).length })).sort((a, b) => b.n - a.n);
      return {
        summary: sum([[d.records.length, '協助紀錄'], [d.records.reduce((s, r) => s + r.minutes, 0), '累計費時（分）']]),
        columns: ['協助類別', '次數', '百分比'], rows: rows.map(r => [r.k, r.n, `${pct(r.n, d.records.length)}%`]),
      };
    },
  },
  wl: {
    cvd(d) {
      const ws = d.assessments.map(a => a.evaluation?.cvd).filter((c): c is CvdResult => !!c);
      const bands: [string, (c: CvdResult) => boolean][] = [
        ['極高（>30%）', c => c.risk > 30], ['高度（20–30%）', c => c.risk >= 20 && c.risk <= 30], ['中度（10–20%）', c => c.risk >= 10 && c.risk < 20], ['低度（<10%）', c => c.risk < 10],
      ];
      const rows = bands.map(([k, fn]) => ({ k, n: ws.filter(fn).length }));
      return { summary: sum([[ws.length, '有健檢資料'], [rows[0]!.n + rows[1]!.n, '高度以上']]), columns: ['風險程度', '人數', '百分比'], rows: rows.map(r => [r.k, r.n, `${pct(r.n, ws.length)}%`]) };
    },
    risk(d) {
      const ws = d.assessments.filter(a => a.evaluation?.complete);
      const rows = [0, 1, 2].map(l => ({ k: `${l}：${RISK_LABEL[l]}`, n: ws.filter(a => a.evaluation!.riskLevel === l).length }));
      return { summary: sum([[ws.length, '完成評估'], [rows[1]!.n + rows[2]!.n, '需／建議面談']]), columns: ['風險等級', '人數', '百分比'], rows: rows.map(r => [r.k, r.n, `${pct(r.n, ws.length)}%`]) };
    },
    fatigue(d) {
      const as = d.assessments.filter(a => a.pf != null);
      const lv = (v: number | null, a: number, b: number) => (v == null ? 0 : v > b ? 2 : v >= a ? 1 : 0);
      const names = ['輕微', '中度', '嚴重'];
      const p = [0, 1, 2].map(l => as.filter(a => lv(a.pf, 50, 70) === l).length);
      const w = [0, 1, 2].map(l => as.filter(a => lv(a.wf, 45, 60) === l).length);
      return { summary: sum([[as.length, '完成過勞量表']]), columns: ['等級', '個人相關過勞', '工作相關過勞'], rows: names.map((n, i) => [n, p[i]!, w[i]!]) };
    },
    ot(d) {
      const as = d.assessments.filter(a => a.m1 != null);
      const bands: [string, (m: number) => boolean][] = [['<45 小時', m => m < 45], ['45–80 小時', m => m >= 45 && m <= 80], ['80–100 小時', m => m > 80 && m <= 100], ['>100 小時', m => m > 100]];
      const rows = bands.map(([k, fn]) => ({ k, n: as.filter(a => fn(a.m1!)).length }));
      return {
        summary: sum([[as.length, '完成過負荷評估'], [as.filter(a => a.m1! >= 45).length, '近 1 月加班 ≥45 小時']]),
        columns: ['近 1 個月加班', '人數', '百分比'], rows: rows.map(r => [r.k, r.n, `${pct(r.n, as.length)}%`]),
      };
    },
    pattern(d) {
      const as = d.assessments.filter(a => a.m1 != null);
      const rows = WORK_PATTERNS.map(p => ({ k: p, n: as.filter(a => a.patterns.includes(p)).length })).sort((a, b) => b.n - a.n);
      return { summary: sum([[as.length, '完成評估']]), columns: ['工作型態', '人數', '占比'], rows: rows.map(r => [r.k, r.n, `${pct(r.n, as.length)}%`]) };
    },
    smoke(d) {
      const ids = [...new Set(d.assessments.map(a => a.employeeId))];
      const sm = ids.filter(id => d.exams.get(id)?.[0]?.smoker).length;
      return {
        summary: sum([[ids.length, '評估人數'], [sm, '吸菸人數']]), columns: ['吸菸', '人數', '百分比'],
        rows: [['吸菸', sm, `${pct(sm, ids.length)}%`], ['不吸菸', ids.length - sm, `${pct(ids.length - sm, ids.length)}%`]],
      };
    },
  },
  ergo: {
    part(d) {
      const ss = d.surveys.filter(s => s.status === '已填寫' && s.scores);
      const rows = NMQ_KEYS.map(k => ({ k: nmqPartLabel(k.key), n: ss.filter(s => (s.scores![k.key] ?? 0) >= 3).length })).sort((a, b) => b.n - a.n);
      const suspected = ss.filter(s => Math.max(...Object.values(s.scores!)) >= 3).length;
      return { summary: sum([[ss.length, '已填寫'], [suspected, '疑似有危害人數']]), columns: ['部位', '人數（≥3 分）', '總人數', '百分比'], rows: rows.map(r => [r.k, r.n, ss.length, `${pct(r.n, ss.length)}%`]) };
    },
    dept(d) {
      const ss = d.surveys.filter(s => s.status === '已填寫' && s.scores);
      const deptOf = new Map(d.emps.map(e => [e.id, e.departmentId]));
      const rows = d.depts.map(dp => {
        const ds = ss.filter(s => deptOf.get(s.employeeId) === dp.id);
        return { k: dp.label, n: ds.filter(s => Math.max(...Object.values(s.scores!)) >= 3).length, t: ds.length };
      }).filter(r => r.t).sort((a, b) => b.n / b.t - a.n / a.t);
      return { summary: sum([[ss.length, '已填寫']]), columns: ['部門', '疑似有危害', '已填寫', '比率'], rows: rows.map(r => [r.k, r.n, r.t, `${pct(r.n, r.t)}%`]) };
    },
    fill(d) {
      const deptOf = new Map(d.emps.map(e => [e.id, e.departmentId]));
      const rows = d.depts.map(dp => {
        const ds = d.surveys.filter(s => deptOf.get(s.employeeId) === dp.id);
        return { k: dp.label, n: ds.filter(s => s.status === '已填寫').length, t: ds.length };
      }).filter(r => r.t);
      const filled = d.surveys.filter(s => s.status === '已填寫').length;
      return { summary: sum([[d.surveys.length, '已發送'], [`${pct(filled, d.surveys.length)}%`, '整體填答率']]), columns: ['部門', '已填寫', '已發送', '填答率'], rows: rows.map(r => [r.k, r.n, r.t, `${pct(r.n, r.t)}%`]) };
    },
  },
};

export function isReport(kind: string, type: string): kind is ReportKind {
  return kind in REPORT_TYPES && REPORT_TYPES[kind as ReportKind].some(([t]) => t === type);
}

export function computeReport(kind: ReportKind, type: string, data: Data, deidentified: boolean): Report {
  const title = REPORT_TYPES[kind].find(([t]) => t === type)![1];
  const computed = (COMPUTE[kind] as Record<string, (d: Data) => Computed>)[type]!(data);
  const report: Report = { kind, type, title, ...computed, suppressed: false };
  return deidentified ? suppressSmallCells(report) : report;
}

const isPct = (v: Cell) => typeof v === 'string' && v.endsWith('%');
const isSmall = (v: Cell) => typeof v === 'number' && v > 0 && v < MIN_CELL_SIZE;

/** Hide small counts (and what can be derived from them) for de-identified viewers. */
export function suppressSmallCells(report: Report): Report {
  const rows = report.rows.map(r => [...r]);
  const summary = report.summary.map(s => ({ ...s }));
  const population = summary[0]?.value;
  let hidden = false;
  if (typeof population === 'number' && population > 0 && population < MIN_CELL_SIZE) {
    for (const r of rows) for (let c = 1; c < r.length; c++) r[c] = null;
    for (const s of summary) s.value = null;
    return { ...report, rows, summary, suppressed: true };
  }
  const hide = (r: Cell[], c: number) => { r[c] = null; hidden = true; for (let i = 1; i < r.length; i++) if (isPct(r[i]!)) r[i] = null; };
  for (const r of rows) for (let c = 1; c < r.length; c++) if (isSmall(r[c]!)) hide(r, c);
  // A single hidden cell in a column could be recovered from the other cells and the total: hide the next smallest.
  const columns = rows[0]?.length ?? 0;
  for (let c = 1; c < columns; c++) {
    const nulls = rows.filter(r => r[c] === null && report.rows[rows.indexOf(r)]![c] !== null && typeof report.rows[rows.indexOf(r)]![c] === 'number');
    if (nulls.length !== 1) continue;
    const others = rows.filter(r => typeof r[c] === 'number' && (r[c] as number) > 0).sort((a, b) => (a[c] as number) - (b[c] as number));
    if (others[0]) hide(others[0], c);
  }
  for (const s of summary) if (isSmall(s.value)) { s.value = null; hidden = true; }
  if (summary.some((s, i) => s.value === null && report.summary[i]!.value !== null)) for (const s of summary) if (isPct(s.value)) s.value = null;
  return { ...report, rows, summary, suppressed: hidden };
}
