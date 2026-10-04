/* Pure helpers for the overwork programme (異常工作負荷促發疾病預防) over GET /api/programs/workload/assessments. */
import type { Schemas, StaffMe, TenantPaths } from '@yutis/api-client';
import { ADVICE, cbiScores, CBI_PERSONAL_ITEMS, CBI_WORK_ITEMS, type Level3 } from '@yutis/domain';
import { canAccess } from '../../nav';

export type Assessment = Schemas['AssessmentDto'];
export type Interview = Schemas['InterviewDto'];
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

/** Questionnaires the employee (or a nurse) still has to fill in. */
export function missingSteps(a: Pick<Assessment, 'personalBurnout' | 'overtime1m'>): ('過勞量表' | '過負荷評估')[] {
  return [...(a.personalBurnout == null ? ['過勞量表' as const] : []), ...(a.overtime1m == null ? ['過負荷評估' as const] : [])];
}

export const riskLevelOf = (a: Pick<Assessment, 'riskLevel'>): Level3 | null => (level(a.riskLevel) ? a.riskLevel : null);
/** Why there is no risk level yet: a questionnaire is open, or the health check lacks the values the score needs. */
export const noRiskReason = (a: Pick<Assessment, 'personalBurnout' | 'overtime1m'>) => (missingSteps(a).length ? '問卷未完成' : '無法判定');
export const RISK_TONE = ['ok', 'warn', 'bad'] as const;

/** An interview is due at 中度 or 高度 risk until it took place or the employee declined. */
export const interviewDone = (iv: Interview | null) => iv?.status === '已面談' || iv?.status === '拒絕面談';
export const needsInterview = (a: Assessment) => (riskLevelOf(a) ?? 0) >= 1 && !interviewDone(a.interview);

export type RiskFilter = 'all' | '2' | '1' | '0' | 'incomplete';
export interface AssessFilter { batch?: string | null; risk?: RiskFilter; q?: string }

const matchQ = (a: Assessment, q?: string) => {
  const n = q?.trim().toLowerCase();
  return !n || a.name.toLowerCase().includes(n) || a.empNo.toLowerCase().includes(n);
};

/** Newest batch first, then highest risk, then employee number. */
export function filterAssessments(list: readonly Assessment[], f: AssessFilter): Assessment[] {
  return list
    .filter(a => !f.batch || a.sentOn === f.batch)
    .filter(a => !f.risk || f.risk === 'all' || (f.risk === 'incomplete' ? riskLevelOf(a) == null : riskLevelOf(a) === Number(f.risk)))
    .filter(a => matchQ(a, f.q))
    .sort((a, b) => b.sentOn.localeCompare(a.sentOn) || (riskLevelOf(b) ?? -1) - (riskLevelOf(a) ?? -1) || a.empNo.localeCompare(b.empNo));
}

export type InterviewFilter = 'open' | 'done' | 'all';
/** People who need (or had) a physician interview: open ones first, highest risk first. */
export function interviewRows(list: readonly Assessment[], f: InterviewFilter = 'open', q = ''): Assessment[] {
  return list
    .filter(a => (riskLevelOf(a) ?? 0) >= 1 || a.interview)
    .filter(a => f === 'all' || (f === 'done') === interviewDone(a.interview))
    .filter(a => matchQ(a, q))
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

/** Work restrictions or leave were advised (採取措施). */
export function hasMeasures(iv: Interview | null): boolean {
  const w = readAdvice(iv);
  return !!w && (w.restrictions.length > 0 || (w.fitness !== '' && w.fitness !== '一般工作'));
}

export interface WorkAdvice { fitness: string; restrictions: string[]; suggestion: string }
export function readAdvice(iv: Pick<Interview, 'workAdvice'> | null): WorkAdvice | null {
  const w = iv?.workAdvice as Partial<WorkAdvice> | null | undefined;
  if (!w) return null;
  return { fitness: typeof w.fitness === 'string' ? w.fitness : '', restrictions: Array.isArray(w.restrictions) ? w.restrictions.filter(x => typeof x === 'string') : [], suggestion: typeof w.suggestion === 'string' ? w.suggestion : '' };
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

/* Interview form. Fitness and restriction wording follow the prototype's 工作區分 and 採取措施建議. */
export const FITNESS = ['一般工作', '工作限制', '需休假'] as const;
export const RESTRICTIONS = ['縮短工時', '限制加班', '禁止加班', '調整上下班時間', '調整為常日班', '變更作業內容', '變更工作場所', '暫停出差'];
export const INTERVIEW_STATUSES: InterviewStatus[] = ['待安排', '已安排', '已面談', '拒絕面談'];

export interface InterviewDraft {
  status: InterviewStatus; interviewedOn: string; doctorUserId: string | null;
  fitness: string; restrictions: string[]; suggestion: string; notes: string; nextOn: string;
}

export function interviewDraft(iv: Interview | null, defaults: { today: string; doctorUserId: string | null }): InterviewDraft {
  const w = readAdvice(iv);
  return {
    status: iv?.status ?? '已面談', interviewedOn: iv?.interviewedOn ?? defaults.today, doctorUserId: iv?.doctorUserId ?? defaults.doctorUserId,
    fitness: w?.fitness ?? '', restrictions: w?.restrictions ?? [], suggestion: w?.suggestion ?? '', notes: '', nextOn: iv?.nextOn ?? '',
  };
}

/** Problems that stop the interview from being saved, in plain words. */
export function interviewProblems(d: InterviewDraft): string[] {
  const out: string[] = [];
  if ((d.status === '已安排' || d.status === '已面談') && !d.interviewedOn) out.push(d.status === '已安排' ? '請填預定面談日期' : '請填面談日期');
  if (d.status === '已面談' && !d.fitness) out.push('請選擇工作區分');
  if (d.nextOn && d.interviewedOn && d.nextOn < d.interviewedOn) out.push('下次面談日期不能早於面談日期');
  return out;
}

/** The PUT body. The API replaces the whole interview, so every field is sent; empty advice is sent as null. */
export function interviewBody(d: InterviewDraft): InterviewBody {
  const restrictions = d.restrictions.map(r => r.trim()).filter(Boolean);
  const advice = d.fitness || restrictions.length || d.suggestion.trim() ? { fitness: d.fitness, restrictions, suggestion: d.suggestion.trim() } : null;
  return {
    status: d.status, interviewedOn: d.interviewedOn || null, doctorUserId: d.doctorUserId, workAdvice: advice,
    notes: d.notes.trim() || null, nextOn: d.nextOn || null,
  };
}
