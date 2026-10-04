/* Pure helpers for the overwork programme (異常工作負荷促發疾病預防) over GET /api/programs/workload/assessments. */
import type { Schemas, StaffMe, TenantPaths } from '@yutis/api-client';
import { ADVICE, cbiScores, CBI_PERSONAL_ITEMS, CBI_WORK_ITEMS, LOAD_LABEL, RISK_LABEL, type Level3 } from '@yutis/domain';
import { canAccess } from '../../nav';
import { matchOrg, NO_ORG_FILTER, type Column, type OrgFilter } from './lists';

export type Assessment = Schemas['AssessmentDto'];
export type Interview = Schemas['InterviewDto'];
export type InterviewAdvice = Schemas['InterviewAdviceDto'];
export type InterviewGuidance = Schemas['InterviewGuidanceDto'];
export type InterviewStatus = Interview['status'];
export type InterviewBody = TenantPaths['/api/programs/workload/assessments/{id}/interview']['put']['requestBody']['content']['application/json'];
export type FatigueBody = TenantPaths['/api/programs/workload/assessments/{id}/fatigue']['put']['requestBody']['content']['application/json'];
export type OverloadBody = TenantPaths['/api/programs/workload/assessments/{id}/overload']['put']['requestBody']['content']['application/json'];

type Who = Pick<StaffMe, 'role' | 'features' | 'dataCategories'>;
/**
 * What the page shows each role, from the controllers' decorators: assessments and interviews are @Clinical();
 * HR reads the work-arrangement advice (GET /api/programs/work-advice). Managers read their notices on /programs/notices.
 */
export type WorkloadView = 'clinical' | 'advice' | 'none';
export function workloadView(me: Who): WorkloadView {
  if (canAccess(me, { feature: 'programs', data: 'health', roles: ['職護', '職醫'] })) return 'clinical';
  if (canAccess(me, { feature: 'programs', data: 'work', roles: ['人資'] })) return 'advice';
  return 'none';
}

/* The evaluation snapshot the API stores (@yutis/domain evaluateWorkload); older rows may carry extra fields. */
export interface CvdSnapshot { items: { name: string; value: string; pts: number }[]; total: number; risk: number; band: Level3; reportDate?: string; extra?: Record<string, string> }
export interface LoadSnapshot { items: { name: string; value: string; lv: Level3 }[]; level: Level3; ot: Level3 }
export interface Evaluation {
  complete: boolean; cvd: CvdSnapshot | null; load: LoadSnapshot | null;
  riskLevel?: Level3; advice?: (typeof ADVICE)[number]; shortM?: string; longM?: string;
}

const level = (v: unknown): v is Level3 => v === 0 || v === 1 || v === 2;

/** The assessment's evaluation, or null when it has not been evaluated or the snapshot is not one we can read. */
export function readEvaluation(a: Pick<Assessment, 'evaluation'>): Evaluation | null {
  const e = a.evaluation as Partial<Evaluation> | null;
  if (!e || typeof e !== 'object') return null;
  const cvd = e.cvd && typeof e.cvd.risk === 'number' && level(e.cvd.band) ? e.cvd : null;
  const load = e.load && level(e.load.level) ? e.load : null;
  return { complete: !!e.complete && !!cvd && !!load && level(e.riskLevel), cvd, load, riskLevel: e.riskLevel, advice: e.advice, shortM: e.shortM, longM: e.longM };
}

const STEP_NAME = { cbi: '過勞量表', overload: '過負荷評估' } as const;
/** Questionnaires the employee (or a nurse) still has to fill in, from the API's own reasons (missing). */
export function missingSteps(a: Pick<Assessment, 'missing'>): ('過勞量表' | '過負荷評估')[] {
  return a.missing.flatMap(m => (m === 'exam' ? [] : [STEP_NAME[m]]));
}
/** Someone to send a fill-in reminder to. */
export const remindable = (a: Pick<Assessment, 'missing'>) => missingSteps(a).length > 0;

