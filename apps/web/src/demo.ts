/*
 * Demo data until the API is ready. Every person, company and value here is fictional.
 * Shapes are placeholders; they will be replaced by the API contract from the backend thread.
 */
import type { Me, TenantInfo } from '@yutis/api-client';
import { CASE_STATUSES, gradeReport, type CaseStatus, type EventType, type ExamValues, type IsoDate, type Sex } from '@yutis/domain';

export const TODAY: IsoDate = '2026-10-03';

export const TENANT: TenantInfo = {
  id: 'demo', name: '示範科技股份有限公司', subdomain: 'demo', logoUrl: null,
  loginMethods: ['sso', 'sms'], modules: ['ergo', 'workload', 'maternal', 'violence', 'service'],
};

export const CURRENT_STAFF: Me = { id: 'u-nurse-1', name: '張雅婷', role: '職護', siteIds: ['S1'] };

export interface Employee {
  id: string;
  name: string;
  sex: Sex;
  birth: IsoDate;
  dept: string;
  title: string;
  shift: string;
  /** Shown masked by default; revealing it is an audited action in production. */
  nationalIdMasked: string;
  exam: { date: IsoDate; values: ExamValues };
}

export interface Case {
  id: string;
  employeeId: string;
  events: EventType[];
  summary: string;
  status: CaseStatus;
  owner: string | null;
  lastAction: string | null;
  nextFollowUp: IsoDate | null;
}

export const EMPLOYEES: Employee[] = [
  { id: 'E10234', name: '林志明', sex: '男', birth: '1979-05-12', dept: '製造一課', title: '技術員', shift: '常日班', nationalIdMasked: 'A1•••••789',
    exam: { date: '2026-09-18', values: { SBP: 182, DBP: 112, BMI: 27.1, waist: 94, GLU: 104, TC: 236, TG: 180, HDL: 38, LDL: 162, ALT: 28, CR: 1.0, HB: 14.8, UPRO: '-' } } },
  { id: 'E10418', name: '陳怡君', sex: '女', birth: '1988-11-03', dept: '品保課', title: '品管工程師', shift: '常日班', nationalIdMasked: 'B2•••••114',
    exam: { date: '2026-09-18', values: { SBP: 118, DBP: 76, BMI: 21.4, waist: 72, GLU: 88, TC: 182, TG: 90, HDL: 62, LDL: 104, ALT: 18, CR: 0.7, HB: 12.9, UPRO: '-' } } },
  { id: 'E10077', name: '王俊傑', sex: '男', birth: '1972-02-27', dept: '設備課', title: '設備工程師', shift: '輪班', nationalIdMasked: 'F1•••••502',
    exam: { date: '2026-09-18', values: { SBP: 156, DBP: 98, BMI: 29.3, waist: 99, GLU: 118, TC: 252, TG: 210, HDL: 36, LDL: 171, ALT: 52, CR: 1.1, HB: 15.2, UPRO: '±' } } },
  { id: 'E10552', name: '黃淑芬', sex: '女', birth: '1993-07-21', dept: '人資課', title: '人資專員', shift: '常日班', nationalIdMasked: 'H2•••••367',
    exam: { date: '2026-09-18', values: { SBP: 112, DBP: 70, BMI: 22.8, waist: 76, GLU: 92, TC: 196, TG: 110, HDL: 58, LDL: 118, ALT: 15, CR: 0.6, HB: 11.4, UPRO: '-' } } },
  { id: 'E10129', name: '吳建宏', sex: '男', birth: '1984-12-09', dept: '製造二課', title: '組長', shift: '輪班', nationalIdMasked: 'E1•••••821',
    exam: { date: '2026-09-18', values: { SBP: 134, DBP: 86, BMI: 26.0, waist: 91, GLU: 132, TC: 205, TG: 168, HDL: 41, LDL: 128, ALT: 36, CR: 1.0, HB: 15.0, UPRO: '-' } } },
  { id: 'E10301', name: '蔡明哲', sex: '男', birth: '1981-04-30', dept: '製造二課', title: '技術員', shift: '輪班', nationalIdMasked: 'D1•••••045',
    exam: { date: '2026-09-18', values: { SBP: 138, DBP: 88, BMI: 25.2, waist: 92, GLU: 99, TC: 248, TG: 160, HDL: 39, LDL: 166, ALT: 30, CR: 1.1, HB: 14.6, UPRO: '-' } } },
  { id: 'E10620', name: '鄭佩珊', sex: '女', birth: '1986-09-14', dept: '研發部', title: '研發工程師', shift: '常日班', nationalIdMasked: 'A2•••••936',
    exam: { date: '2026-09-18', values: { SBP: 126, DBP: 82, BMI: 24.6, waist: 81, GLU: 138, TC: 210, TG: 172, HDL: 52, LDL: 126, ALT: 24, CR: 0.8, HB: 12.6, UPRO: '-' } } },
];