export const riskLevelOf = (a: Pick<Assessment, 'riskLevel'>): Level3 | null => (level(a.riskLevel) ? a.riskLevel : null);
/** Why there is no risk level yet: a questionnaire is open, or there was no health check to score. */
export const noRiskReason = (a: Pick<Assessment, 'missing'>) => (remindable(a) ? '問卷未完成' : a.missing.includes('exam') ? '缺健檢資料' : '無法判定');
export const RISK_TONE = ['ok', 'warn', 'bad'] as const;

/** An interview is due at 中度 or 高度 risk until it took place or the employee declined. */
export const interviewDone = (iv: Interview | null) => iv?.status === '已面談' || iv?.status === '拒絕面談';
export const needsInterview = (a: Assessment) => (riskLevelOf(a) ?? 0) >= 1 && !interviewDone(a.interview);

export type RiskFilter = 'all' | '2' | '1' | '0' | 'incomplete';
export interface AssessFilter { batch?: string | null; risk?: RiskFilter; q?: string; org?: OrgFilter }

const matchQ = (a: Assessment, q?: string) => {
  const n = q?.trim().toLowerCase();
  return !n || a.name.toLowerCase().includes(n) || a.empNo.toLowerCase().includes(n);
};

/** Newest batch first, then highest risk, then employee number. */
export function filterAssessments(list: readonly Assessment[], f: AssessFilter): Assessment[] {
  return list
    .filter(a => !f.batch || a.sentOn === f.batch)
    .filter(a => !f.risk || f.risk === 'all' || (f.risk === 'incomplete' ? riskLevelOf(a) == null : riskLevelOf(a) === Number(f.risk)))
    .filter(a => matchQ(a, f.q) && matchOrg(a, f.org ?? NO_ORG_FILTER))
    .sort((a, b) => b.sentOn.localeCompare(a.sentOn) || (riskLevelOf(b) ?? -1) - (riskLevelOf(a) ?? -1) || a.empNo.localeCompare(b.empNo));
}

export type InterviewFilter = 'open' | 'done' | 'all';
/** People who need (or had) a physician interview: open ones first, highest risk first. */
export function interviewRows(list: readonly Assessment[], f: InterviewFilter = 'open', q = '', org: OrgFilter = NO_ORG_FILTER): Assessment[] {
  return list
    .filter(a => (riskLevelOf(a) ?? 0) >= 1 || a.interview)
    .filter(a => f === 'all' || (f === 'done') === interviewDone(a.interview))
    .filter(a => matchQ(a, q) && matchOrg(a, org))
    .sort((a, b) => Number(interviewDone(a.interview)) - Number(interviewDone(b.interview)) || (riskLevelOf(b) ?? 0) - (riskLevelOf(a) ?? 0)
      || b.sentOn.localeCompare(a.sentOn));
}

/** Bulk scheduling only touches people without an interview record, so nothing already written is replaced. */
export const canSchedule = (a: Assessment) => (riskLevelOf(a) ?? 0) >= 1 && !a.interview;

export interface WorkloadCounts { total: number; incomplete: number; high: number; mid: number; low: number; toInterview: number }
export function workloadCounts(list: readonly Assessment[]): WorkloadCounts {
  return {
    total: list.length,
    incomplete: list.filter(a => missingSteps(a).length > 0).length,
    high: list.filter(a => riskLevelOf(a) === 2).length,
    mid: list.filter(a => riskLevelOf(a) === 1).length,
    low: list.filter(a => riskLevelOf(a) === 0).length,
    toInterview: list.filter(needsInterview).length,
  };
}

/** Work restrictions, changed hours or work, or leave were advised (採取措施). */
export function hasMeasures(iv: Pick<Interview, 'workAdvice'> | null): boolean {
  const w = iv?.workAdvice;
  return !!w && (w.restrictions.length > 0 || !!w.adjustHours || !!w.changeWork || (w.fitness !== '' && w.fitness !== '一般工作'));
}

export interface BatchRow { sentOn: string; sent: number; done: number; high: number; mid: number; low: number; interviewed: number; measures: number }
/** 執行紀錄表: one row per sending date. */
export function batchLog(list: readonly Assessment[]): BatchRow[] {
  const by = new Map<string, Assessment[]>();
  for (const a of list) by.set(a.sentOn, [...(by.get(a.sentOn) ?? []), a]);
  return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([sentOn, as]) => ({
    sentOn, sent: as.length,
    done: as.filter(a => riskLevelOf(a) != null).length,
    high: as.filter(a => riskLevelOf(a) === 2).length,
    mid: as.filter(a => riskLevelOf(a) === 1).length,
    low: as.filter(a => riskLevelOf(a) === 0).length,
    interviewed: as.filter(a => a.interview?.status === '已面談').length,
    measures: as.filter(a => hasMeasures(a.interview)).length,
  }));
}

/** Employees who still have an assessment with a questionnaire open; a new one would duplicate it. */
export function openAssessmentEmployees(list: readonly Assessment[]): Set<string> {
  return new Set(list.filter(a => missingSteps(a).length > 0).map(a => a.employeeId));
}

/* Copenhagen Burnout Inventory (Taiwan workplace version), worded as in the prototype; answers are option indexes 0–4. */
export const CBI_FREQ = ['總是', '常常', '有時候', '不常', '從未或幾乎從未'] as const;
export const CBI_DEGREE = ['很嚴重', '嚴重', '有一些', '輕微', '非常輕微'] as const;
export const CBI_PERSONAL = ['你常覺得疲勞嗎？', '你常覺得身體上體力透支嗎？', '你常覺得情緒上心力交瘁嗎？', '你常會覺得「我快要撐不下去了」嗎？', '你常覺得精疲力竭嗎？', '你常常覺得虛弱，好像快要生病了嗎？'];
export const CBI_WORK: { q: string; scale: readonly string[] }[] = [
  { q: '你的工作會令人情緒上心力交瘁嗎？', scale: CBI_DEGREE },
  { q: '你的工作會讓你覺得快要累垮了嗎？', scale: CBI_DEGREE },
  { q: '你的工作會讓你覺得挫折嗎？', scale: CBI_DEGREE },
  { q: '工作一整天之後，你覺得精疲力竭嗎？', scale: CBI_FREQ },
  { q: '上班之前只要想到又要工作一整天，你就覺得沒力嗎？', scale: CBI_FREQ },
  { q: '上班時你會覺得每一刻都很難熬嗎？', scale: CBI_FREQ },
  { q: '不工作的時候，你有足夠的精力陪朋友或家人嗎？', scale: CBI_FREQ },
];

export interface CbiDraft { p: (number | null)[]; w: (number | null)[] }
export const emptyCbi = (): CbiDraft => ({ p: Array<null>(CBI_PERSONAL_ITEMS).fill(null), w: Array<null>(CBI_WORK_ITEMS).fill(null) });
/** The saved answers to start from when the sheet is filled again; a blank sheet when only scores were entered. */
export function cbiDraftFrom(answers: Assessment['cbiAnswers']): CbiDraft {
  const fit = (xs: readonly number[] | undefined, n: number) => Array.from({ length: n }, (_, i) => (typeof xs?.[i] === 'number' ? xs[i] : null));
  return answers ? { p: fit(answers.p, CBI_PERSONAL_ITEMS), w: fit(answers.w, CBI_WORK_ITEMS) } : emptyCbi();
}
export const cbiAnswered = (d: CbiDraft) => [...d.p, ...d.w].filter(x => x != null).length;
/** Scores once all 13 questions are answered. */
export function cbiResult(d: CbiDraft): { pf: number; wf: number } | null {
  if (cbiAnswered(d) < CBI_PERSONAL_ITEMS + CBI_WORK_ITEMS) return null;
  return cbiScores({ p: d.p as number[], w: d.w as number[] });
}
/** Burnout level wording and thresholds as in @yutis/domain loadEval. */
export function burnoutLabel(kind: 'personal' | 'work', score: number): '嚴重' | '中度' | '輕微' {
  const [high, mid] = kind === 'personal' ? [70, 50] : [60, 45];
  return score > high ? '嚴重' : score >= mid ? '中度' : '輕微';
}