export const CASES: Case[] = [
  { id: 'C2026-041', employeeId: 'E10234', events: ['hc', 'wl'], summary: '血壓 4 級、中負荷', status: '未開單', owner: null, lastAction: null, nextFollowUp: null },
  { id: 'C2026-038', employeeId: 'E10418', events: ['er'], summary: 'NMQ 右手腕 4 分', status: '起單', owner: '張雅婷', lastAction: '09/26 起單', nextFollowUp: '2026-10-09' },
  { id: 'C2026-031', employeeId: 'E10077', events: ['hc', 'wl'], summary: 'LDL 3 級、高風險 × 高負荷', status: '處理中', owner: '李醫師', lastAction: '09/30 醫師面談', nextFollowUp: '2026-10-30' },
  { id: 'C2026-029', employeeId: 'E10552', events: ['mat'], summary: '妊娠 14 週', status: '處理中', owner: '張雅婷', lastAction: '09/22 危害評估', nextFollowUp: '2026-10-09' },
  { id: 'C2026-022', employeeId: 'E10129', events: ['hc'], summary: '空腹血糖 3 級', status: '結案', owner: '張雅婷', lastAction: '09/15 衛教後複檢正常', nextFollowUp: null },
  { id: 'C2026-035', employeeId: 'E10301', events: ['hc', 'wl'], summary: 'LDL 3 級、高負荷', status: '起單', owner: '張雅婷', lastAction: '09/18 衛教', nextFollowUp: '2026-10-18' },
  { id: 'C2026-027', employeeId: 'E10620', events: ['hc', 'wl'], summary: '血糖 3 級、高負荷', status: '處理中', owner: '張雅婷', lastAction: '08/22 轉介', nextFollowUp: '2026-10-22' },
];

export const MONTHLY_NEW_EVENTS = [
  { month: '11月', 健檢: 9, 問卷: 4 }, { month: '12月', 健檢: 7, 問卷: 3 }, { month: '1月', 健檢: 6, 問卷: 2 },
  { month: '2月', 健檢: 8, 問卷: 7 }, { month: '3月', 健檢: 6, 問卷: 6 }, { month: '4月', 健檢: 20, 問卷: 3 },
  { month: '5月', 健檢: 12, 問卷: 4 }, { month: '6月', 健檢: 7, 問卷: 4 }, { month: '7月', 健檢: 6, 問卷: 8 },
  { month: '8月', 健檢: 5, 問卷: 9 }, { month: '9月', 健檢: 4, 問卷: 5 }, { month: '10月', 健檢: 4, 問卷: 4 },
];

export const WEEK_SCHEDULE = [
  { day: '週一', date: 6, title: 'NMQ 第二次催填', detail: '製造一課、製造二課 · 42 人' },
  { day: '週三', date: 8, title: '李醫師駐廠面談', detail: '09:00–12:00 · 5 人' },
  { day: '週四', date: 9, title: '母性面談 黃淑芬', detail: '14:00 · 保健室' },
  { day: '週五', date: 10, title: '附表八 9 月紀錄簽核', detail: '截止日' },
];

export const employeeById = (id: string) => EMPLOYEES.find(e => e.id === id);

export const gradeOf = (e: Employee) => gradeReport(e.exam.values, e.sex);

/** Count of cases per status, in the domain's status order. */
export function countByStatus(cases: readonly Case[]): Record<CaseStatus, number> {
  const out = Object.fromEntries(CASE_STATUSES.map(s => [s, 0])) as Record<CaseStatus, number>;
  for (const c of cases) out[c.status] += 1;
  return out;
}

/** Cases matching every selected event type (the prototype's intersection filter). */
export function filterCasesByEvents(cases: readonly Case[], selected: readonly EventType[]): Case[] {
  return cases.filter(c => selected.every(t => c.events.includes(t)));
}