/*
 * Interview form, worded as the prototype's 面談指導結果 and 採取措施建議. These answers are the API's enums; 工作區分,
 * 調整或縮短工作時間 and 變更工作 come from GET /api/programs/options.
 */
export const FATIGUE = ['無', '輕度', '中度', '重度'] as const;
export const MENTAL_CONCERN = ['有', '無'] as const;
export const DIAGNOSIS = ['無異常', '需觀察或進一步追蹤檢查', '需進行醫療'] as const;
export const GUIDANCE = ['不需指導', '需健康指導', '需醫療指導'] as const;
export const INTERVIEW_STATUSES: InterviewStatus[] = ['待安排', '已安排', '已面談', '拒絕面談'];

type G = InterviewGuidance;
export interface InterviewDraft {
  status: InterviewStatus; interviewedOn: string; doctorUserId: string | null;
  fatigue: G['fatigue']; mentalConcern: G['mentalConcern']; diagnosis: G['diagnosis']; guidance: G['guidance']; needMeasure: boolean | null;
  seeDoctor: string; special: string;
  fitness: string; adjustHours: string; changeWork: string; period: string; restrictions: string[]; suggestion: string;
  notes: string;
  /** 是否安排下次面談: null until answered. */
  nextInterview: boolean | null; nextOn: string;
}

/** The 下次面談 column: the date, or whether one is planned at all. */
export function nextInterviewLabel(iv: Pick<Interview, 'nextInterview' | 'nextOn'> | null): string {
  if (iv?.nextOn) return iv.nextOn.replaceAll('-', '/');
  return iv?.nextInterview === false ? '不安排' : iv?.nextInterview ? '日期未定' : '—';
}

/** The form from the full interview (GET /assessments/{id}, which carries the guidance and notes the list leaves out). */
export function interviewDraft(iv: Interview | null, defaults: { today: string; doctorUserId: string | null }): InterviewDraft {
  const w = iv?.workAdvice;
  const g = iv?.guidance;
  return {
    status: iv?.status ?? '已面談', interviewedOn: iv?.interviewedOn ?? defaults.today, doctorUserId: iv?.doctorUserId ?? defaults.doctorUserId,
    fatigue: g?.fatigue ?? null, mentalConcern: g?.mentalConcern ?? null, diagnosis: g?.diagnosis ?? null, guidance: g?.guidance ?? null,
    needMeasure: g?.needMeasure ?? null, seeDoctor: g?.seeDoctor ?? '', special: g?.special ?? '',
    fitness: w?.fitness ?? '', adjustHours: w?.adjustHours ?? '', changeWork: w?.changeWork ?? '', period: w?.period ?? '',
    restrictions: w?.restrictions ?? [], suggestion: w?.suggestion ?? '',
    // Interviews saved before 是否安排下次面談 existed may have a date without the answer: a date means yes.
    notes: iv?.notes ?? '', nextInterview: iv?.nextInterview ?? (iv?.nextOn ? true : null), nextOn: iv?.nextOn ?? '',
  };
}

/** Problems that stop the interview from being saved, in plain words. A held interview needs what the prototype asks for. */
export function interviewProblems(d: InterviewDraft): string[] {
  const out: string[] = [];
  if ((d.status === '已安排' || d.status === '已面談') && !d.interviewedOn) out.push(d.status === '已安排' ? '請填預定面談日期' : '請填面談日期');
  if (d.status === '已面談') {
    if (!d.fatigue) out.push('請選擇疲勞累積狀況');
    if (!d.diagnosis) out.push('請選擇診斷區分');
    if (!d.fitness) out.push('請選擇工作區分');
  }
  if (d.nextInterview !== false && d.nextOn && d.interviewedOn && d.nextOn < d.interviewedOn) out.push('下次面談日期不能早於面談日期');
  return out;
}

const blank = (o: Record<string, unknown>) => Object.values(o).every(v => v == null || v === '' || (Array.isArray(v) && v.length === 0));

/** The PUT body. The form starts from the full record, so every field is sent; an empty section is sent as null. */
export function interviewBody(d: InterviewDraft): InterviewBody {
  const workAdvice = {
    fitness: d.fitness, restrictions: d.restrictions.map(r => r.trim()).filter(Boolean), suggestion: d.suggestion.trim(),
    adjustHours: d.adjustHours, changeWork: d.changeWork, period: d.period.trim(),
  };
  const guidance = {
    fatigue: d.fatigue, mentalConcern: d.mentalConcern, diagnosis: d.diagnosis, guidance: d.guidance, needMeasure: d.needMeasure,
    seeDoctor: d.seeDoctor.trim(), special: d.special.trim(),
  };
  return {
    status: d.status, interviewedOn: d.interviewedOn || null, doctorUserId: d.doctorUserId,
    workAdvice: blank(workAdvice) ? null : workAdvice, guidance: blank(guidance) ? null : guidance,
    notes: d.notes.trim() || null, nextInterview: d.nextInterview, nextOn: d.nextInterview === false ? null : d.nextOn || null,
  };
}

/*
 * After an interview save. InterviewSavedDto.emailed is true only when this save sent the employee the interview date
 * and the mail service really sends; otherwise nothing is said about email.
 */
const EMAILED_DATE = '已寄面談日期通知給員工。';

export function interviewSavedText(name: string, status: InterviewStatus | undefined, emailed: boolean): string {
  return `已儲存 ${name} 的面談：${status ?? ''}。${emailed ? EMAILED_DATE : ''}`;
}

/** After 安排面談 for several people: who was saved, who was not, and who was emailed the date (by name). */
export function scheduledText(saved: number, failed: number, emailed: readonly string[]): string {
  const done = failed ? `已安排 ${saved} 人，${failed} 人沒有儲存成功，請再試一次。` : `已安排 ${saved} 人的面談。`;
  if (!emailed.length) return done;
  return `${done}已寄面談日期通知給${emailed.slice(0, 10).join('、')}${emailed.length > 10 ? ` 等 ${emailed.length} 人` : ''}。`;
}

/** The 工作安排 cell: 工作區分 and the measures under it. */
export function adviceSummary(w: InterviewAdvice | null): { fitness: string; measures: string } | null {
  if (!w) return null;
  const measures = new Set([w.adjustHours, w.changeWork, ...w.restrictions].filter(Boolean));
  return { fitness: w.fitness, measures: [...measures, w.period && `期間 ${w.period}`].filter(Boolean).join('、') };
}

/* ---------- CSV export: the prototype's columns, from the list on screen ---------- */

const fatigueFill = (a: Assessment) => (a.fatigueBy === 'nurse' ? '職護代填' : a.fatigueBy === 'self' ? '員工自填' : '');

export const ASSESS_COLUMNS: Column<Assessment>[] = [
  { h: '評估日期', v: a => a.sentOn },
  { h: '工號', v: a => a.empNo },
  { h: '姓名', v: a => a.name },
  { h: '廠區', v: a => a.site },
  { h: '部門', v: a => a.department },
  { h: '個人相關過勞', v: a => a.personalBurnout },
  { h: '工作相關過勞', v: a => a.workBurnout },
  { h: '過勞量表填寫', v: fatigueFill },
  { h: '近1月加班', v: a => a.overtime1m },
  { h: '近2-6月平均加班', v: a => a.overtime6mAvg },
  { h: '十年心血管風險%', v: a => readEvaluation(a)?.cvd?.risk },
  { h: '工作負荷等級', v: a => { const l = readEvaluation(a)?.load?.level; return l == null ? '' : LOAD_LABEL[l]; } },
  { h: '風險等級', v: a => { const l = riskLevelOf(a); return l == null ? noRiskReason(a) : RISK_LABEL[l]; } },
  { h: '面談建議', v: a => { const e = readEvaluation(a); return e?.complete ? e.advice : ''; } },
  { h: '面談狀態', v: a => a.interview?.status ?? '' },
  { h: '催填次數', v: a => a.reminders },
];

